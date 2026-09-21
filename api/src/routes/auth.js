import { Hono } from 'hono';
import { verifyPassword, issueToken, bootstrapAdmin, requireAuth, hashPassword, randomSalt } from '../lib/auth.js';

const auth = new Hono();

// POST /api/auth/login { username, password }
auth.post('/login', async c => {
  const { username, password } = await c.req.json().catch(() => ({}));
  if (!username || !password) return c.json({ error: 'username and password are required' }, 400);

  let user = await c.env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
  if (!user) user = await bootstrapAdmin(c.env, username, password);
  if (!user || !(await verifyPassword(password, user.salt, user.password_hash))) {
    return c.json({ error: 'Incorrect username or password' }, 401);
  }
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
  await c.env.DB.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').bind(await hashPassword(next, salt), salt, user.id).run();
  return c.json({ success: true });
});

export default auth;
