// Postgres error codes caused by bad input (malformed id, value outside an
// allowed list, record that no longer exists) rather than a server fault.
// Routes hand these to the central error handler in index.js, which answers
// with a clear 4xx instead of a generic 500.
const CLIENT_ERROR_CODES = new Set(['22P02', '22007', '22008', '22003', '23502', '23503', '23514']);

function isClientError(e) {
  return !!(e && CLIENT_ERROR_CODES.has(e.code));
}

module.exports = { isClientError };
