// Runs node-pg-migrate against DATABASE_URL. Safe to run repeatedly —
// node-pg-migrate tracks which migrations have already been applied.
//
// On first boot this also creates the target database if it doesn't exist
// (similar to Flyway's createSchemas / createDatabases), so the app is
// fully self-bootstrapping against a bare Postgres instance.
require('dotenv').config();
const { execFileSync } = require('child_process');
const path = require('path');
const { Pool } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

// ---------------------------------------------------------------------------
// 1. Ensure the target database exists
// ---------------------------------------------------------------------------
const SSL = process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false };

async function ensureDatabase() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
  const dbUrl = new URL(process.env.DATABASE_URL);
  const targetDb = decodeURIComponent(dbUrl.pathname.replace(/^\//, '')); // e.g. "aone_pmo"

  // Normal case (and the only one on managed hosts like Render, where the
  // app user often can't even open the "postgres" maintenance database): the
  // target database already exists -- nothing to do.
  const probe = new Pool({ connectionString: process.env.DATABASE_URL, ssl: SSL });
  try {
    await probe.query('SELECT 1');
    console.log(`Database "${targetDb}" already exists.`);
    return;
  } catch (e) {
    if (e.code !== '3D000') throw e; // 3D000 = database does not exist; anything else is a real problem
  } finally {
    await probe.end().catch(() => {});
  }

  // Connect to the default "postgres" maintenance database to issue CREATE DATABASE.
  const adminUrl = new URL(process.env.DATABASE_URL);
  adminUrl.pathname = '/postgres';

  const adminPool = new Pool({ connectionString: adminUrl.toString(), ssl: SSL });

  try {
    const result = await adminPool.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [targetDb]
    );
    if (result.rowCount === 0) {
      // CREATE DATABASE cannot run inside a transaction, which is fine —
      // pg's query() auto-commits when not inside an explicit BEGIN.
      // Identifier is safe here (comes from our own DATABASE_URL, not user input).
      await adminPool.query(`CREATE DATABASE "${targetDb}"`);
      console.log(`Created database "${targetDb}".`);
    } else {
      console.log(`Database "${targetDb}" already exists.`);
    }
  } finally {
    await adminPool.end();
  }
}

// ---------------------------------------------------------------------------
// 2. Run node-pg-migrate
// ---------------------------------------------------------------------------
function runMigrations({ count, fake = false } = {}) {
  const args = ['up'];
  if (count) args.push(String(count));
  args.push('--migrations-dir', MIGRATIONS_DIR, '--single-transaction');
  if (fake) args.push('--fake');
  // node-pg-migrate opens its own connection and ignores DATABASE_SSL, so
  // pass the same SSL behaviour as db/pool.js -- without this, migrating a
  // hosted database that requires SSL (e.g. Render's External URL, as in
  // DEPLOYMENT.md step 4) failed even though the app itself could connect.
  if (SSL) args.push('--reject-unauthorized', 'false');
  execFileSync(process.execPath, [require.resolve('node-pg-migrate/bin/node-pg-migrate'), ...args], {
    stdio: 'inherit',
    env: process.env
  });
}

// ---------------------------------------------------------------------------
// 3. Orchestrate: ensure DB → detect baseline → migrate
// ---------------------------------------------------------------------------
async function migrate() {
  await ensureDatabase();

  const db = require('./pool');

  const result = await db.query(`
    SELECT to_regclass('public.users') AS users,
           to_regclass('public.pgmigrations') AS migrations
  `);

  const hasExistingSchema = result.rows[0].users !== null;
  const hasMigrationHistory = result.rows[0].migrations !== null;

  if (hasExistingSchema && !hasMigrationHistory) {
    // Tables were created by running schema.sql directly. Mark ONLY 001 as
    // applied (faking every pending migration would skip real later ones),
    // then apply everything after it for real.
    console.log('Existing schema detected; baselining migration 001_initial_schema.');
    runMigrations({ count: 1, fake: true });
  }
  runMigrations();
  await db.pool.end();
}

migrate().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
