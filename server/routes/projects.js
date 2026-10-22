const express = require('express');
const db = require('../db/pool');
const { isClientError } = require('../lib/db-errors');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

async function nextProjectCode(client) {
  const result = await client.query("SELECT nextval('project_code_seq') AS n");
  return 'P' + String(result.rows[0].n).padStart(3, '0');
}

router.post('/', async (req, res, next) => {
  const { clientId, name, description, priority, startDate, expectedEndDate, deadlineDate, budget, notes } = req.body || {};
  // Validate BEFORE taking a connection and opening a transaction. Returning
  // early from inside BEGIN used to hand the connection back to the pool
  // with the transaction still open -- every later query that happened to
  // reuse that connection then ran inside it and was never committed, so
  // saved changes silently vanished.
  if (!clientId) return res.status(400).json({ error: 'clientId is required' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    const code = await nextProjectCode(client);
    const projResult = await client.query(
      `INSERT INTO projects (client_id, code, name, description, priority, start_date, expected_end_date, deadline_date, budget, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [clientId, code, (name || 'Untitled Project').trim(), description || '', priority || 'Medium',
       startDate || null, expectedEndDate || null, deadlineDate || null,
       (typeof budget === 'number' ? budget : null), notes || '', req.user.id]
    );
    const project = projResult.rows[0];

    // Seed this project's pipeline from the current department template --
    // a snapshot at creation time, same as the desktop app: editing the
    // template later never retroactively changes an existing project.
    const template = await client.query('SELECT * FROM department_template ORDER BY sort_order ASC');
    for (const t of template.rows) {
      await client.query(
        `INSERT INTO project_departments (project_id, name, owner_team, color, icon, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [project.id, t.name, t.owner_team, t.color, t.icon, t.sort_order]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ project: await loadFullProject(project.id) });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (e.code === '23503') return res.status(404).json({ error: 'That client no longer exists' });
    if (e.code === '22P02' || e.code === '23514' || e.code === '22007' || e.code === '22008') {
      return res.status(400).json({ error: 'Invalid value in project details' });
    }
    if (isClientError(e)) return next(e);
    console.error('create project error', e);
    res.status(500).json({ error: 'Could not create project' });
  } finally {
    client.release();
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const fieldMap = {
      name: 'name', description: 'description', priority: 'priority',
      startDate: 'start_date', expectedEndDate: 'expected_end_date',
      deadlineDate: 'deadline_date', actualEndDate: 'actual_end_date',
      budget: 'budget', ragOverride: 'rag_override', notes: 'notes'
    };
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
    const result = await db.query(`UPDATE projects SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING id`, values);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json({ project: await loadFullProject(req.params.id) });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('update project error', e);
    res.status(500).json({ error: 'Could not update project' });
  }
});

router.delete('/:id', async (req, res) => {
  await db.query('DELETE FROM projects WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

// ---- Per-project pipeline stages ----
// Independence between projects falls straight out of the schema here:
// every row belongs to exactly one project_id, so there is no shared
// table a "global edit" could accidentally touch.

router.post('/:id/departments', async (req, res, next) => {
  try {
    const { name, ownerTeam, color, deadline, stakeholder, estimatedDays } = req.body || {};
    let { icon } = req.body || {};
    icon = icon || 'layers';
    const maxOrder = await db.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM project_departments WHERE project_id = $1', [req.params.id]);
    const result = await db.query(
      `INSERT INTO project_departments (project_id, name, owner_team, color, icon, sort_order, stakeholder, deadline, estimated_days)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, (name || 'New Stage').trim(), ownerTeam || '', color || '#3B4FF0', icon,
       maxOrder.rows[0].m + 1, stakeholder || '', deadline || null,
       (typeof estimatedDays === 'number' ? estimatedDays : null)]
    );
    res.status(201).json({ department: toJsDepartment(result.rows[0]) });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('add department error', e);
    res.status(500).json({ error: 'Could not add stage' });
  }
});

router.patch('/:id/departments/:deptId', async (req, res, next) => {
  try {
    const fieldMap = {
      name: 'name', ownerTeam: 'owner_team', color: 'color', icon: 'icon',
      status: 'status', percent: 'percent', flag: 'flag', notes: 'notes',
      stakeholder: 'stakeholder', deadline: 'deadline', estimatedDays: 'estimated_days'
    };
    const sets = ['updated_at = now()'];
    const values = [];
    Object.keys(fieldMap).forEach((jsField) => {
      if (Object.prototype.hasOwnProperty.call(req.body, jsField)) {
        values.push(req.body[jsField]);
        sets.push(`${fieldMap[jsField]} = $${values.length}`);
      }
    });
    // completed_on tracks status transitions server-side, mirroring the
    // desktop app: set once when a stage first becomes Completed, cleared
    // if it's reopened.
    if (req.body.status === 'Completed') {
      sets.push('completed_on = COALESCE(completed_on, now())');
    } else if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
      sets.push('completed_on = NULL');
    }
    values.push(req.params.deptId, req.params.id);
    const result = await db.query(
      `UPDATE project_departments SET ${sets.join(', ')} WHERE id = $${values.length - 1} AND project_id = $${values.length} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Stage not found' });
    res.json({ department: toJsDepartment(result.rows[0]) });
  } catch (e) {
    if (isClientError(e)) return next(e);
    console.error('update department error', e);
    res.status(500).json({ error: 'Could not update stage' });
  }
});

router.delete('/:id/departments/:deptId', async (req, res) => {
  await db.query('DELETE FROM project_departments WHERE id = $1 AND project_id = $2', [req.params.deptId, req.params.id]);
  res.json({ ok: true });
});

router.post('/:id/departments/reorder', async (req, res, next) => {
  const { orderedIds } = req.body || {};
  if (!Array.isArray(orderedIds)) return res.status(400).json({ error: 'orderedIds must be an array' });
  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < orderedIds.length; i++) {
      await client.query('UPDATE project_departments SET sort_order = $1 WHERE id = $2 AND project_id = $3', [i, orderedIds[i], req.params.id]);
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    if (isClientError(e)) return next(e);
    console.error('reorder error', e);
    res.status(500).json({ error: 'Could not reorder stages' });
  } finally {
    client.release();
  }
});

function toJsDepartment(row) {
  return {
    id: row.id, name: row.name, ownerTeam: row.owner_team, color: row.color, icon: row.icon,
    order: row.sort_order, status: row.status, percent: row.percent, flag: row.flag, notes: row.notes,
    stakeholder: row.stakeholder, deadline: row.deadline, estimatedDays: row.estimated_days,
    updatedAt: row.updated_at, completedOn: row.completed_on
  };
}

async function loadFullProject(projectId) {
  const p = await db.query('SELECT * FROM projects WHERE id = $1', [projectId]);
  if (p.rows.length === 0) return null;
  const depts = await db.query('SELECT * FROM project_departments WHERE project_id = $1 ORDER BY sort_order ASC', [projectId]);
  const docs = await db.query('SELECT id, file_name, size_bytes, uploaded_at FROM project_documents WHERE project_id = $1 ORDER BY uploaded_at DESC', [projectId]);
  const row = p.rows[0];
  return {
    id: row.id, code: row.code, clientId: row.client_id, name: row.name, description: row.description,
    priority: row.priority, startDate: row.start_date, expectedEndDate: row.expected_end_date,
    deadlineDate: row.deadline_date, actualEndDate: row.actual_end_date, budget: row.budget !== null ? Number(row.budget) : null,
    ragOverride: row.rag_override, notes: row.notes, createdAt: row.created_at,
    departments: depts.rows.map(toJsDepartment),
    documents: docs.rows.map((d) => ({ id: d.id, fileName: d.file_name, size: Number(d.size_bytes), uploadedAt: d.uploaded_at }))
  };
}

module.exports = { router, loadFullProject, toJsDepartment };
