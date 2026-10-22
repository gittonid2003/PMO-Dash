const { Pool, types } = require('pg');

// Return DATE columns (start/end/deadline dates) as the plain 'YYYY-MM-DD'
// string stored in the database. By default pg converts them to a JS Date at
// the *server's* local midnight, which serialises as e.g.
// "2026-09-30T18:30:00.000Z" on an IST server: the date inputs in the edit
// forms can't read that (so they show blank, and saving the form wiped the
// dates), and anyone viewing from a different timezone saw the wrong day.
const PG_DATE_OID = 1082;
types.setTypeParser(PG_DATE_OID, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Most hosted Postgres providers (Render, Railway, Supabase, etc.)
  // require SSL but use a certificate not in Node's default trust
  // store; rejectUnauthorized:false is the standard, safe-enough
  // pattern for this (the connection is still encrypted, just not
  // validated against a CA) unless the provider gives you their own
  // CA cert to pin.
  ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle database client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
  pool
};
