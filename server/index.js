require('dotenv').config();
const express = require('express');
require('./lib/catch-async-errors'); // must run before any routes are registered
const cookieParser = require('cookie-parser');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const clientRoutes = require('./routes/clients');
const { router: projectRoutes } = require('./routes/projects');
const documentRoutes = require('./routes/documents');
const { router: workspaceRoutes } = require('./routes/workspace');
const dataRoutes = require('./routes/data');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust the first proxy hop (Render/Railway/Fly/etc. all sit behind one) --
// needed for rate limiting and secure cookies to see the real client IP
// and scheme rather than the proxy's.
app.set('trust proxy', 1);

// The frontend is served from this same service, so the browser never needs
// CORS. Reflecting *any* origin with credentials (the previous default) would
// let other sites on the same parent domain read the API with a logged-in
// user's cookie, so CORS is now only switched on when CORS_ORIGIN is set
// explicitly (comma-separated list of allowed origins).
if (process.env.CORS_ORIGIN) {
  app.use(cors({
    origin: process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean),
    credentials: true
  }));
}
app.use(cookieParser());
app.use(express.json({ limit: '2mb' })); // file uploads use multipart, not JSON, so this stays small

// A generous ceiling on API calls in case something upstream misbehaves --
// the real, tight limit for login attempts specifically lives in
// routes/auth.js. Scoped to /api (static files don't count) and sized for a
// whole office sharing one public IP.
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 1000, standardHeaders: true, legacyHeaders: false }));

app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // 'unsafe-inline' on style-src only (for the few inline style="" attributes
  // the UI sets dynamically, e.g. accent colors) -- script-src stays strict,
  // no inline or eval'd script anywhere in this app.
  res.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'");
  next();
});

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', documentRoutes); // documents nest under /api/projects/:projectId/documents
app.use('/api/workspace', workspaceRoutes);
app.use('/api/data', dataRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Serve the web frontend from the same service -- one deployment for the
// whole app, no separate frontend hosting or CORS setup needed in
// production.
const WEB_DIR = path.join(__dirname, '..', 'web', 'dist');
app.use(express.static(WEB_DIR));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(WEB_DIR, 'index.html'));
});

// Turns predictable failures into clear 4xx responses instead of a generic
// 500 (and, before catch-async-errors, a crashed process).
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.name === 'MulterError') {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'File is too large' : 'Upload rejected: ' + err.message });
  }
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body is not valid JSON' });
  switch (err && err.code) {
    case '22P02': // invalid_text_representation (e.g. a malformed id)
    case '22007': // invalid_datetime_format
    case '22008': // datetime_field_overflow
    case '22003': // numeric_value_out_of_range
    case '23502': // not_null_violation
    case '23514': // check_violation (e.g. an unknown status/priority value)
      return res.status(400).json({ error: 'Invalid value in request' });
    case '23503': // foreign_key_violation (e.g. a client/project that no longer exists)
      return res.status(404).json({ error: 'A referenced record was not found' });
    case '23505':
      return res.status(409).json({ error: 'That record already exists' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong' });
});

// Last-resort safety net: log instead of letting a stray rejection kill the
// server for every user.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

app.listen(PORT, () => {
  console.log(`AOne PMO server listening on port ${PORT}`);
});
