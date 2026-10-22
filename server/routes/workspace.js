const express = require('express');
const db = require('../db/pool');
const { isClientError } = require('../lib/db-errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.patch('/', async (req, res) => {
  const { name, accentColor } = req.body || {};
  const sets = [];
  const values = [];
  if (name !== undefined) { values.push(name); sets.push(`name = $${values.length}`); }
  if (accentColor !== undefined) { values.push(accentColor); sets.push(`accent_color = $${values.length}`); }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  await db.query(`UPDATE workspace SET ${sets.join(', ')} WHERE id = 1`, values);
  res.json({ ok: true });
});

router.post('/template', async (req, res) => {
  const { name, ownerTeam, color, icon } = req.body || {};
  const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM department_template');
  const result = await db.query(
    `INSERT INTO department_template (name, owner_team, color, icon, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [(name || 'New Stage').trim(), ownerTeam || '', color || '#3B4FF0', icon || 'layers', maxOrder.rows[0].m + 1]
  );
  res.status(201).json({ template: toJsTemplate(result.rows[0]) });
});

router.patch('/template/:id', async (req, res) => {
  const fieldMap = { name: 'name', ownerTeam: 'owner_team', color: 'color', icon: 'icon' };
  const sets = [];
  const values = [];
  Object.keys(fieldMap).forEach((jsField) => {
    if (Object.prototype.hasOwnProperty.call(req.body, jsField)) {
      values.push(req.body[jsField]);
      sets.push(`${fieldMap[jsField]} = $${values.length}`);
    }
  });
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const result = await db.query(`UPDATE department_template SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
  if (result.rows.length === 0) return res.status(404).json({ error: 'Template stage not found' });
  res.json({ template: toJsTemplate(result.rows[0]) });
});

router.delete('/template/:id', async (req, res) => {
  await db.query('DELETE FROM department_template WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

router.post('/template/reorder', async (req, res, next) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query('UPDATE department_template SET sort_order = $1 WHERE id = $2', [i, orderedIds[i]]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (isClientError(e)) return next(e);
    console.error('reorder template error', e);
    res.status(500).json({ error: 'Could not reorder template' });
  } finally {
    client.release();
  }
});

function toJsTemplate(row) {
  return { id: row.id, name: row.name, ownerTeam: row.owner_team, color: row.color, icon: row.icon, order: row.sort_order };
}

module.exports = { router, toJsTemplate };
