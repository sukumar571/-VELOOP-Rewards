/**
 * Jest setupFiles — runs before each test module is imported.
 * Establishes deterministic, NON-production test defaults so the config layer
 * never reads leftover host environment values. Individual tests may override
 * via process.env + jest.isolateModules when they need a specific auth mode.
 */
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
process.env.AUTH_MODE = process.env.AUTH_MODE || 'dev-mock';
process.env.DEV_JWT_SECRET = process.env.DEV_JWT_SECRET || 'test-dev-secret';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-please-32-chars-min';
process.env.CORS_ORIGINS =
  process.env.CORS_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173';
// Never attempt a real Mongo connection during unit/integration tests.
process.env.MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/veloop_giveaway_test';
process.env.EXIT_ON_DB_FAILURE = 'false';
