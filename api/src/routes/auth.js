import { Hono } from 'hono';
import { verifyPassword, issueToken, bootstrapAdmin, requireAuth, hashPassword, randomSalt,
         clientIp, checkLockout, recordFailure, clearFailures } from '../lib/auth.js';

const auth = new Hono();

// POST /api/auth/login { username, password }
auth.post('/login', async c => {
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: 'username and password are required' }, 400);

  const ip = clientIp(c);
  const lock = await checkLockout(c.env, ip, username);
  if (lock.locked) {
    return c.json({ error: `Too many failed attempts. Try again in ${lock.retryAfterMin} minute${lock.retryAfterMin === 1 ? '' : 's'}.` }, 429);
  }

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user) user = await bootstrapAdmin(c.env, username, password);
  if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
    await recordFailure(c.env, ip, username);
    return c.json({ error: 'Incorrect username or password' }, 401);
  }
  await clearFailures(c.env, ip, username);
  const token = await issueToken(user, c.env.JWT_SECRET);
  return c.json({ token, user: { id: user.id, username: user.username, role: user.role, dealer_id: user.dealer_id } });
});

// GET /api/auth/me
auth.get('/me', requireAuth(), c => c.json({ user: c.get('user') }));

// POST /api/auth/password { current, next }
auth.post('/password', requireAuth(), async c => {
  const { current, next } = await c.req.json().catch(() => ({}));
  if (!current || !next || String(next).length < 8) return c.json({ error: 'New password must be at least 8 characters' }, 400);
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(c.get('user').sub).first();
  if (!user || !(await verifyPassword(current, user.salt, user.password_hash))) return c.json({ error: 'Current password is incorrect' }, 401);
  const salt = randomSalt();
  // Bumping token_version signs out every existing session, which is the point of
  // changing a password you think somebody else has.
  const updated = await c.env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, token_version = token_version + 1 WHERE id = ? RETURNING *')
    .bind(await hashPassword(next, salt), salt, user.id).first();
  // Hand back a fresh token so the person who just changed it is not signed out.
  return c.json({ success: true, token: await issueToken(updated, c.env.JWT_SECRET) });
});

export default auth;
