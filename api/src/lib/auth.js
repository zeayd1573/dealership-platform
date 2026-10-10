// Password hashing (PBKDF2 via Web Crypto) and JWT helpers.
import { sign, verify } from 'hono/jwt';

const enc = new TextEncoder();
const toB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

export function randomSalt() {
  return toB64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' }, key, 256);
  return toB64(bits);
}

export async function verifyPassword(password, salt, hash) {
  const h = await hashPassword(password, salt);
  if (h.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export async function issueToken(user, secret) {
  const now = Math.floor(Date.now() / 1000);
  return sign({
    sub: user.id, dealer_id: user.dealer_id, username: user.username, role: user.role,
    tv: user.token_version ?? 1,        // changing the password bumps this and kills old tokens
    iat: now, exp: now + 60 * 60 * 24 * 7
  }, secret, 'HS256');
}

/** Hono middleware: requires a valid Bearer token; sets c.get('user'). */
export function requireAuth() {
  return async (c, next) => {
    const h = c.req.header('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return c.json({ error: 'Unauthorised' }, 401);
    let payload;
    try {
      payload = await verify(token, c.env.JWT_SECRET, 'HS256');
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
    // A token issued before the last password change is no longer accepted.
    const row = await c.env.DB.prepare('SELECT token_version FROM users WHERE id = ?').bind(payload.sub).first();
    if (!row || (payload.tv ?? 1) !== row.token_version) {
      return c.json({ error: 'Session ended. Please sign in again.' }, 401);
    }
    c.set('user', payload);
    c.set('dealerId', payload.dealer_id);
    await next();
  };
}

/**
 * Bootstrap: if no users exist yet and the credentials match ADMIN_USER/ADMIN_PASS,
 * create that admin for the default dealer. Lets a fresh deploy log in without a seed step.
 */
export async function bootstrapAdmin(env, username, password) {
  if (!env.ADMIN_USER || !env.ADMIN_PASS) return null;
  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) return null;
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first('n');
  if (count > 0) return null;
  const dealer = await env.DB.prepare('SELECT id FROM dealers WHERE slug = ?').bind(env.DEFAULT_DEALER_SLUG || 'm6motors').first();
  if (!dealer) return null;
  const salt = randomSalt();
  const password_hash = await hashPassword(password, salt);
  const res = await env.DB.prepare('INSERT INTO users (dealer_id, username, password_hash, salt, role) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(dealer.id, username, password_hash, salt, 'admin').first();
  return res;
}

/* ── Login throttling ─────────────────────────────────────────────────────
   Counted per IP and username. Without this a single known username can be
   guessed at indefinitely; the live site took eight attempts in under two
   seconds with no resistance at all.                                       */

const MAX_FAILS = 8;            // before a lockout starts
const WINDOW_MIN = 15;          // failures older than this are forgotten
const LOCK_MIN = 15;            // how long a lockout lasts

const attemptId = (ip, username) => `${ip}|${String(username || '').toLowerCase()}`.slice(0, 200);

export function clientIp(c) {
  return c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
}

/** Returns { locked, retryAfterMin } without recording anything. */
export async function checkLockout(env, ip, username) {
  const row = await env.DB.prepare('SELECT fails, first_at, locked_until FROM login_attempts WHERE id = ?')
    .bind(attemptId(ip, username)).first();
  if (!row || !row.locked_until) return { locked: false };
  const until = new Date(row.locked_until.replace(' ', 'T') + 'Z');
  if (until <= new Date()) return { locked: false };
  return { locked: true, retryAfterMin: Math.max(1, Math.ceil((until - new Date()) / 60000)) };
}

export async function recordFailure(env, ip, username) {
  const id = attemptId(ip, username);
  await env.DB.prepare(`
    INSERT INTO login_attempts (id, fails, first_at) VALUES (?, 1, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      fails = CASE WHEN login_attempts.first_at < datetime('now', '-${WINDOW_MIN} minutes') THEN 1 ELSE login_attempts.fails + 1 END,
      first_at = CASE WHEN login_attempts.first_at < datetime('now', '-${WINDOW_MIN} minutes') THEN datetime('now') ELSE login_attempts.first_at END
  `).bind(id).run();
  await env.DB.prepare(
    `UPDATE login_attempts SET locked_until = datetime('now', '+${LOCK_MIN} minutes') WHERE id = ? AND fails >= ?`
  ).bind(id, MAX_FAILS).run();
}

export async function clearFailures(env, ip, username) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE id = ?').bind(attemptId(ip, username)).run();
}
