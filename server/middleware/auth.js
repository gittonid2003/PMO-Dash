const db = require('../db/pool');
const { verifySessionToken } = require('../auth');

// Attaches req.user = {id, email, name, role} when the request carries a
// valid, non-expired, non-revoked session; otherwise responds 401.
// "Non-revoked" is the part a bare JWT check would miss: the session row
// must still exist in the database, so a logout (or an admin forcing a
// user's sessions to end) actually takes effect immediately rather than
// waiting for the token's own expiry.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies && req.cookies.aone_session;
    if (!token) return res.status(401).json({ error: 'Not logged in' });

    const payload = verifySessionToken(token);
    if (!payload || !payload.sid) return res.status(401).json({ error: 'Session invalid' });

    const result = await db.query(
      `SELECT s.user_id, s.expires_at, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = $1`,
      [payload.sid]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Session expired or logged out' });

    const row = result.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      await db.query('DELETE FROM sessions WHERE id = $1', [payload.sid]);
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = { id: row.user_id, email: row.email, name: row.name, role: row.role };
    req.sessionId = payload.sid;
    next();
  } catch (e) {
    console.error('requireAuth error', e);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
