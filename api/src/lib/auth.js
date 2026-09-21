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
  return sign({ sub: user.id, dealer_id: user.dealer_id, username: user.username, role: user.role, iat: now, exp: now + 60 * 60 * 24 * 7 }, secret, 'HS256');
}

/** Hono middleware: requires a valid Bearer token; sets c.get('user'). */
export function requireAuth() {
  return async (c, next) => {
    const h = c.req.header('Authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!token) return c.json({ error: 'Unauthorised' }, 401);
    try {
      const payload = await verify(token, c.env.JWT_SECRET, 'HS256');
      c.set('user', payload);
      c.set('dealerId', payload.dealer_id);
      await next();
    } catch {
      return c.json({ error: 'Invalid or expired token' }, 401);
    }
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
  const dealer = await env.DB.prepare('SELECT id FROM dealers WHERE slug = ?').bind(env.DEFAULT_DEALER_SLUG || 'mhlmotors').first();
  if (!dealer) return null;
  const salt = randomSalt();
  const password_hash = await hashPassword(password, salt);
  const res = await env.DB.prepare('INSERT INTO users (dealer_id, username, password_hash, salt, role) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(dealer.id, username, password_hash, salt, 'admin').first();
  return res;
}
