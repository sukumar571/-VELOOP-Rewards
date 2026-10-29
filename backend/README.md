# VELOOP Rewards Giveaway — Backend

Node.js + Express + MongoDB (Mongoose) API for the VELOOP Rewards Giveaway.
This is the **backend core plus the data model** (Phases 0–3 of
[`docs/PLAN.md`](../docs/PLAN.md)): the runnable application skeleton
(configuration, DB lifecycle, security, logging, validation, authentication,
error handling, health probes, graceful shutdown, tests) **and** the complete
Mongoose model layer for the giveaway domain — 10 collections with the indexes,
references, validation, deletion policies and privacy rules the specification
requires, plus the migration and versioned-seed tooling around them.

> **Honesty notice — what is NOT connected.**
> - There is **no live MongoDB** required to boot or to serve `/health`. Data
>   routes (`/api/v1/giveaways*`, `/api/v1/admin/stats`) perform **real** Mongoose
>   queries; with no database they return an honest **`503 SERVICE_UNAVAILABLE`**,
>   never a fabricated success.
> - **The model layer is not yet driven by write endpoints.** Giving an entry,
>   charging a fee, running the draw, announcing winners and submitting a claim are
>   model + database capabilities with tests, not HTTP endpoints — no route
>   pretends to perform an operation it does not do (see
>   [Endpoints](#endpoints-implemented)).
> - This backend is **NOT connected to any real VELOOP account/auth or wallet
>   system**. No such system, credentials, endpoints or issuer metadata were
>   provided. Authentication runs in a clearly-labelled **`dev-mock`** mode for
>   local use and tests; the wallet adapter defaults to **`disabled`** and fails
>   with `503 WALLET_NOT_CONFIGURED` instead of inventing a balance. The
>   `WalletReference` collection is an explicitly-labelled **cache of an external
>   system**, never a second source of truth.
> - Numbers the specification does not fix (fee amounts, claim windows, exact
>   eligibility rules) are **not invented**: those fields are configuration with no
>   default value and are tagged `[PDF]` / `[ASSUMPTION]` in the code.

---

## Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js ≥ 20 (built on v24) |
| HTTP | Express 4 |
| Data | MongoDB + Mongoose 8 |
| Auth | `jsonwebtoken` (HS256/RS256) behind an adapter; `dev-mock` for local/test |
| Validation | Zod |
| Security | `helmet` (headers) + `cors` (allow-list) + `express-rate-limit` |
| Logging | `pino` + `pino-http` with central sensitive-data redaction |
| Tests | Jest + Supertest; `mongodb-memory-server` starts a real MongoDB for the index/ledger tests |

No code was added for functionality that does not work, and no endpoints return a
hard-coded "success".

---

## Project structure

```
backend/
├── package.json
├── .env.example            # copy to .env (git-ignored). No real secrets committed.
├── .gitignore
├── README.md
├── src/
│   ├── server.js           # entrypoint: config gate → DB connect → listen → graceful shutdown
│   ├── app.js              # Express app assembly (import-safe: no I/O) — used by tests
│   ├── config/             # index.js (env+validation), db.js (lifecycle), logger.js, constants.js (every enum)
│   ├── middleware/         # requestLogger, security, rateLimiter, validate, auth, requireRole, errorHandler
│   ├── models/             # 10 collections + index.js barrel (see Data model below)
│   ├── routes/             # health.routes.js, v1/{index,auth,giveaway,admin}.routes.js
│   ├── controllers/        # health, auth, giveaway, admin
│   ├── services/           # giveaway.service.js (real DB read path)
│   ├── validators/         # zod schemas (common, giveaway)
│   ├── integrations/       # veloopAuth.js (auth seam), veloopWallet.js (wallet seam)
│   └── utils/              # ApiError, asyncHandler, schema.js (shared model rules), mintDevToken
├── scripts/
│   ├── migrate.js          # npm run db:migrate — index + retention sync (--dry-run / --check)
│   ├── lib/scriptDb.js     # connect/disconnect + the production refusal used by all scripts
│   └── seed/               # fixtures.dev.js (fictional data), seed.dev.js, reset.dev.js
└── tests/                  # unit/ and integration/ — run WITHOUT an external MongoDB
```

---

## Quick start

From the `backend/` directory:

```bash
# 1) Install dependencies
npm install

# 2) Configure environment (optional for dev — safe defaults exist). NEVER commit .env
cp .env.example .env

# 3) Run in development (hot reload via Node's built-in watch)
npm run dev

# 4) Run the test suite (no external database needed)
npm test

# 5) With a MongoDB reachable at MONGODB_URI: create the indexes, then put the
#    FICTIONAL dev fixtures in (refuses to run when NODE_ENV=production)
npm run db:migrate
npm run seed:dev

# 6) Start for production (NODE_ENV=production; see Production below)
npm start
```

The server binds `PORT` (default **4000**). Verify it is up:

```bash
curl http://localhost:4000/health
# {"status":"ok","service":"veloop-giveaway-backend",...}

curl http://localhost:4000/health/ready
# 200 {"status":"ready","dependencies":{"database":"connected"}}  (with Mongo up)
# 503 {"status":"degraded","dependencies":{"database":"disconnected"}}  (without Mongo)
```

---

## Configuration

All runtime configuration is read from the environment (`backend/.env`, loaded by
[`dotenv`](src/config/index.js)). See **`.env.example`** for every key and the
security comments. Non-secret defaults let the app boot for local development with
no `.env` at all.

Separate profiles are driven by `NODE_ENV`:

| | development | test | production |
|---|---|---|---|
| Auth default | `dev-mock` | `dev-mock` | `jwt` (must configure keys) |
| DB failure at boot | log + keep serving (`EXIT_ON_DB_FAILURE=false`) | never connects | **exits** (`EXIT_ON_DB_FAILURE=true`) |
| Log output | pretty (pino-pretty) | silent | JSON |
| Mongoose `autoIndex` | on | on | **off** |
| Startup validation | lenient | lenient | **fail-fast** on missing/insecure config |

**Never commit `.env`, database credentials, JWT signing keys or real user data.**
`.gitignore` excludes `.env*` (except `.env.example`), `*.pem` and `*.key`. In
production, inject secrets from your secret manager / orchestrator.

`validateRuntimeConfig()` (called by `server.js` before it binds a port) **refuses
to start in production** if any of the following is true: missing `MONGODB_URI`;
`AUTH_MODE=dev-mock`; `AUTH_MODE=jwt` without a key; the default `DEV_JWT_SECRET`
left unchanged; an empty/`*` CORS allow-list; `WALLET_MODE` set to anything other
than `disabled`/`http`; or `WALLET_MODE=http` with a half-configured provider (no
base URL, key, balance path or debit path) — a wallet that looks connected while
silently failing every debit is worse than an absent one.

`DEVICE_HASH_SALT` is the salt behind the pseudonymous device/session references;
treat it as a long-lived secret (rotating it breaks correlation of stored hashes).
`FRAUD_RETENTION_DAYS` is read once at boot and is the only switch that turns the
fraud retention policy on: it declares the `expiresAt` TTL index on the schema and lets
the migration stamp expiry dates (see
[Migrations, seed data and reset](#migrations-seed-data-and-reset)). Unset means fraud
events are kept indefinitely and no TTL index is declared.

---

## Endpoints implemented

Base URL `/api/v1`. Error bodies are uniform:
`{ "error": { "code", "message", "details?" }, "requestId" }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | public | Liveness — process is up (never rate-limited, never touches DB) |
| GET | `/health/ready` | public | Readiness — reflects real MongoDB state (`503` when down) |
| GET | `/api/v1` | public | Truthful index of what this version implements |
| GET | `/api/v1/auth/me` | USER | Identity from the **verified** access token (`authProvider` shown) |
| GET | `/api/v1/giveaways` | public | List **published** draws. Query: `status, featured, sort, order, page, limit` |
| GET | `/api/v1/giveaways/:id` | public | Fetch one draw (unpublished draws are `404` to non-admins) |
| GET | `/api/v1/giveaways/:id/prizes` | public | The draw's prize tiers **including fee configuration** (`claim` internals and `codePoolId` are not served) |
| GET | `/api/v1/admin/stats` | ADMIN | Real aggregate counts over the collections |

`GET /api/v1/giveaways*` and `admin/stats` run **real Mongoose queries**.
Point `MONGODB_URI` at a running MongoDB and they return data; leave it offline and
they return `503 SERVICE_UNAVAILABLE` (by design — see Honesty notice). Visibility
is enforced in the route layer: a non-admin caller's query is pinned to
`published: true`, and an unpublished draw answers `404` (not `403`) so its
existence is not leaked.

### Deliberately NOT implemented yet (later phases, gated on the PDF + externals)

The entry/money path (`POST /giveaways/:id/entries`), wallet debit, refunds, the
winner draw, announcement, and claim submit/update endpoints are **not stubbed with
fake responses**. They depend on the unconnected VELOOP wallet/auth APIs and on
business rules in the project PDF. The **models and database rules for all of that
already exist and are tested against a real MongoDB** — `GiveawayParticipation`,
`GiveawayEntryTransaction` (with its compensating-reversal path), `GiveawayWinner`
and `PrizeClaim` — so the services can be built on top of them. No endpoint
pretends to perform an operation it does not do.

---

## Authentication

Identity is resolved by a single adapter: **[`src/integrations/veloopAuth.js`](src/integrations/veloopAuth.js)**.
`AUTH_MODE` selects the strategy; nothing else in the app changes:

- **`dev-mock`** (default in dev/test): verifies tokens signed with
  `DEV_JWT_SECRET`. Hard-disabled in `production`. Mint a local token to try the
  protected endpoints:
  ```bash
  npm run token:dev -- --sub=usr-demo-001 --roles=user
  npm run token:dev -- --sub=usr-admin-001 --roles=user,admin
  curl -H "Authorization: Bearer <token>" http://localhost:4000/api/v1/auth/me
  ```
- **`jwt`** (production): verifies real VELOOP-issued access tokens using
  `JWT_SECRET` (HMAC) or `JWT_PUBLIC_KEY` (RSA/EC, e.g. RS256), with optional
  `JWT_ISSUER` / `JWT_AUDIENCE` checks and a fixed `JWT_ALGORITHMS` allow-list.
  **This path does not claim any connection exists** — it simply verifies whatever
  token is presented against the key you provide. When the issuer uses a JWKS
  endpoint (rather than a static key), that is the one place to extend the adapter.

A token's roles never come from a client-supplied field — they come only from the
verified claims. Admin authorization is deny-by-default
([`requireRole`](src/middleware/requireRole.js)); the code notes the intended
server-side role re-confirmation once the identity/roles store is connected.

---

## Security, logging, limits

- **Headers** — `helmet` (nosniff, frame-ancestors, HSTS, etc.); `x-powered-by` off.
- **CORS** — explicit allow-list (`CORS_ORIGINS`); unknown origins get no
  allow header; `*` disables credentials per the Fetch spec.
- **Payload limits** — `express.json`/`urlencoded` capped at `JSON_BODY_LIMIT`
  (default `100kb`); oversize → `413`, malformed JSON → `400 INVALID_JSON`.
- **Rate limiting** — global limiter + a tighter `auth` limit; key is the
  authenticated subject when present, else the client IP; `429` returns the same
  error envelope. In-memory store with a documented Redis/Mongo upgrade path.
- **Structured logging** — `pino`, one JSON line per event, with **sensitive-data
  redaction** (`Authorization`, `Cookie`, and credential/PII keys such as
  `password`, `token`, `pin`, `cardNumber`) enforced centrally
  ([`config/index.js`](src/config/index.js)). A unit test asserts no secret value
  reaches the log sink. Every request carries an `X-Request-Id` (also in error
  bodies) for tracing.
- **Validation** — every request is validated with Zod at the edge; parsed values
  feed the controllers, so nothing unvalidated reaches the DB.
- **Error handling** — one centralized middleware maps `ApiError`, Zod, Mongoose
  (validation/cast/duplicate/disconnected), body-parser and JWT errors to stable
  codes; unexpected 5xx are logged with stack internally and returned as a generic
  message in production (never leaked).

---

## Database & lifecycle

[`src/config/db.js`](src/config/db.js) owns the Mongoose connection. `bufferCommands`
is **disabled** so a query with no connection fails fast (→ honest `503`) instead of
hanging. `server.js` connects on boot, keeps serving `/health` if the DB is down in
dev, and **exits on connection failure in production**. On `SIGINT`/`SIGTERM` it
performs a **graceful shutdown**: stop accepting connections, drain in-flight ones
(+ close idle/keep-alive), disconnect Mongo, exit — with a watchdog for stuck drains.
`unhandledRejection`/`uncaughtException` are handled.

MongoDB is expected to run as a **replica set** for the multi-document transactions
the later money path needs. The app connects to a standalone for the read endpoints
implemented here.

---

## Data model (Phase 3)

Ten Mongoose models in [`src/models/`](src/models), all exported from the
[`index.js`](src/models/index.js) barrel. MongoDB stays MongoDB — the invariants
are expressed as **database-level indexes plus schema hooks**, not as a SQL schema.
Every enum lives in [`src/config/constants.js`](src/config/constants.js) so a model,
a validator and a seed script can never disagree.

### Collections and how they relate

```
User ── identity root: every userId below references User._id (User.veloopId is the
│      external VELOOP subject; User.resolve(veloopId) maps one to the other)
│
├── Giveaway ──────────── aggregate root. Lifecycle UPCOMING → ACTIVE → ENDED →
│   │                      ARCHIVED, plus an orthogonal `published` flag. Holds the
│   │                      event-wide configuration: `participation` (entry
│   │                      currencies, free/paid entries, per-user caps, device
│   │                      requirement, grace seconds) and `prizeConfig` (draw
│   │                      method, claim window, allowDuplicateWinners, announce).
│   ├── Prize ─────────── N tiers per giveaway, ordered by `position`. The fee lives
│   │                    HERE as data (`entryCurrency`, `entryAmount`,
│   │                    `feeOverrides[]`, `maxEntries`) and the claim behaviour in
│   │                    `claim` (`windowDays`, `requireKyc`, physical/digital
│   │                    config) — so no controller ever needs a price `if`.
│   ├── GiveawayParticipation ─ ONE row per user per event (see the unique index).
│   │                    Carries `entryCurrency`/`entryAmount`, a privacy-conscious
│   │                    `deviceRef` (salted hashes + coarse buckets only), `status`,
│   │                    `joinedAt`, `entryCount`, `transactionId`/`transactionIds`
│   │                    and a snapshot of the rules that were agreed (`rulesVersion`).
│   │   └── GiveawayEntryTransaction ─ append-only ledger. Extra paid entries are
│   │                    NEW rows against the same participation, never new
│   │                    participation rows. `direction` DEBIT/CREDIT + reconciled
│   │                    `balanceBefore`/`balanceAfter`.
│   ├── GiveawayWinner ── one row per occupied slot of a Prize tier (≤ Prize.winnerCount),
│   │                    with reproducible `selection` provenance, `announcementStatus`
│   │                    (HOLD → PRIVATE_NOTIFIED → ANNOUNCED), masked `displayInfo`
│   │                    and a `prizeSnapshot` of the tier as it was at draw time.
│   │   └── PrizeClaim ── exactly one claim per winner. Copies `claimType`/`prizeType`
│   │                    from the Prize so the claim is self-describing; holds the
│   │                    `deadlineAt`, the status path
│   │                    NOT_SUBMITTED → SUBMITTED → PROCESSING → COMPLETED (or EXPIRED)
│   │                    and the PII-bearing `fulfillment` block.
│   └── FraudEvent ────── signal type + severity + status, references to
│                         user/giveaway/participation/transaction and HASHES only.
│
├── WalletReference ───── one cached snapshot per (user, currency) of the EXTERNAL
│                         VELOOP wallet: `balance`, `observedAt`, `source`, `stale`.
│                         Never authoritative, never a balance we invent.
└── AuditLog ───────────── append-only trail. Polymorphic (`entityType` + `entityId`,
                          no FK), scrubbed before write, so a forwarded request body
                          cannot park PII in it.
```

Read paths that join these: the public results list is
`GiveawayWinner.findPublic(giveawayId)` (announced rows, masked fields only); a
winner's claim is found with `PrizeClaim.findScoped(filter, { asUserId })`, which
**applies the ownership filter server-side** so a forgotten `where` in a controller
cannot return another winner's address; `Giveaway.stats`
(`participationCount`/`entryCount`/`winnerCount`) is a denormalized read cache only
and is rebuilt from the real rows by the seed script.

### Database-enforced invariants (the unique indexes)

These are the rules MongoDB itself guarantees — they hold under concurrent writes
and across processes, which is why the duplicate-participation test uses
`Promise.allSettled` and still ends with exactly one row.

| Collection | Index | What it guarantees |
|---|---|---|
| `users` | `veloopId` unique | one cache row per external identity |
| `giveaways` | `slug` unique | the public URL of a draw is unambiguous |
| `prizes` | `(giveawayId, position)` unique | two tiers cannot claim the same position in one event |
| `giveawayparticipations` | **`(userId, giveawayId)` unique** | **one participation per user per event** (spec rule); scoped per giveaway, so a new event always accepts new rows |
| `giveawayentrytransactions` | `transactionId` unique | our own ledger reference never repeats |
| `giveawayentrytransactions` | `idempotencyKey` unique | a replayed submit cannot create a second charge |
| `giveawayentrytransactions` | `externalTransactionId` unique, partial `{ $type: 'string' }` | a provider reference can only land once — while any number of still-`PENDING` rows may legitimately have none |
| `giveawayentrytransactions` | `sourceTxnId` unique, partial `{ type: 'REVERSAL' }` | a charge can be compensated at most once |
| `giveawaywinners` | `(prizeId, rank)` unique | two winners cannot occupy the same slot of a tier |
| `giveawaywinners` | `(prizeId, userId)` unique, partial `{ duplicateAllowed: false }` | no duplicate winner for a prize unless the draw explicitly allows it (equality, because MongoDB rejects `$ne` in a partial filter) |
| `prizeclaims` | `winnerId` unique | exactly one claim per winner |
| `walletreferences` | `(userId, currency)` unique | one cached snapshot per pair |

Supporting (non-unique) indexes exist for the actual read paths, e.g.
`(status, endAt)` + `(published, status, startAt)` + a text index on
`title`/`tagline` for the public list, `(giveawayId, status)` +
`(deviceRef.deviceHash, giveawayId)` for draws and fraud velocity,
`(status, createdAt)` for the reconciliation sweeper,
`(status, deadlineAt)` for the claim-expiry sweep,
`(entityType, entityId, createdAt)` / `(actorId, createdAt)` for audit history, and
`expiresAt` **TTL** (`ttl_expiresAt`), declared and created only when
`FRAUD_RETENTION_DAYS` is configured — see
[Migrations, seed data and reset](#migrations-seed-data-and-reset). The full
inventory is printed by `npm run db:migrate -- --dry-run` and asserted in
[`tests/integration/models.indexes.test.js`](tests/integration/models.indexes.test.js).

### Model-level rules the database cannot express alone

Enforced in `pre('validate')` / `pre('save')` hooks, so they hold for any writer —
service, script or migration — not just one controller:

- **Giveaway** — `endAt > startAt`; forward-only lifecycle from the documented
  transition table (`UPCOMING → ACTIVE | ARCHIVED`, `ACTIVE → ENDED`,
  `ENDED → ARCHIVED`, `ARCHIVED → ∅`); `statusHistory` records transitions only;
  `archivedAt`/`publishedAt` are stamped, never hand-written.
- **Prize** — `claimType` defaults from `prizeType` through
  `PRIZE_TYPE_DEFAULT_CLAIM_TYPE` (a mapping table, not a branch); a `PHYSICAL`
  prize cannot be `AUTOMATIC`; an override may not restate the default currency;
  `Prize.assertMatchesGiveaway(giveaway, prize)` refuses a fee currency the event
  does not enable **before** the write.
- **GiveawayParticipation** — a terminal status (`VOIDED_FRAUD`, `DISQUALIFIED`)
  cannot be revived; `userId`/`giveawayId`/`prizeId`/`joinedAt`/`entryCurrency` are
  frozen once the row is charged; `assertPrizeInGiveaway` keeps a tier-scoped
  participation inside its own event.
- **GiveawayEntryTransaction** — status moves follow
  `PENDING → SUCCESS | FAILED`, `SUCCESS → REVERSED` only; balances must reconcile
  (`before ± amount == after`, tolerance `1e-9`); a `SUCCESS` row born without a
  provider reference is refused; `REVERSAL`/`REFUND` rows must be CREDIT and carry
  `sourceTxnId`; identity fields are frozen once terminal.
  `GiveawayEntryTransaction.reverse(id, { authorizedBy, reason, … })` is the **only**
  refund path: it writes a NEW compensating row (PENDING until the provider's credit
  reference is supplied, at which point the original becomes `REVERSED`) and requires
  an authorizing actor plus a reason. Deleting a completed charge is impossible.
- **GiveawayWinner** — `rank ≤ Prize.winnerCount`, and the prize must belong to the
  giveaway; the winner must have a real participation in that event (cross-collection
  checks are async hooks registered last, so cheap synchronous rules still run under
  `validateSync()`); an `ANNOUNCED` winner must have masked `displayInfo` (email- and
  phone-shaped values are rejected); announcement is one-way.
- **PrizeClaim** — the submitted fulfilment must match `CLAIM_TYPE_FULFILMENT_SHAPE`
  (physical address fields vs. a digital delivery target; `AUTOMATIC` refuses
  winner-supplied details); status follows the documented path; a claim cannot be
  submitted after `deadlineAt`, and `submittedAt` can never be back-dated past it.
- **FraudEvent** — `CONFIRMED`/`DISMISSED` require `resolvedBy` **and** `resolvedAt`,
  and a resolved decision is never rewound (open a new event instead);
  `recordOrMerge()` escalates severity and bumps `occurrenceCount` instead of
  spamming duplicate documents, and clears `expiresAt` because reactivated evidence is
  no longer due for retention.
- **AuditLog** — append-only by document *and* by query
  (`updateOne`/`updateMany`/`findOneAndUpdate`/`deleteOne`/`deleteMany` all refused);
  `scrub()` deep-redacts credential and PII keys (`password`, `token`, `authorization`,
  `fulfillment`, `kyc`, doc-number/passport/NID variants, …) with depth/key caps and
  truncation, so the trail keeps the fact without keeping the data.
- **WalletReference** — `recordSnapshot()` refuses a `SEED_FIXTURE` balance in
  production; `markStale()` records a provider failure as `stale: true` + an error
  **code**, never as a made-up balance; `isFresh(maxAgeSeconds)` is what the
  eligibility check consults.

### Privacy and serialization

Every model serializes through the shared `jsonOptions()` / `objectOptions()` in
[`src/utils/schema.js`](src/utils/schema.js): `id` instead of `_id`, no `__v`, and
**declared private paths removed by default** (dotted paths supported, so
`claim.digital.codePoolId` can be dropped from an otherwise public prize config).
Private today: `User.email`/`User.kyc`, `Prize.claim.digital.codePoolId`,
`GiveawayParticipation.deviceRef`, `PrizeClaim.fulfillment`/`internalNote`/`history`,
and `AuditLog` snapshots (scrubbed on write). `toJSON({ includePrivate: true })`
exists for server-side code that has already authorized the reader — the API layer
never asks for it, and the wiring test asserts an unauthorized surface cannot see
`fulfillment`.

### Deletion policy — history is preserved

`blockDelete()` refuses `deleteOne()`/`deleteMany()`/`findOneAndDelete()` with
`HISTORY_PROTECTED` for every model except `PrizeClaim`/`GiveawayParticipation`/
`Giveaway`, which additionally allow removal of a row that never became history
(an untouched claim, a never-charged `PENDING` participation, a never-published
`UPCOMING` draw with no participation — i.e. failed-submit cleanup).
`doc.deleteOne()` is decided by the document rule; query deletes need the explicit
`{ overrideHistoryGuard: true }` escape hatch, which only `npm run seed:reset`
(and the tests) pass, and which is unreachable in production because the seed
scripts refuse `NODE_ENV=production`. Retirement is a status (`ARCHIVED`,
`active: false`, `VOIDED_FRAUD`, `EXPIRED`), and a refund is a compensating ledger
row — not a `delete`.

### Migrations, seed data and reset

```bash
npm run db:migrate            # syncIndexes for all 10 models + optional retention policy
npm run db:migrate:dry        # report what is declared, change nothing
npm run db:migrate:check      # declared vs. actual per model, exit non-zero on drift
npm run seed:dev              # FICTIONAL fixtures only, idempotent (stamped seedBatch=dev-fixture-v2)
npm run seed:dev:force        # reset the fixture batch first, then reseed
npm run seed:reset            # removes exactly the fixture rows (child-first order)
npm run seed:reset -- --keep-users
```

[`scripts/migrate.js`](scripts/migrate.js) does index/policy synchronization. It
fingerprints each index by key/unique/partial-filter/TTL (not by name, and it
normalizes MongoDB's `_fts`+`weights` storage form of a text index), reports a
missing namespace as "no indexes yet" instead of crashing, and drops indexes that
are no longer declared — the schema is the source of truth. `--check` writes nothing
and exits non-zero when a model is missing a declared index, so CI can gate on drift.
Data migrations would live in `scripts/migrations/NNN-name.js`; none are needed for
this model set yet.

**The one document-level write:** with `FRAUD_RETENTION_DAYS` set (unset by default,
so fraud evidence is kept indefinitely) the runner ensures the `ttl_expiresAt` index
**and** stamps `expiresAt = lastSeenAt + N days` on rows that are already older than
the window. A TTL index alone would be a fake policy — it expires nothing over `null`.
The stamp is idempotent (rows that already have an `expiresAt` are left alone), never
touches the signal itself, and `recordOrMerge()` clears `expiresAt` when an event shows
fresh activity again, so reactivated evidence cannot be deleted behind an analyst's
back. `--dry-run` and `--check` never stamp anything; with the variable set they only
report what would be applied.

[`scripts/seed/fixtures.dev.js`](scripts/seed/fixtures.dev.js) is the only fixture
file and contains **fictional** people, prizes and events (`… (dev)` display names,
`+900…` phone numbers, `example.test` emails, `seedBatch = dev-fixture-v2`).
Every document gets that stamp, so `seed:reset` can only ever delete fixture rows —
real records have `seedBatch: null` and are unreachable by the script. The seeder
runs the migration first (so the unique indexes are actually in force while the
fixtures go in), validates each row through the model layer, and rebuilds
`Giveaway.stats` from the inserted rows; it refuses `NODE_ENV=production`.

---

## Testing

`npm test` runs Jest + Supertest.

- `tests/unit/` — **no database required.** Config validation (dev vs. the
  production gate, including the wallet gate), `ApiError`, the auth adapter, logger
  redaction, the migration/delete helper semantics (`schema.helpers.test.js`),
  `giveaway.service` query-building against mocked models, and the model rules in
  `models.test.js` — including a fresh-process check that the fraud TTL index is
  declared only when `FRAUD_RETENTION_DAYS` is set at boot. Model rules are asserted
  with `await doc.validate()` rather than
  `validateSync()`, because Mongoose does **not** run `pre('validate')` middleware
  under `validateSync()` — a discovery that briefly made a dozen expectations look
  wrong.
- `tests/integration/` — the HTTP pipeline via Supertest (health/readiness, security
  headers, CORS, 401/403/404, validation envelopes, rate-limiter `429`, honest `503`
  with the DB offline, controller→service wiring), plus
  **`models.indexes.test.js`, which runs against a REAL MongoDB** started on demand
  by `mongodb-memory-server`. `autoIndex` is switched off before connecting, so the
  "index creation" assertions can only pass if the migration runner really created
  the indexes. That file is where the specification's hard claims are proved:
  index creation and idempotency, the duplicate-participation rejection (including a
  concurrent triple-submit that leaves exactly one row), prize-position uniqueness,
  ledger idempotency/transition/immutability/reversal behaviour, winner capacity and
  duplicate rules, claim lifecycle/scoping/PII, lifecycle transitions, delete
  protection, fraud merge, the fraud retention policy (TTL index plus a real
  `expiresAt` stamp on aged rows and nothing scheduled for a fresh one),
  audit append-only + scrubbing, wallet-cache rules, and the
  full `seedDev` → re-seed → `resetDev` cycle (which leaves non-fixture rows alone).
  The memory server downloads a MongoDB binary into its cache on first use, so that
  one run needs network access; afterwards it is local.

Current result: **11 suites / 188 tests passing** (`npm test`).

```bash
npm test              # single run
npm run test:models   # only the model + index work (unit + models.indexes)
npm run test:watch    # watch mode
npm run test:coverage # coverage report
```

---

## Scripts

| Script | Command |
|---|---|
| `npm run dev` | `NODE_ENV=development node --watch src/server.js` |
| `npm start` | `NODE_ENV=production node src/server.js` |
| `npm test` | `NODE_ENV=test jest --runInBand` |
| `npm run test:models` | Model + index suites only (unit + `models.indexes`) |
| `npm run test:watch` | Jest watch mode |
| `npm run test:coverage` | Jest with coverage |
| `npm run token:dev` | Mint a local dev-mock bearer token (dev/test only) |
| `npm run db:migrate` | Sync indexes + apply the fraud retention policy |
| `npm run db:migrate:dry` | Report declared indexes, change nothing |
| `npm run db:migrate:check` | Declared vs. actual per model; exits non-zero on drift |
| `npm run seed:dev` | Apply the fictional dev fixtures |
| `npm run seed:dev:force` | Reset the fixture batch, then reseed |
| `npm run seed:reset` | Remove exactly the fixture rows (`-- --keep-users` to spare identities) |

---

## Remaining work

1. Provide the **project specification PDF** to confirm the numbers deliberately
   left unset: fee amounts, claim window days, eligibility policy, masking format,
   winner-selection rules and retention periods.
2. Supply **VELOOP auth** details (issuer, JWKS/keys, claims, admin-role source) to
   move `AUTH_MODE=jwt` to the real issuer.
3. Supply the **VELOOP wallet** API contract to configure `WALLET_MODE=http`
   (base URL, key, path templates, balance field) and then build the atomic,
   idempotent entry-charge + refund services on the existing ledger model.
4. Build the write paths on these models: giveaway CRUD/publish, entry + fee
   charging, the draw job, announcement, the claim pipeline, fraud rule evaluation —
   each as a service that the model layer already constrains.
5. Add a persistent/Redis rate-limit store and monitoring for multi-instance deploys.
