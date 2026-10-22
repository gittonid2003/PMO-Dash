const express = require('express');
const db = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { toJsDepartment } = require('./projects');
const { toJsTemplate } = require('./workspace');
const { toJsClient, CLIENT_COLUMNS } = require('./clients');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  try {
    const [workspaceR, templateR, clientsR, projectsR, deptsR, docsR] = await Promise.all([
      db.query('SELECT * FROM workspace WHERE id = 1'),
      db.query('SELECT * FROM department_template ORDER BY sort_order ASC'),
      db.query(`SELECT ${CLIENT_COLUMNS} FROM clients ORDER BY created_at ASC`),
      db.query('SELECT * FROM projects ORDER BY created_at ASC'),
      db.query('SELECT * FROM project_departments ORDER BY project_id, sort_order ASC'),
      db.query('SELECT id, project_id, file_name, size_bytes, uploaded_at FROM project_documents ORDER BY uploaded_at DESC')
    ]);

    const deptsByProject = {};
    deptsR.rows.forEach((d) => {
      if (!deptsByProject[d.project_id]) deptsByProject[d.project_id] = [];
      deptsByProject[d.project_id].push(toJsDepartment(d));
    });
    const docsByProject = {};
    docsR.rows.forEach((doc) => {
      if (!docsByProject[doc.project_id]) docsByProject[doc.project_id] = [];
      docsByProject[doc.project_id].push({ id: doc.id, fileName: doc.file_name, size: Number(doc.size_bytes), uploadedAt: doc.uploaded_at });
    });

    const projects = projectsR.rows.map((row) => ({
      id: row.id, code: row.code, clientId: row.client_id, name: row.name, description: row.description,
      priority: row.priority, startDate: row.start_date, expectedEndDate: row.expected_end_date,
      deadlineDate: row.deadline_date, actualEndDate: row.actual_end_date,
      budget: row.budget !== null ? Number(row.budget) : null,
      ragOverride: row.rag_override, notes: row.notes, createdAt: row.created_at,
      departments: deptsByProject[row.id] || [],
      documents: docsByProject[row.id] || []
    }));

    const clients = clientsR.rows.map(toJsClient);

    res.json({
      workspace: { name: workspaceR.rows[0].name, accentColor: workspaceR.rows[0].accent_color },
      departmentTemplate: templateR.rows.map(toJsTemplate),
      clients,
      projects
    });
  } catch (e) {
    console.error('bulk data load error', e);
    res.status(500).json({ error: 'Could not load data' });
  }
});

module.exports = router;
