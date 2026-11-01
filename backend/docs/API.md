# VELOOP Rewards Giveaway — REST API

Base URL: **`/api/v1`** · Content type: `application/json`

This document is the contract for the giveaway HTTP API. It is **verified by an
automated test** (`tests/integration/api.docs.test.js`) that compares every
endpoint below against the routes express actually registered
(`src/utils/listRoutes.js`). If an operation is listed here it exists; if a route
is added or removed, either this file or the test fails — the two cannot drift.

> Honesty notes are marked **[INTEGRATION REQUIRED]**. They describe a real
> dependency that this repository provides a *seam* for but cannot demonstrate
> end-to-end, because the external VELOOP service, its credentials, and the
> 88-page specification PDF are not present in this workspace. Business numbers
> (fees, eligibility thresholds, retention windows) are **configuration**, never
> hard-coded, and must be confirmed against the specification before go-live.

---

## 1. Authentication

Every protected endpoint expects a bearer access token:

```
Authorization: Bearer <access token>
```

The token is verified in exactly one place, `src/integrations/veloopAuth.js`,
selected by `AUTH_MODE`:

| Mode | Behaviour | Where it may run |
| --- | --- | --- |
| `jwt` | Verifies the signature with `JWT_SECRET` (HMAC) or `JWT_PUBLIC_KEY` (RSA/EC), enforces expiry, and — when configured — `JWT_ISSUER` / `JWT_AUDIENCE`. This is the production seam. | Production |
| `dev-mock` | Verifies tokens signed with `DEV_JWT_SECRET` so the API and its tests run without the external issuer. **Hard-refused in production** (`validateRuntimeConfig()` blocks boot). | Local / test only |

**[INTEGRATION REQUIRED] — production auth.** To go live you must, as the VELOOP
platform owner:

1. Set `AUTH_MODE=jwt` and provide `JWT_PUBLIC_KEY` (preferred) or a shared
   `JWT_SECRET` (≥ 32 chars). Set `JWT_ISSUER` and `JWT_AUDIENCE` to the values
   your issuer stamps, so tokens minted for another audience are rejected.
2. Ensure issued tokens carry a subject (`sub`, or one of `userId` / `user_id` /
   `veoopId` / `veId`) and, for administrators, an explicit `admin` role claim
   (`roles` / `realm_roles` / `authorities`).
3. This application never mints production tokens and never stores passwords.

### Identity, not impersonation

The `userId` a request acts on is **derived from the verified token** via
`resolveIdentity` → `User.resolve(sub)`, and placed on `req.auth.userId`. It is
**never** read from a request body or query. Bodies that try to supply a `userId`
(or any unrecognised key) are rejected with `400 VALIDATION_ERROR` because every
write schema is `.strict()`.

`resolveIdentity` also **replaces the token's roles with the server-side roles**
stored for that account, so an old token cannot outlive a revoked admin. When the
database is unreachable, roles fall back to the verified token claims, the
`userId` is marked unresolved, and any store-dependent operation returns an
honest `503` rather than silently granting or losing privileges.

### Authorization

`/api/v1/admin/*` is **deny-by-default**: `authenticate → requireAdmin →
resolveIdentity → requireAdmin`. The token role is checked first (no I/O), then
the store confirms it. Ordinary accounts receive `403 FORBIDDEN`; missing/invalid
credentials receive `401`.

---

## 2. Response envelope

Success (a single resource or a list):

```json
{ "data": { }, "meta": { "page": 1, "limit": 20, "total": 0, "totalPages": 1 } }
```

`meta` is present only on paginated/collection reads. There is exactly one
pagination shape, and `limit` is capped at **100**.

Errors are produced centrally by `errorHandler` — never a stack trace, never an
internal message in production:

```json
{ "error": { "code": "ALREADY_JOINED", "message": "…", "details": { } }, "requestId": "…" }
```

`details` carries only non-sensitive context (limits, dates, the caller's own
resource ids, the failed rule name). Internal ids such as MongoDB `_id` are
serialised as `id`; private fields and winner PII never appear.

---

## 3. Error codes (stable, non-sensitive)

| Code | HTTP | Meaning |
| --- | --- | --- |
| `LOGIN_REQUIRED` | 401 | No/missing access token. |
| `TOKEN_EXPIRED` | 401 | Token `exp` passed. |
| `INVALID_TOKEN` | 401 | Signature/claims invalid, or no subject. |
| `FORBIDDEN` | 403 | Authenticated but not permitted (e.g. non-admin on admin). |
| `ACCOUNT_NOT_ACTIVE` | 403 | Blocked/suspended account. |
| `ENTRY_BLOCKED` | 403 | The risk engine rejected this entry. The message is deliberately generic and discloses nothing about which rule fired — see §8. |
| `IDENTITY_UNRESOLVED` | 403 | Token subject maps to no usable account. |
| `GIVEAWAY_NOT_FOUND` | 404 | Unknown **or unpublished** draw (for non-admins). |
| `NO_CURRENT_GIVEAWAY` / `NO_PREVIOUS_GIVEAWAY` | 404 | Nothing open / nothing ended yet. |
| `NOT_A_WINNER` / `WINNER_NOT_FOUND` / `CLAIM_NOT_FOUND` / `PARTICIPATION_NOT_FOUND` / `PRIZE_NOT_AVAILABLE` | 404 | Referenced resource not visible to caller. |
| `GIVEAWAY_ENDED` / `GIVEAWAY_NOT_STARTED` / `GIVEAWAY_NOT_ACTIVE` | 409 | Entry rejected by lifecycle/window. |
| `ILLEGAL_TRANSITION` | 409 | Not a permitted lifecycle move. |
| `ALREADY_JOINED` | 409 | One participation per user per draw (DB-unique). |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | A supplied `Idempotency-Key` was already used for a **different** request. |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | A request with this `Idempotency-Key` is still completing; retry shortly. |
| `ENTRY_LIMIT_REACHED` | 409 | Per-user / per-day / per-prize cap reached. |
| `RESULTS_NOT_AVAILABLE` | 409 | No announced winners yet. |
| `WINNERS_ALREADY_SELECTED` | 409 | Tier slots already filled. |
| `DRAW_WINDOW_OPEN` | 409 | Draw attempted before entries closed. |
| `SLUG_TAKEN` / `POSITION_TAKEN` | 409 | Unique config collision. |
| `CLAIM_ALREADY_SUBMITTED` | 409 | Double submit guard. |
| `FRAUD_EVENT_DECIDED` | 409 | Fraud event already terminal. |
| `INSUFFICIENT_BALANCE` | 402 | Wallet too low for the entry fee. |
| `ENTRY_CURRENCY_NOT_ALLOWED` / `PRIZE_MISMATCH` / `PRIZE_SELECTION_REQUIRED` / `DEVICE_REFERENCE_REQUIRED` / `CLAIM_DETAILS_INVALID` | 422 | Rule/shape rejection. |
| `CLAIM_EXPIRED` | 410 | Claim deadline passed (operator may extend). |
| `VALIDATION_ERROR` / `INVALID_JSON` / `INVALID_IDENTIFIER` | 400 | Malformed request. |
| `IDEMPOTENCY_KEY_REQUIRED` | 400 | A wallet operation was attempted without an idempotency key. |
| `PAYLOAD_TOO_LARGE` | 413 | Body over `JSON_BODY_LIMIT`. |
| `RATE_LIMITED` | 429 | Over the request budget. |
| `WALLET_NOT_CONFIGURED` / `WALLET_UNREACHABLE` / `DATABASE_UNAVAILABLE` / `SERVICE_UNAVAILABLE` | 503 | A dependency is not reachable / not configured. |
| `TRANSACTION_INFRASTRUCTURE_REQUIRED` | 503 | A paid entry was attempted on a MongoDB that cannot run transactions (no replica set). Fail-closed — see §5. |
| `ENTRY_CHARGE_FAILED` | 502 | Wallet provider failed the debit; no entry recorded. |

---

## 4. Endpoints

Legend — 🔓 public · 🔑 any authenticated user · 🛡️ admin only.

### 4.1 Service index & health

| | Method & path | Auth | Description |
| --- | --- | --- | --- |
|  | `GET /api/v1` | 🔓 | Self-reported endpoint index (generated from the live router). |

### 4.2 Giveaways — public reads

| | Method & path | Auth | Description |
| --- | --- | --- | --- |
|  | `GET /api/v1/giveaways` | 🔓 | Paginated, filterable list (`status`, `featured`, `sort`, `order`, `page`, `limit`). Non-admins see published draws only. |
|  | `GET /api/v1/giveaways/current` | 🔓 | The draw open for entries right now. `404 NO_CURRENT_GIVEAWAY` otherwise. |
|  | `GET /api/v1/giveaways/previous` | 🔓 | Most recent finished (ENDED/ARCHIVED) published draws. `404 NO_PREVIOUS_GIVEAWAY` otherwise. |
|  | `GET /api/v1/giveaways/by-slug/:slug` | 🔓 | Stable human key lookup. |
|  | `GET /api/v1/giveaways/:id` | 🔓 | One draw. Unpublished → `404` for non-admins. |
|  | `GET /api/v1/giveaways/:id/prizes` | 🔓 | Configured tiers incl. public fee config; internal code-pool refs and `_id` are stripped. |
|  | `GET /api/v1/giveaways/:id/winners` | 🔓 | **Announced, masked** winners only (alias + opaque id — never emails/phones/userIds). Paginated. `409 RESULTS_NOT_AVAILABLE` before publication. |

### 4.3 Participation — authenticated user

| | Method & path | Auth | Description |
| --- | --- | --- | --- |
|  | `GET /api/v1/giveaways/my-status` | 🔑 | The caller's own entries (filter `giveawayId`, `status`; paginated) enriched with winner/claim state. |
|  | `GET /api/v1/giveaways/:id/my-status` | 🔑 | The caller's entry state for one draw (joined, window open, winner, claim). |
|  | `POST /api/v1/giveaways/:id/join` | 🔑 | **The only money-moving endpoint.** Body `{ entries?, currency?, prizeId?, deviceReference?, sessionReference? }` (strict — no `userId`/`amount`/`balance`/`status`). Identity from the token, never the body. Optional header `Idempotency-Key` (16-128 chars of `A-Za-z0-9_-`) makes a retried paid join replay instead of double-charge. `201` on success; returns the authoritative `participation`, server-resolved `pricing`, updated `balance` and a `replayed` flag. See §5. |
|  | `GET /api/v1/wallet/balances` | 🔑 | Read-only view of the wallet. In `http` mode each balance is labelled by source/age/authoritativeness (from the external VELOOP provider). In `dev` mode the balances are **FICTIONAL** in-database fixtures (collection `DevWalletBalance`), reported `authoritative:true` with a `mode:'dev'` note that they are never real VELOOP funds. `503 WALLET_NOT_CONFIGURED` when nothing is knowable. |
|  | `GET /api/v1/wallet/transactions` | 🔑 | The caller's **own** entry-fee ledger history (newest first, paginated `page`/`limit`). Read-only; identity comes from the token — there is no `userId` parameter. Each row exposes transactionId, type, direction, currency, amount, status (`PENDING`/`SUCCESS`/`FAILED`/`REVERSED`), balanceBefore/After (null when the provider returned none — never invented) and the giveaway/prize reference. Idempotency keys, device classes and internal request context are deliberately excluded. |

### 4.4 Claims — the winner's side

| | Method & path | Auth | Description |
| --- | --- | --- | --- |
|  | `GET /api/v1/claims` | 🔑 | The caller's claims (filter `status`, `giveawayId`; paginated) with the computed next `action`. |
|  | `GET /api/v1/claims/:id` | 🔑 | One of the caller's claims; fulfilment is masked. A non-owner gets `404` (existence is not confirmed). |
|  | `POST /api/v1/claims/:id/submit` | 🔑 | Winner supplies fulfilment details. The required shape is driven by the claim's `claimType`; a passed deadline yields `410 CLAIM_EXPIRED`. |

### 4.5 Administration — 🛡️ admin only (deny-by-default)

| | Method & path | Description |
| --- | --- | --- |
|  | `GET /api/v1/admin/stats` | Aggregate counts + `asOf`. |
|  | `POST /api/v1/admin/giveaways` | Create a draw (config blocks validated, allow-listed field writes). |
|  | `PATCH /api/v1/admin/giveaways/:id` | Update configuration. `slug` is immutable; `status` changes go through the transition endpoint. |
|  | `GET /api/v1/admin/giveaways/:id/config` | Full config incl. private blocks (admin view). |
|  | `POST /api/v1/admin/giveaways/:id/publish` | Publish / unpublish (audited). |
|  | `POST /api/v1/admin/giveaways/:id/transition` | The only lifecycle move; illegal jumps → `409 ILLEGAL_TRANSITION`. |
|  | `POST /api/v1/admin/giveaways/:id/prizes` | Add a prize tier (priced by configuration; position unique). |
|  | `PATCH /api/v1/admin/prizes/:id` | Update a tier (incl. `active:false` soft-remove). |
|  | `GET /api/v1/admin/participations` | Authorized participation view (who/when/what). Correlation hashes are **not** projected. Paginated. |
|  | `GET /api/v1/admin/ledger` | Entry-fee ledger rows for reconciliation. Paginated. |
|  | `POST /api/v1/admin/participations/:id/void` | Void/disqualify an entry; optional compensating refund. |
|  | `GET /api/v1/admin/giveaways/:id/winners` | Full winner rows (references + provenance) for review. Paginated. |
|  | `POST /api/v1/admin/giveaways/:id/winners/draw` | Draw remaining slots for a prize (`crypto.randomInt`), recording provenance. Requires the entry window closed and a claim window configured. |
|  | `POST /api/v1/admin/giveaways/:id/winners/notify` | Move HOLD → PRIVATE_NOTIFIED (status only; delivery needs the notification layer). |
|  | `POST /api/v1/admin/giveaways/:id/winners/publish` | One-way publish (→ ANNOUNCED) of masked, non-disqualified winners. |
|  | `PATCH /api/v1/admin/winners/:id` | Set verification; `DISQUALIFIED` requires a reason. Never deletes a row. |
|  | `GET /api/v1/admin/claims` | Operator claim queue (fulfilment included for shipping). Paginated. |
|  | `POST /api/v1/admin/claims/expire` | Sweep open, past-deadline claims to EXPIRED. |
|  | `POST /api/v1/admin/claims/:id/review` | Transition a claim (SUBMITTED→PROCESSING→COMPLETED or back) per the model's transition table. |
|  | `POST /api/v1/admin/claims/:id/extend` | Extend a deadline forward — the only audited reopen path. An already-EXPIRED claim cannot be revived. |
|  | `GET /api/v1/admin/fraud-events` | Suspicious-event queue (hashes/signals only). Paginated. |
|  | `GET /api/v1/admin/fraud-events/:id` | One event (references, never re-hydrated identity). |
|  | `POST /api/v1/admin/fraud-events/:id/review` | Take an event UNDER_REVIEW. |
|  | `POST /api/v1/admin/fraud-events/:id/decision` | DISMISSED or CONFIRMED (terminal; a second decision → `409 FRAUD_EVENT_DECIDED`). |
|  | `GET /api/v1/admin/audit-logs` | Audit trail (paginated, filters). |
|  | `GET /api/v1/admin/audit-logs/:entityType/:entityId` | History for one entity. |

### 4.6 Authenticated principal

| | Method & path | Auth | Description |
| --- | --- | --- | --- |
|  | `GET /api/v1/auth/me` | 🔑 | The caller's verified principal (subject, resolved roles, sources). |

---

## 5. Entry flow (how the money path behaves)

`POST /giveaways/:id/join` is the only endpoint that can move money, so it runs a
fixed, server-authoritative pipeline (see
`src/services/participation.service.js`):

1. Re-validate the entry window **on the server clock** → `GIVEAWAY_ENDED` /
   `GIVEAWAY_NOT_STARTED` / `GIVEAWAY_NOT_ACTIVE`.
2. Evaluate eligibility rules from configuration (fail-closed, see §6).
3. Resolve the fee from configuration (`Prize.resolveFee`) — the currency and
   amount are **never** taken from the client. If a `currency` is supplied it may
   only select among the currencies the tier actually prices, otherwise
   `ENTRY_CURRENCY_NOT_ALLOWED`. There is no request field that carries a
   client-chosen amount.

**Pre-flight risk gate (before any write or debit).** Once the window, eligibility
and the server-resolved fee are established and the device/session reference is
hashed, `fraud.service.assessEntryRisk` runs (§8). A `REJECT` throws `403
ENTRY_BLOCKED` **before** the idempotency intake, the participation write and the
wallet call — so a blocked join moves no money and leaves no row on the `dev`,
`http` and free paths alike. A `FLAG_FOR_REVIEW` proceeds and only queues evidence.

4. **Idempotency intake (before any write).** If an `Idempotency-Key` header is
   present, `(userId, key)` is looked up: a completed key **replays** the stored
   result with no second charge; a still-running key → `409 IDEMPOTENCY_IN_PROGRESS`;
   the same key used for a different request (different giveaway/prize/currency/
   entries fingerprint) → `409 IDEMPOTENCY_KEY_CONFLICT`.
5. **Free entry (`charged === 0`)** moves no money: the participation is created
   PENDING → CONFIRMED via the unique `(userId, giveawayId)` double-entry lock
   (a duplicate → `409 ALREADY_JOINED`) and needs no transaction.
6. **Paid entry — integrity depends on `WALLET_MODE`:**

   - **`dev` (in-database, transactional):** authoritative *fictional* balances live
     in `DevWalletBalance` in this same MongoDB, so the whole money movement —
     **balance debit + participation + SUCCESS ledger row (before/after balance +
     provider reference) + audit event + idempotency record** — commits as **ONE
     MongoDB transaction** (`src/config/db.js` → `withTransaction`). Any failure
     aborts the transaction, so a failed join leaves **no partial charge and no
     half-written participation**. Concurrent submits for the same user collide on
     the participation unique index, so a fee is never deducted twice.
   - **`http` (external provider, saga):** the provider debit cannot live inside a
     local transaction. Consistency relies on the **idempotency key sent to the
     provider** plus our ledger `PENDING → SUCCESS` and a compensating `REVERSAL`
     on a later local failure. This path is deliberately **not** presented as
     atomic with the database.
   - **`disabled`:** a paid entry returns `503 WALLET_NOT_CONFIGURED` rather than
     inventing a balance.

7. **Fail-closed when transactions are unavailable.** A paid `dev` join first probes
   whether the deployment supports transactions. If it does not (a standalone
   MongoDB) and `MONGODB_REQUIRE_TRANSACTIONS` is `true` (the default), the join
   returns `503 TRANSACTION_INFRASTRUCTURE_REQUIRED` **before touching any money** —
   it never silently falls back to unsafe sequential writes. Free entries and all
   reads keep working. Only an operator who explicitly sets
   `MONGODB_REQUIRE_TRANSACTIONS=false` gets the relaxed sequential path.

> **[DEPLOYMENT REQUIRED] — MongoDB replica set for paid joins.** Multi-document
> transactions (and therefore the atomic `dev` money path) exist only on a replica
> set or a sharded cluster (mongos). A standalone `mongod` cannot run them, so paid
> `dev` entries fail closed with `503`. Provision a replica set, or run free-entry
> draws, in every environment where paid joins must succeed.

> **[HONESTY] — the `dev` wallet is not VELOOP.** Its balances are FICTIONAL
> development fixtures (`seedBatch`-tagged, `source: SEED_FIXTURE`) and are refused
> in production by `validateRuntimeConfig` (`WALLET_MODE=dev`), exactly like the
> `dev-mock` auth mode. The demo fee table below is supplied **configuration data**
> encoded as `Prize.entryCurrency` / `entryAmount`, never a hard-coded branch:
> iPhone 15 Pro 250 `VE` · Apple Watch 200 `VE` · AirPods 500 `SVE` · ₹2,000 Amazon
> voucher 500 `VE` · ₹500 Amazon voucher 300 `VE` · ₹20 voucher 2,000 `TOKEN`.

## 6. Eligibility — fail-closed by default

`Giveaway.eligibility` is data (countries, `minKycLevel`, `minAccountAgeDays`,
`requireVerifiedEmail`, blocked statuses). It is interpreted only in
`eligibility.service.js`. **[INTEGRATION REQUIRED]** This workspace has **no
geolocation provider and no KYC provider**, so:

- A geo-restricted draw with no observable country → `403
  GEO_VERIFICATION_UNAVAILABLE`. To make such draws usable, set
  `ELIGIBILITY_GEO_SOURCE=header` behind a proxy that stamps
  `ELIGIBILITY_GEO_HEADER` (2-letter ISO country), or connect a provider.
- `minKycLevel: FULL` → `403 ELIGIBILITY_REQUIRED` (cannot be verified with the
  identity cache). `BASIC` is honoured only when `User.kyc.status === VERIFIED`.
- `requireVerifiedEmail` asserts **presence only** (the cache has no
  verified-email flag); it is not proof of ownership.

## 7. Winner masking & privacy

Public winner reads (`GET /giveaways/:id/winners`) return only `rank`, the prize
snapshot, an announced timestamp, and a masked `display` block
(`{ displayAlias, maskedUserId }`). The masking helper accepts no caller-supplied
text, so an email or phone can never populate it. Raw `userId` appears only in
the **admin** winner/participation views, which are role-gated and audited.

---

## 8. Anti-fraud controls, rate limiting & authorization invariants

> **[HONESTY] — this system is NOT fraud-proof.** The controls below are
> *heuristic, configurable and corroborated*. Every default threshold shipped in
> `config.security.fraud` is a **provisional engineering default that requires
> VELOOP business approval** before it is treated as policy. `FRAUD_ENGINE_ENABLED=false`
> is an instant operator kill switch (the engine then always ALLOWs and writes nothing).

### 8.1 The entry risk engine (`src/services/fraud.service.js`)

A dedicated, read-only assessment runs on `POST /join` **before any write or
charge**. It evaluates each enabled rule and, where the observed value crosses the
threshold, raises a typed signal:

| Signal | Category | Source |
| --- | --- | --- |
| `DEVICE_VELOCITY` / `IP_VELOCITY` | velocity | distinct accounts sharing one salted device/IP hash on this draw |
| `REPEATED_FAILURE` | pattern | recent duplicate-attempt / repeated-failure events for the account |
| `PARTICIPATION_VELOCITY` | pattern | distinct draws this account joined inside the window |
| `BOT_PATTERN` | pattern | join-attempt volume inside the window |
| `ACCOUNT_AGE` | pattern | account younger than `minAgeSec` (only when that knob is on) |

Decision semantics:

- **ALLOW** — no signal. The join proceeds unchanged.
- **FLAG_FOR_REVIEW** — at least one signal but not corroborated enough to reject.
  The join still proceeds; one merged `FraudEvent` per signal (action `FLAGGED`) is
  written to the admin review queue.
- **REJECT** — requires `rejectMinSignals` **distinct categories** AND at least one
  **non-velocity** category. The join is refused with a generic `403 ENTRY_BLOCKED`
  and the events are recorded with action `ENTRY_BLOCKED`.

**One shared IP or device is never treated as proof** — a lone velocity signal (or
a device+IP pair with no pattern corroborator) can only FLAG, never REJECT.
Detection logic is never exposed to the caller: the only user-facing signal is the
generic message; the rule key, metric, observed/threshold values stay on the
server-side `FraudEvent`.

### 8.2 Non-blocking surfaces (claims, admin, rate-limit bursts)

Claim submission and sensitive admin writes are **never auto-rejected by the
engine**. `assessNonBlocking` records abuse patterns (e.g. a 429 burst) as evidence
for the review queue only. Enforcement for these surfaces is the rate limiter.

### 8.3 Rate-limit tiers

Global, `auth`, `entry`, `claim` and `admin` tiers each return the same stable `429
RATE_LIMITED` contract, keyed by the authenticated subject when present (so one
user cannot multiply their quota by switching networks) and falling back to the
client IP. The store is **in-memory / single-instance**; a Redis or Mongo store is
the documented multi-instance upgrade path (the interface is unchanged). On the
sensitive tiers (`auth`/`entry`/`claim`/`admin`) a 429 also fires a best-effort
non-blocking fraud signal.

### 8.4 Privacy of the evidence

`FraudEvent` correlates behaviour by **salted hashes and coarse buckets only** —
no raw IP, user-agent, name, email or phone ever lands there. Records merge on
repeat, carry a TTL retention policy, and are append-only for the review queue
(app code never deletes fraud history).

### 8.5 Authorization invariants (verified by tests)

- **Admin** — `/api/v1/admin/*` is `authenticate → requireAdmin → resolveIdentity →
  requireAdmin`, and every WRITE additionally `requireResolvedIdentity`. Authority
  comes only from the verified token **confirmed against server-side roles**; a body
  `userId`/role is rejected by the strict schemas, and a token that merely *claims*
  `admin` while the store says otherwise is refused (`403`).
- **Winners** — a draw only runs on an ENDED window, uses `crypto.randomInt`
  (CSPRNG), records auditable provenance, is capped by `Prize.winnerCount` via the
  unique `(prizeId, rank)` index (repeated selection → `WINNERS_ALREADY_SELECTED`,
  concurrent draws never exceed the cap), and separates selection (`HOLD`) from
  one-way publication (`ANNOUNCED`). Public reads expose masked, announced rows only.
- **Claims** — ownership-scoped with a `404`-not-`403` read, a physical/digital
  fulfilment shape driven by `claimType`, an absolute deadline (`410 CLAIM_EXPIRED`),
  a duplicate-submit guard, and an audited operator extension as the only reopen path.

## 9. Configuration keys (`.env`)

| Key | Default | Purpose |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` hard-disables `dev-mock` auth and seed fixtures. |
| `MONGODB_URI` | — | Connection string. `bufferCommands` is off: offline ⇒ honest `503`. |
| `PORT` | `4000` | HTTP port. |
| `AUTH_MODE` | `jwt` in prod | `jwt` \| `dev-mock`. |
| `JWT_SECRET` / `JWT_PUBLIC_KEY` | — | Verification key(s) for `jwt` mode. |
| `JWT_ISSUER` / `JWT_AUDIENCE` | — | Checked when set. |
| `DEV_JWT_SECRET` | — | Signing key for `dev-mock` (non-production only). |
| `CORS_ORIGINS` | — | Comma-separated allow-list. |
| `WALLET_MODE` | `disabled` | `disabled` \| `dev` (fictional in-DB balances, **refused in production**) \| `http` (external provider). |
| `WALLET_BASE_URL` / `WALLET_API_KEY` / `WALLET_BALANCE_PATH` / `WALLET_DEBIT_PATH` / `WALLET_BALANCE_FIELD` | — | Real wallet seam (`http` mode). |
| `MONGODB_REQUIRE_TRANSACTIONS` | `true` | When true, a paid `dev` join **fails closed** (`503 TRANSACTION_INFRASTRUCTURE_REQUIRED`) if the deployment cannot run transactions, instead of doing unsafe sequential writes. Requires a replica set. |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `300` | Global throttle. |
| `RATE_LIMIT_AUTH_MAX` | `10` | `/auth` throttle. |
| `RATE_LIMIT_ENTRY_MAX` | `20` | `/giveaways/:id/join` throttle. |
| `RATE_LIMIT_CLAIM_MAX` | `30` | `POST /claims/:id/submit` throttle. |
| `RATE_LIMIT_ADMIN_MAX` | `120` | Sensitive admin WRITE throttle. |
| `ELIGIBILITY_GEO_SOURCE` | `none` | `none` \| `header`. |
| `ELIGIBILITY_GEO_HEADER` | `x-country-code` | Header read when source is `header`. |
| `FRAUD_RETENTION_DAYS` | unset | When set, the migration applies a TTL to fraud events. |
| `FRAUD_ENGINE_ENABLED` | `true` | Kill switch. When `false` the risk engine always ALLOWs and writes nothing. |
| `FRAUD_REJECT_MIN_SIGNALS` | `2` | **Provisional, pending business approval.** Distinct signal categories required before an entry is REJECTED (≥ 1 must be non-velocity). |
| `FRAUD_DEVICE_VELOCITY_*` / `FRAUD_IP_VELOCITY_*` | `3` / `5` | **Provisional.** Distinct accounts sharing one device/IP hash on a draw. A lone velocity hit can only FLAG, never REJECT. |
| `FRAUD_DUPLICATE_*` | window `300s` / `5` | **Provisional.** Recent duplicate/failed participation attempts for the account. |
| `FRAUD_MIN_ACCOUNT_AGE_SECONDS` | `0` (off) | **Provisional.** When > 0, a younger account is a LOW corroborating signal only. |
| `LOG_LEVEL` | `info` | pino level; redaction of secrets is always on. |

## 10. Running & testing

```bash
npm test                         # full suite (unit + integration)
npm run test:models              # data-model + API flows against an in-memory MongoDB
node src/server.js               # live server (needs a reachable MongoDB)
```

The API is exercised by `tests/integration/api.contract.test.js` (HTTP surface
with no DB), `tests/integration/api.flows.test.js` (real end-to-end flows on an
in-memory MongoDB) and `tests/integration/api.docs.test.js` (this document must
match the live router).
