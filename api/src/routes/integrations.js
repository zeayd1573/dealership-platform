// Stock-feed connections. Mounted at /api/integrations. Admin only.
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth.js';
import { PROVIDERS, getIntegration, shapeIntegration, encryptCredential, runSync, purgeProvider } from '../lib/integrations.js';

const integrations = new Hono();
integrations.use('*', requireAuth());

const known = p => Object.prototype.hasOwnProperty.call(PROVIDERS, p);

// GET /api/integrations — what is connected, and what could be
integrations.get('/', async c => {
  const dealerId = c.get('dealerId');
  const { results } = await c.env.DB.prepare('SELECT * FROM dealer_integrations WHERE dealer_id = ? ORDER BY provider').bind(dealerId).all();
  return c.json({
    available: Object.entries(PROVIDERS).map(([id, p]) => ({ id, label: p.label })),
    connected: results.map(shapeIntegration)
  });
});

// GET /api/integrations/:provider/runs — the last few syncs, so "why did that car vanish" has an answer
integrations.get('/:provider/runs', async c => {
  const { results } = await c.env.DB.prepare('SELECT * FROM sync_runs WHERE dealer_id = ? AND provider = ? ORDER BY started_at DESC LIMIT 20')
    .bind(c.get('dealerId'), c.req.param('provider')).all();
  return c.json(results);
});

// PUT /api/integrations/:provider { account_ref, credential, approved_domain, auto_sync }
// The credential is encrypted before it is stored and is never read back out.
integrations.put('/:provider', async c => {
  const provider = c.req.param('provider');
  if (!known(provider)) return c.json({ error: `Unknown provider: ${provider}` }, 400);
  const dealerId = c.get('dealerId');
  const body = await c.req.json().catch(() => ({}));

  const existing = await getIntegration(c.env, dealerId, provider);
  const credential = 'credential' in body && body.credential
    ? await encryptCredential(c.env, String(body.credential))
    : (existing ? existing.credential : null);

  await c.env.DB.prepare(`
    INSERT INTO dealer_integrations (dealer_id, provider, account_ref, credential, approved_domain, auto_sync, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(dealer_id, provider) DO UPDATE SET
      account_ref = excluded.account_ref,
      credential = excluded.credential,
      approved_domain = excluded.approved_domain,
      auto_sync = excluded.auto_sync,
      status = CASE WHEN dealer_integrations.status = 'revoked' THEN 'pending' ELSE dealer_integrations.status END,
      updated_at = datetime('now')`)
    .bind(dealerId, provider,
      body.account_ref ?? existing?.account_ref ?? null,
      credential,
      body.approved_domain ?? existing?.approved_domain ?? null,
      body.auto_sync === false ? 0 : 1,
      existing?.status || 'pending')
    .run();

  return c.json(shapeIntegration(await getIntegration(c.env, dealerId, provider)));
});

// POST /api/integrations/:provider/sync { dryRun } — run it now
integrations.post('/:provider/sync', async c => {
  const provider = c.req.param('provider');
  if (!known(provider)) return c.json({ error: `Unknown provider: ${provider}` }, 400);
  const dealerId = c.get('dealerId');
  const { dryRun } = await c.req.json().catch(() => ({}));
  try {
    return c.json(await runSync(c.env, dealerId, provider, { dryRun: !!dryRun }));
  } catch (err) {
    await c.env.DB.prepare("UPDATE dealer_integrations SET last_error = ?, updated_at = datetime('now') WHERE dealer_id = ? AND provider = ?")
      .bind(String(err.message).slice(0, 300), dealerId, provider).run().catch(() => {});
    await c.env.DB.prepare('INSERT INTO sync_runs (dealer_id, provider, finished_at, ok, message) VALUES (?, ?, datetime(\'now\'), 0, ?)')
      .bind(dealerId, provider, String(err.message).slice(0, 300)).run().catch(() => {});
    return c.json({ error: err.message }, 502);
  }
});

// DELETE /api/integrations/:provider?purge=1
// Without purge the connection is switched off and the cars stay.
// With purge every car that came from this provider is deleted, photos included,
// which is what the DoneDeal policy requires when a dealer withdraws consent.
integrations.delete('/:provider', async c => {
  const provider = c.req.param('provider');
  const dealerId = c.get('dealerId');
  if (c.req.query('purge') === '1') {
    const out = await purgeProvider(c.env, dealerId, provider);
    return c.json({ success: true, purged: true, ...out });
  }
  await c.env.DB.prepare("UPDATE dealer_integrations SET status = 'paused', auto_sync = 0, updated_at = datetime('now') WHERE dealer_id = ? AND provider = ?")
    .bind(dealerId, provider).run();
  return c.json({ success: true, purged: false });
});

export default integrations;
