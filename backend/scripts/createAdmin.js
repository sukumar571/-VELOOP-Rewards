#!/usr/bin/env node
/**
 * createAdmin.js — Create or reset local administrator accounts in MongoDB.
 *
 * Ensures local credentials exist so an operator can sign in at /login with
 * username and password, receiving a verified JWT token with roles: ['admin'].
 *
 * Default Admin Credentials created:
 *   Email (Username): admin@gmail.com
 *   Password:         Admin@123
 */
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const User = require('../src/models/user.model.js');
const { ROLE, USER_STATUS } = require('../src/config/constants.js');

const ADMIN_ACCOUNTS = [
  {
    email: 'admin@gmail.com',
    displayName: 'Admin Lead',
    password: 'Admin@123',
  },
];

// Superseded default admins removed so only the account above remains.
const LEGACY_ADMIN_EMAILS = ['admin@veloop.io', 'ops.lead@example.com'];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log('Connected to MongoDB.');

  const BCRYPT_ROUNDS = 10;

  for (const email of LEGACY_ADMIN_EMAILS) {
    const veloopId = User.localVeloopId(email);
    const { deletedCount } = await User.deleteOne({ veloopId }).setOptions({ overrideHistoryGuard: true });
    console.log(
      deletedCount
        ? `[REMOVED] Legacy administrator account: ${email}`
        : `[SKIP] Legacy administrator not present: ${email}`
    );
  }

  for (const acc of ADMIN_ACCOUNTS) {
    const cleanEmail = acc.email.trim().toLowerCase();
    const veloopId = User.localVeloopId(cleanEmail);
    const passwordHash = await bcrypt.hash(acc.password, BCRYPT_ROUNDS);

    const update = {
      veloopId,
      email: cleanEmail,
      displayName: acc.displayName,
      publicAlias: acc.displayName,
      authProvider: 'local',
      roles: [ROLE.USER, ROLE.ADMIN],
      status: USER_STATUS.ACTIVE,
      passwordHash,
      passwordSetAt: new Date(),
      lastSeenAt: new Date(),
    };

    const doc = await User.findOneAndUpdate(
      { veloopId },
      { $set: update },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    console.log(`[OK] Administrator account ready:`);
    console.log(`     Username / Email: ${acc.email}`);
    console.log(`     Password:         ${acc.password}`);
    console.log(`     Roles:            ${JSON.stringify(doc.roles)}`);
    console.log(`     Auth Provider:    ${doc.authProvider}`);
  }

  await mongoose.disconnect();
  console.log('Done.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to provision administrator:', err.message);
    process.exit(1);
  });
}

module.exports = { main };
