// Seeds the default 9-stage AOne pipeline template into department_template
// -- the same defaults the desktop app shipped with. Safe to run multiple
// times; skips seeding if the table already has rows.
require('dotenv').config();
const db = require('./pool');

const DEFAULT_TEMPLATE = [
  { name: 'Pre-Sales & Design Capture', ownerTeam: 'Sales', color: '#3B4FF0', icon: 'search' },
  { name: 'Account Mgmt & Kickoff', ownerTeam: 'Account Management', color: '#8B5CF6', icon: 'handshake' },
  { name: 'Procurement', ownerTeam: 'Supply Chain', color: '#0EA5E9', icon: 'package' },
  { name: 'Project Planning', ownerTeam: 'Operations', color: '#14B8A6', icon: 'calendar' },
  { name: 'Pre-Installation', ownerTeam: 'Engineering + Ops', color: '#F59E0B', icon: 'clipboard-check' },
  { name: 'Installation', ownerTeam: 'Field', color: '#10B981', icon: 'wrench' },
  { name: 'Post-Install Support', ownerTeam: 'Engineering + AM', color: '#6366F1', icon: 'life-buoy' },
  { name: 'Invoicing', ownerTeam: 'AM + Finance', color: '#EC4899', icon: 'receipt' },
  { name: 'MIS & Governance', ownerTeam: 'Operations', color: '#64748B', icon: 'bar-chart' }
];

async function seed() {
  const existing = await db.query('SELECT COUNT(*) FROM department_template');
  if (parseInt(existing.rows[0].count, 10) > 0) {
    console.log('department_template already has rows — skipping seed.');
    process.exit(0);
  }
  for (let i = 0; i < DEFAULT_TEMPLATE.length; i++) {
    const t = DEFAULT_TEMPLATE[i];
    await db.query(
      `INSERT INTO department_template (name, owner_team, color, icon, sort_order) VALUES ($1,$2,$3,$4,$5)`,
      [t.name, t.ownerTeam, t.color, t.icon, i]
    );
  }
  console.log('Seeded ' + DEFAULT_TEMPLATE.length + ' default pipeline stages.');
  process.exit(0);
}

seed().catch((e) => { console.error('Seed failed:', e); process.exit(1); });
