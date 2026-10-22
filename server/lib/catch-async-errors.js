// Express 4 does not catch errors thrown inside `async` route handlers. A
// rejected promise there becomes an unhandled rejection, and on Node 15+
// that terminates the whole process -- so one malformed request (e.g. a bad
// id in the URL, which Postgres rejects) would take the app down for
// everyone. This patches Express's route layer so a rejected promise is
// passed to next(err) and reaches the error handler in index.js instead,
// exactly like a synchronous throw already does.
//
// Must be required before any routes are registered. (Express 5 does this
// natively; this shim can be deleted if the app is ever moved to Express 5.)
const Layer = require('express/lib/router/layer');

const originalHandle = Layer.prototype.handle_request;

Layer.prototype.handle_request = function handleRequestCatchingAsync(req, res, next) {
  const fn = this.handle;
  if (fn.length > 3) return originalHandle.call(this, req, res, next); // error-handling middleware
  try {
    const result = fn(req, res, next);
    if (result && typeof result.then === 'function') {
      result.then(undefined, (err) => next(err || new Error('Route rejected without an error')));
    }
  } catch (err) {
    next(err);
  }
};
