const express = require('express');
const rateLimit = require('express-rate-limit');
const db = require('../db/pool');
const { isClientError } = require('../lib/db-errors');
const { hashPassword, verifyPassword, signSessionToken, SESSION_DAYS } = require('../auth');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Deliberately strict: login is the one endpoint an internet-facing app
// most needs to protect against automated password-guessing.
// Only FAILED attempts count toward the limit, so a whole office logging in
// from one shared IP at 9am doesn't lock itself out -- guessing passwords
// still gets cut off after 10 wrong tries.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a few minutes and try again.' }
});

// Whether the session cookie carries the `Secure` flag. Browsers silently
// DROP a Secure cookie that arrives over plain http:// -- login "succeeds",
// then the very next request has no session and fails with "Not logged in".
// So by default this follows the scheme the browser actually used
// (req.secure, which honours X-Forwarded-Proto from a reverse proxy thanks
// to `trust proxy` in index.js): Secure over HTTPS, not over HTTP.
// COOKIE_SECURE=true forces it on (recommended once the site is HTTPS-only);
// COOKIE_SECURE=false forces it off.
function cookieOpts(req) {
  const mode = String(process.env.COOKIE_SECURE || 'auto').toLowerCase();
  const secure = mode === 'true' ? true : mode === 'false' ? false : req.secure;
  return {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000
  };
}

async function createSession(userId, userAgent) {
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const result = await db.query(
    `INSERT INTO sessions (user_id, expires_at, user_agent) VALUES ($1, $2, $3) RETURNING id`,
    [userId, expiresAt, userAgent || null]
  );
  return result.rows[0].id;
}

// There is deliberately NO open self-signup route. This app is meant to
// hold Atsuya's client and project data on the open internet -- letting
// anyone who finds the URL create their own account would defeat the
// purpose of having accounts at all. The only two ways in are:
//   1. Bootstrap: works exactly once, when the users table is empty,
//      to create the very first admin account without needing direct
//      database access.
//   2. An existing admin creates further accounts (see POST /users below).

router.post('/bootstrap-admin', async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const existing = await db.query('SELECT COUNT(*) FROM users');
    if (parseInt(existing.rows[0].count, 10) > 0) {
      return res.status(403).json({ error: 'Setup already complete — an account already exists. Ask an admin to create your account.' });
    }

    const passwordHash = await hashPassword(password);
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, 'admin') RETURNING id, email, name, role`,
      [email.toLowerCase().trim(), passwordHash, name.trim()]
    );
    const user = userResult.rows[0];
    const sessionId = await createSession(user.id, req.get('User-Agent'));
    res.cookie('aone_session', signSessionToken(sessionId), cookieOpts(req));
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered' });
    if (isClientError(e)) return next(e);
    console.error('bootstrap-admin error', e);
    res.status(500).json({ error: 'Could not create the account' });
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const result = await db.query('SELECT id, email, name, role, password_hash FROM users WHERE email = $1', [email.toLowerCase().trim()]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Incorrect email or password' });

    const user = result.rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password' });

    const sessionId = await createSession(user.id, req.get('User-Agent'));
    res.cookie('aone_session', signSessionToken(sessionId), cookieOpts(req));
    res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('login error', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  await db.query('DELETE FROM sessions WHERE id = $1', [req.sessionId]);
  const { maxAge, ...clearOpts } = cookieOpts(req);
  res.clearCookie('aone_session', clearOpts);
  res.json({ ok: true });
});

// Ends every OTHER active session for the current user (all other
// devices/browsers) without logging the current one out -- for "I think
// someone else has access" or just cleaning up old logged-in devices.
router.post('/logout-other-sessions', requireAuth, async (req, res) => {
  await db.query('DELETE FROM sessions WHERE user_id = $1 AND id != $2', [req.user.id, req.sessionId]);
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

router.get('/setup-status', async (req, res) => {
  const existing = await db.query('SELECT COUNT(*) FROM users');
  res.json({ needsBootstrap: parseInt(existing.rows[0].count, 10) === 0 });
});

// ---- Admin-only user management ----

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const result = await db.query('SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC');
  res.json({ users: result.rows });
});

router.post('/users', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const finalRole = role === 'admin' ? 'admin' : 'member';

    const passwordHash = await hashPassword(password);
    const result = await db.query(
      `INSERT INTO users (email, password_hash, name, role) VALUES ($1, $2, $3, $4) RETURNING id, email, name, role, created_at`,
      [email.toLowerCase().trim(), passwordHash, name.trim(), finalRole]
    );
    res.status(201).json({ user: result.rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That email is already registered' });
    if (isClientError(e)) return next(e);
    console.error('create user error', e);
    res.status(500).json({ error: 'Could not create the account' });
  }
});

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: "You can't remove your own account" });
  await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// Admin-driven reset since there's no email infrastructure here for
// self-service "forgot password" links -- an admin sets a new temporary
// password and shares it with the person directly. Also force-revokes all
// of that user's existing sessions, since a password reset is often
// prompted by a security concern and should actually lock out anyone
// currently logged in as them.
router.post('/users/:id/reset-password', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const passwordHash = await hashPassword(password);
    const result = await db.query('UPDATE users SET password_hash = $1 WHERE id = $2 RETURNING id', [passwordHash, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await db.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('reset password error', e);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

module.exports = router;
