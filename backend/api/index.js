/**
 * ============================================================================
 * VERCEL SERVERLESS ENTRYPOINT — Express app as a Vercel Node function.
 * ----------------------------------------------------------------------------
 * `src/server.js` binds a TCP port and owns process lifecycle; that model does
 * not fit Vercel's request/response functions. This adapter is the function
 * entrypoint referenced by the `backend` service in the root `vercel.json`.
 * It performs the ONE piece of startup work `server.js` used to do that a
 * function still needs — opening the MongoDB connection — and then hands the
 * request to the fully-assembled Express `app` (which does no I/O on import).
 *
 * The connection is cached at module scope so warm invocations reuse the single
 * Mongoose pool instead of reconnecting on every call. On a cold-start DB
 * failure we fail CLOSED with the same envelope the app's error handler uses,
 * rather than hanging (mongoose `bufferCommands` is already disabled in db.js).
 * ========================================================================= */
const { connectDB, dbStatus } = require('../src/config/db.js');
const app = require('../src/app.js');

let connectPromise;

/** Ensure the DB is connected, reusing one in-flight/settled promise. */
function ensureConnected() {
  if (!connectPromise) {
    // exitOnFailure:false so a transient outage surfaces per-request (503)
    // instead of crashing the function instance; readiness stays honest.
    connectPromise = connectDB({ exitOnFailure: false }).catch((err) => {
      connectPromise = undefined; // allow the next cold invocation to retry
      throw err;
    });
  }
  return connectPromise;
}

module.exports = async function handler(req, res) {
  try {
    await ensureConnected();
  } catch (err) {
    if (req.url && req.url.startsWith('/health')) {
      res.status(503).json({ status: 'unavailable', database: dbStatus() });
      return;
    }
    res.status(503).json({
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable.' },
      requestId: res.get('x-request-id') || undefined,
    });
    return;
  }
  return app(req, res);
};
