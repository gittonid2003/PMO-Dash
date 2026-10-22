const express = require('express');
const multer = require('multer');
const db = require('../db/pool');
const { isClientError } = require('../lib/db-errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.use(requireAuth);

// Same shape the bulk /api/data load uses, so the frontend can swap a
// created/updated client straight into its in-memory list. (Returning raw
// rows here used to drop hasPhoto -- editing a client made its photo vanish
// until a page reload -- and gave created_at instead of createdAt.)
const CLIENT_COLUMNS = 'id, name, industry, email, phone, notes, created_at, photo_updated_at, (photo_data IS NOT NULL) AS has_photo';

function toJsClient(c) {
  return {
    id: c.id, name: c.name, industry: c.industry, email: c.email, phone: c.phone, notes: c.notes,
    createdAt: c.created_at, hasPhoto: c.has_photo,
    photoVersion: c.photo_updated_at ? new Date(c.photo_updated_at).getTime() : null
  };
}

router.post('/', async (req, res, next) => {
  try {
    const { name, industry, email, phone, notes } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Client name is required' });
    const result = await db.query(
      `INSERT INTO clients (name, industry, email, phone, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${CLIENT_COLUMNS}`,
      [name.trim(), industry || '', email || '', phone || '', notes || '', req.user.id]
    );
    res.status(201).json({ client: toJsClient(result.rows[0]) });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('create client error', e);
    res.status(500).json({ error: 'Could not create client' });
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const fields = ['name', 'industry', 'email', 'phone', 'notes'];
    const sets = [];
    const values = [];
    fields.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(req.body, f)) {
        values.push(req.body[f]);
        sets.push(`${f} = $${values.length}`);
      }
    });
    if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.params.id);
    const result = await db.query(
      `UPDATE clients SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING ${CLIENT_COLUMNS}`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ client: toJsClient(result.rows[0]) });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('update client error', e);
    res.status(500).json({ error: 'Could not update client' });
  }
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM clients WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.put('/:id/photo', upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No photo uploaded' });
    if (!/^image\//.test(req.file.mimetype)) return res.status(400).json({ error: 'File must be an image' });
    const result = await db.query(
      `UPDATE clients SET photo_data = $1, photo_mime_type = $2, photo_updated_at = now() WHERE id = $3 RETURNING ${CLIENT_COLUMNS}`,
      [req.file.buffer, req.file.mimetype, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Client not found' });
    res.json({ ok: true, client: toJsClient(result.rows[0]) });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('upload photo error', e);
    res.status(500).json({ error: 'Could not upload photo' });
  }
});

router.get('/:id/photo', async (req, res) => {
  const result = await db.query('SELECT photo_data, photo_mime_type FROM clients WHERE id = $1', [req.params.id]);
  if (result.rows.length === 0 || !result.rows[0].photo_data) return res.status(404).end();
  res.set('Content-Type', result.rows[0].photo_mime_type || 'image/jpeg');
  // Safe to cache: the frontend adds ?v=<photoVersion> to the URL, so a
  // replaced photo gets a new URL rather than a stale cached copy.
  res.set('Cache-Control', 'private, max-age=86400');
  res.send(result.rows[0].photo_data);
});

router.delete('/:id/photo', async (req, res) => {
  await db.query('UPDATE clients SET photo_data = NULL, photo_mime_type = NULL, photo_updated_at = NULL WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;
module.exports.toJsClient = toJsClient;
module.exports.CLIENT_COLUMNS = CLIENT_COLUMNS;
