/**
 * One-shot Atlas connectivity probe. Loads backend/.env (via src/config) and
 * tries to connect to the configured MONGODB_URI. Prints a short result and
 * exits. Never prints credentials. Used only to diagnose IP allow-listing.
 */
const mongoose = require('mongoose');
const { config } = require('../src/config/index.js');

(async () => {
  const started = Date.now();
  try {
    await mongoose.connect(config.mongo.uri, {
      serverSelectionTimeoutMS: 15000,
    });
    const admin = mongoose.connection.getClient();
    const hello = await admin.db.admin().command({ hello: 1 });
    console.log('ATLAS_OK', JSON.stringify({
      db: mongoose.connection.name,
      setName: hello.setName || null,
      secondary: !!hello.secondary,
      ms: Date.now() - started,
    }));
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    const name = err && (err.codeName || err.name);
    console.log('ATLAS_FAIL', name);
    console.log('REDACTED_MESSAGE', String(err && err.message || err).replace(/\/\/[^@/]*@/, '//***@'));
    let c = err, depth = 0;
    while (c && depth < 6) {
      console.log('CAUSE[' + depth + ']', (c.name || '?') + ': ' + String(c.message || c.codeName || '').replace(/\/\/[^@/]*@/, '//***@'));
      c = c.cause || c.reason;
      depth += 1;
    }
    process.exit(1);
  }
})();
