const express = require('express');
const multer = require('multer');
const db = require('../db/pool');
const { isClientError } = require('../lib/db-errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(requireAuth);

// Multer hands over multipart file names decoded as latin1, so a name like
// "Énergie – rapport.pdf" or any Tamil/Hindi name arrived as mojibake.
// Re-decode as UTF-8, keeping the original if it wasn't valid UTF-8.
function decodeFileName(name) {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('\uFFFD') ? name : utf8;
}

router.post('/:projectId/documents', upload.array('files', 10), async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const uploaded = [];
    for (const file of req.files) {
      const result = await db.query(
        `INSERT INTO project_documents (project_id, file_name, content_type, size_bytes, file_data, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, file_name, size_bytes, uploaded_at`,
        [req.params.projectId, decodeFileName(file.originalname), file.mimetype, file.size, file.buffer, req.user.id]
      );
      const row = result.rows[0];
      uploaded.push({ id: row.id, fileName: row.file_name, size: Number(row.size_bytes), uploadedAt: row.uploaded_at });
    }
    res.status(201).json({ documents: uploaded });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('upload documents error', e);
    if (e.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File is too large (25MB max)' });
    res.status(500).json({ error: 'Could not upload documents' });
  }
});

router.get('/:projectId/documents/:docId/download', async (req, res) => {
  const result = await db.query(
    'SELECT file_name, content_type, file_data FROM project_documents WHERE id = $1 AND project_id = $2',
    [req.params.docId, req.params.projectId]
  );
  if (result.rows.length === 0) return res.status(404).json({ error: 'Document not found' });
  const row = result.rows[0];
  // res.attachment() encodes the name properly (RFC 6266 filename*=UTF-8''...).
  // Hand-building the header threw "Invalid character in header content" for
  // any non-ASCII file name, so those documents could never be downloaded.
  res.attachment(row.file_name);
  res.set('Content-Type', row.content_type || 'application/octet-stream');
  res.send(row.file_data);
});

router.delete('/:projectId/documents/:docId', async (req, res) => {
  await db.query('DELETE FROM project_documents WHERE id = $1 AND project_id = $2', [req.params.docId, req.params.projectId]);
  res.json({ ok: true });
});

module.exports = router;
