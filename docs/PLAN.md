# VELOOP Rewards Giveaway — Master Plan (A–J)

> **Status: PROVISIONAL — pending source-of-truth verification.**
> The 88-page project specification PDF was **not found** in this workspace or any
> searchable location on this machine (verified 2026-10-28). This plan is built from
> the project owner's explicitly stated scope. Every item tagged `[ASSUMPTION]`
> must be verified against the PDF before implementation of that area begins.
> Items tagged `[EXTERNAL]` depend on VELOOP systems that are not available in this
> workspace and require integration details (see section J).

---

## 0. Verified Environment & Workspace Facts

| Fact | Value |
|---|---|
| Workspace at planning time | Empty — no code, no Git repo, no assets, no PDF |
| Node.js / npm | v24.17.0 / v11.13.0 |
| Git / Docker | 2.42 / 29.9.1 |
| MongoDB | No local binary → Dockerized MongoDB (replica set, for transactions) or Atlas |
| Existing auth system | None found → JWT-compatible design, mockable in dev |
| Required stack (fixed) | React + Vite + Bootstrap + CSS Modules + Hooks / Node + Express + MongoDB + Mongoose |

---

## A. Requirements Checklist

Source column: **OWNER** = stated by project owner in brief; **PDF** = must be
confirmed against the specification document when it becomes available.

### A1. Public giveaway experience
| # | Requirement | Source | Verify |
|---|---|---|---|
| A1.1 | Premium, responsive giveaway homepage | OWNER | ☐ |
| A1.2 | Promotional banner (hero) with branding | OWNER | ☐ PDF defines exact design/copy |
| A1.3 | Grid/list of active giveaways with images, prize info, fee, countdown | OWNER | ☐ |
| A1.4 | Individual giveaway details page per prize | OWNER | ☐ |
| A1.5 | Countdown timer per giveaway (live, accurate to server time) | OWNER | ☐ |
| A1.6 | Giveaway lifecycle states displayed correctly | PDF | ☐ exact state names/rules |
| A1.7 | Winner announcements on public pages | OWNER | ☐ |
| A1.8 | Winner history page (past giveaways and winners) | OWNER | ☐ winner identity display rules (full name? masked?) |

### A2. Entry & fees
| # | Requirement | Source | Verify |
|---|---|---|---|
| A2.1 | Entry fees payable in VEs, SVEs, and Tokens (3 currencies) | OWNER | ☐ fees per giveaway; multi-currency rules in PDF |
| A2.2 | Wallet balance validation before entry | OWNER | ☐ |
| A2.3 | Secure, atomic entry-fee deduction (no double-charge, no lost charge) | OWNER | ☐ |
| A2.4 | Entry limits per user (free entries, paid extra entries, caps) | PDF | ☐ exact policy unknown |
| A2.5 | Refund policy on cancellation/invalid entry | PDF | ☐ |
| A2.6 | Idempotent entry submission | OWNER | ☐ |

### A3. Users & authentication
| # | Requirement | Source | Verify |
|---|---|---|---|
| A3.1 | User authentication compatible with existing VELOOP auth (JWT/access token) | OWNER + EXTERNAL | ☐ token issuer, claims, refresh flow |
| A3.2 | Participation states (not-logged-in / logged-in / entered / winner) | OWNER | ☐ |
| A3.3 | Eligibility rules (geo, KYC, age, account standing) | PDF | ☐ unknown until PDF |
| A3.4 | Profile/linking of VELOOP account identity | EXTERNAL | ☐ |

### A4. Wallet integration
| # | Requirement | Source | Verify |
|---|---|---|---|
| A4.1 | Read wallet balances (VE / SVE / Token) | EXTERNAL | ☐ API contract unknown |
| A4.2 | Debit entry fee securely | OWNER + EXTERNAL | ☐ own ledger vs. VELOOP ledger (see E8) |
| A4.3 | Transaction history / entry fees visible to user | PDF | ☐ |

### A5. Winners & claims
| # | Requirement | Source | Verify |
|---|---|---|---|
| A5.1 | Winner selection mechanism | PDF | ☐ random draw? ticket-weighted? — CRITICAL unknown |
| A5.2 | Winner announcement (in-app, possibly email/push) | PDF | ☐ notification channels |
| A5.3 | Prize claim flow with status tracking | OWNER | ☐ claim windows, KYC at claim |
| A5.4 | Winner history / hall of fame | OWNER | ☐ |
| A5.5 | Unclaimed prize / forfeiture handling | PDF | ☐ |

### A6. Admin
| # | Requirement | Source | Verify |
|---|---|---|---|
| A6.1 | Admin interface for giveaway CRUD (create, edit, publish, cancel, close) | OWNER | ☐ |
| A6.2 | Protected administrative actions (role-based) | OWNER | ☐ roles list from PDF |
| A6.3 | Trigger/manage winner draw and announcement | OWNER | ☐ |
| A6.4 | Manage claims, fraud flags, user blocks | PDF | ☐ |
| A6.5 | Audit log viewing | OWNER | ☐ |
| A6.6 | Prize image/content asset management | PDF | ☐ |

### A7. Security & anti-fraud
| # | Requirement | Source | Verify |
|---|---|---|---|
| A7.1 | Fraud detection heuristics | OWNER + PDF | ☐ exact signals/thresholds |
| A7.2 | Rate limiting on sensitive endpoints | OWNER | ☐ numeric limits |
| A7.3 | Idempotency keys on entry/fee/claim operations | OWNER | ☐ |
| A7.4 | Audit logs for all state-changing operations | OWNER | ☐ retention policy |
| A7.5 | Secure APIs (transport, input validation, authorization) | OWNER | ☐ |

### A8. Engineering & delivery
| # | Requirement | Source | Verify |
|---|---|---|---|
| A8.1 | Frontend/backend integration | OWNER | ☐ |
| A8.2 | Automated testing (success, failure, edge, concurrency) | OWNER | ☐ |
| A8.3 | Documentation | OWNER | ☐ |
| A8.4 | Deployment | OWNER | ☐ target environment unknown |
| A8.5 | Dev mock data strictly separated from production data | OWNER | ☐ |

---

## B. Architecture Plan

**Monorepo** with two deployables and one shared contract folder:

```
[Browser] ── HTTPS ── [React SPA (Vite build, CDN/static host)]
                            │ REST JSON (HTTPS)
                            ▼
                      [Express API]  ──►  [MongoDB (replica set)]
                            │                 - Mongoose models
                            │                 - sessions, ledger, audit
                            ├──► [VELOOP Auth]      (EXTERNAL: JWT verify via JWKS/secret)
                            ├──► [VELOOP Wallet]    (EXTERNAL: balance/debit APIs) [ASSUMPTION]
                            └──► [Notifications]    (EXTERNAL: email/push) [ASSUMPTION]
```

Key decisions:
- **B1. Stateless API** with access-token (JWT) auth; refresh handled by/compatible
  with existing VELOOP auth `[EXTERNAL — verify issuer, algorithm, claims]`.
- **B2. Money-critical path** (entry fee deduction): if VELOOP exposes a debit API,
  call it inside a saga with compensation (refund on entry failure). If not, use a
  local **ledger** mirroring balances with MongoDB multi-document transactions to
  guarantee atomicity. `[ASSUMPTION — PDF + VELOOP API docs decide which]` (see E8, J3).
- **B3. Lifecycle engine**: giveaway state (`DRAFT → SCHEDULED → LIVE → ENTRIES_CLOSED
  → DRAW_PENDING → COMPLETED / CANCELLED`) `[ASSUMPTION on names/transitions]`;
  server clock is authoritative; countdowns computed client-side from server-provided
  `endsAt` with clock-offset sync. A cron-style job auto-transitions expired giveaways.
- **B4. Winner draw**: executed by a protected admin-triggered job (manual trigger
  recommended for auditability), drawing from entries snapshot after entries close.
  Selection algorithm per PDF (likely random weighted by entry count) `[ASSUMPTION]`.
- **B5. Fraud layer**: request scoring pipeline — rate limiter → per-user entry
  velocity checks → device/IP heuristics → flag queue for admin review. Flags never
  auto-delete entries without audit trail `[ASSUMPTION on strictness]`.
- **B6. Frontend**: React Router SPA; Bootstrap 5 grid/components as base, visual
  customization via CSS Modules per component; React Query-style data layer (or thin
  custom hooks + context) for fetching/caching; Auth context; no state library beyond
  Context unless needed.
- **B7. Config**: `dotenv` per env; `NODE_ENV` gates seeding (mock data is dev/test only).

---

## C. Proposed Folder Structure

```
veloop-giveaway/
├── package.json                  # root: npm workspaces + orchestration scripts
├── docker-compose.yml            # mongodb (replica set) + optional mailhog
├── .github/workflows/ci.yml      # lint + test + build
├── docs/
│   ├── PLAN.md                   # this file
│   ├── API.md                    # endpoint contract (Phase 7)
│   └── DEPLOYMENT.md
├── shared/
│   └── contracts/                # zod schemas / constants shared conceptually
├── backend/
│   ├── package.json
│   ├── .env.example              # NO real secrets committed
│   ├── src/
│   │   ├── server.js  app.js
│   │   ├── config/               # env, db.js, constants.js
│   │   ├── middleware/           # auth.js, requireRole.js, rateLimiter.js,
│   │   │                         # idempotency.js, validate.js, errorHandler.js,
│   │   │                         # requestLogger.js
│   │   ├── models/               # mongoose models (see E)
│   │   ├── routes/               # auth.routes.js giveaways.routes.js entries.routes.js
│   │   │                         # wallet.routes.js winners.routes.js claims.routes.js
│   │   │                         # admin.routes.js
│   │   ├── controllers/
│   │   ├── services/             # giveawayService entryService feeService walletService
│   │   │                         # winnerDrawService fraudService auditService
│   │   ├── jobs/                 # lifecycleCron.js drawScheduler.js
│   │   ├── integrations/         # veloopAuth.js veloopWallet.js (adapters; mock impl
│   │   │                         # selected by env — the ONLY place mocks live)
│   │   └── utils/                # logger, errors, asyncHandler
│   └── tests/
│       ├── unit/  integration/  concurrency/
│       └── helpers/seed.js       # FAKE dev fixtures only
└── frontend/
    ├── package.json
    ├── vite.config.js            # dev proxy → backend
    ├── index.html
    └── src/
        ├── main.jsx  App.jsx  routes.jsx
        ├── api/                  # client.js (fetch wrapper, auth headers, retry)
        ├── context/              # AuthContext, WalletContext
        ├── hooks/                # useGiveaways, useCountdown, useEntry, useAuth...
        ├── pages/
        │   ├── home/             # Home.page.jsx + Home.module.css
        │   ├── giveaway/         # GiveawayDetail.page.jsx + .module.css
        │   ├── auth/  wallet/  winners/  claims/  notfound/
        │   └── admin/            # Dashboard, GiveawayForm, Draws, Claims, Fraud, AuditLogs
        ├── components/           # each: X.jsx + X.module.css
        │   ├── layout/           # Navbar, Footer, Shell
        │   ├── giveaway/         # GiveawayCard, CountdownTimer, EntryPanel,
        │   │                     # FeeBadge, StatusBadge, WinnerBanner
        │   ├── wallet/           # BalancePills, InsufficientBalanceModal
        │   └── common/           # ProtectedRoute, AdminRoute, Spinner, EmptyState...
        └── styles/               # global.css, variables.css (brand tokens)
```

Rules: CSS Modules everywhere except `styles/global.css`; Bootstrap imported as JS
bundle + grid/utility classes; component files colocated with their `.module.css`.

---

## D. API Endpoint Plan

Base URL `/api/v1`. All responses JSON; errors follow RFC-7807-style `{code,message,details}`.
Auth column: `PUBLIC` | `USER` (valid access token) | `ADMIN` (role claim + server check).

### Auth `[EXTERNAL — depends on VELOOP identity; endpoints below assume token
verification against VELOOP and a session-exchange for the SPA]`
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/auth/exchange` | PUBLIC | Exchange VELOOP access/code (OAuth callback) → app session tokens |
| GET | `/auth/me` | USER | Current user profile + participation summary |
| POST | `/auth/logout` | USER | Invalidate refresh token |

### Wallet
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/wallet` | USER | Balances: VE, SVE, Token (+ entry-spendable balances) |
| GET | `/wallet/transactions` | USER | Paginated ledger (entry fees, refunds) |

### Giveaways (public surfaces)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/giveaways` | PUBLIC | List w/ filters: `status`, `page`, `sort`; payload includes `endsAt`, fee tiers, "featured" flag for banner |
| GET | `/giveaways/featured` | PUBLIC | Banner/hero content |
| GET | `/giveaways/:slug` | PUBLIC | Details: images, description, rules text, fees, status, endsAt, entry count, **user-specific state** when authenticated (entered?, entries count, canEnter reasons) |
| GET | `/giveaways/:id/participants-count` | PUBLIC | Live entry count (cached) |
| GET | `/winners` | PUBLIC | Winner history feed (name-masking rules `[PDF]`) |
| GET | `/giveaways/:id/winners` | PUBLIC | Winners of a completed giveaway |

### Entry (the money path)
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/giveaways/:id/entries` | USER | Enter. **Requires `Idempotency-Key` header.** Body: `{currency: "VE"\|"SVE"\|"TOKEN", quantity}`. Server: validate status/eligibility/limits → check balance → atomic debit + entry insert (transaction) → return entry receipt or precise failure (`INSUFFICIENT_BALANCE`, `ENTRY_LIMIT_REACHED`, `GIVEAWAY_NOT_LIVE`, `INELIGIBLE`, `FRAUD_SUSPECTED`) |
| GET | `/me/entries` | USER | My entries w/ giveaway refs + status |

### Claims
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/me/wins` | USER | My winnings + claim status |
| POST | `/claims/:winId` | USER | Submit claim (details per PDF `[ASSUMPTION]`) |
| PATCH | `/claims/:winId` | USER | Update pending claim (address/KYC) |

### Admin (all `ADMIN`, all audited)
| Method | Path | Purpose |
|---|---|---|
| POST/PUT/PATCH | `/admin/giveaways` (+`/:id`) | CRUD; publish/schedule |
| POST | `/admin/giveaways/:id/cancel` | Cancel → triggers refund saga |
| POST | `/admin/giveaways/:id/close-entries` | Force-close entry window |
| POST | `/admin/giveaways/:id/draw` | Execute winner draw (guarded: status must be `ENTRIES_CLOSED`; second param `confirm:true`) |
| POST | `/admin/giveaways/:id/announce` | Publish winners (separate from draw = two-person gate option `[PDF]`) |
| GET/POST | `/admin/winners` / `/admin/winners/:id/revalidate` | Winner list; re-draw on DQ `[PDF]` |
| GET/PATCH | `/admin/claims` / `/admin/claims/:id` | Approve/reject/mark-shipped/forfeit |
| GET | `/admin/fraud/flags` / POST `/admin/fraud/flags/:id/action` | Review queue |
| GET | `/admin/audit-logs` | Filterable audit trail |
| POST | `/admin/users/:id/block` (+unblock) | Ban participation |
| GET | `/admin/stats` | Dashboard KPIs |

Cross-cutting: pagination (`page`,`limit`,`sort`), request IDs, strict zod validation,
versioning, helmet headers, CORS allow-list, global + per-route rate limits, idempotency
on every POST that moves value.

---

## E. Database Models & Relationships

MongoDB with Mongoose. All money/state-change collections are **append-only or
immutable once confirmed** where noted. Replica set required for transactions.

1. **User** — `veloopId` (unique, external), email, displayName, roles[], status
   (`ACTIVE|BLOCKED`), kyc flags `[PDF]`, timestamps. *(Cache of VELOOP identity;
   no passwords stored here `[EXTERNAL]`.)*
2. **Giveaway** — title, slug (unique), heroImages[], descriptionHtml/rules, status
   (`DRAFT|SCHEDULED|LIVE|ENTRIES_CLOSED|DRAW_PENDING|COMPLETED|CANCELLED` `[ASSUMPTION]`),
   startsAt/endsAt, prizeName/prizeValueText, winnerCount `[PDF]`,
   feeTiers: `[{ currency: "VE|SVE|TOKEN", amount, maxQty?, free?: bool }]` `[ASSUMPTION:
   per-giveaway per-currency pricing — PDF defines model]`,
   limits: `{ perUserMax, perDay? }` `[PDF]`, eligibility: `{ geo[], minKyc, ... }` `[PDF]`,
   featured flag, createdBy/updatedBy (admin refs). Indexes: status+endsAt, slug.
3. **GiveawayEntry** — giveawayId, userId, currency, qty, amountCharged, ledgerRefIds[],
   status (`CONFIRMED|REFUNDED|VOIDED_FRAUD`), idempotencyKey (unique per user),
   drawSnapshotTaken: bool. **Unique index `(giveawayId, userId, idempotencyKey)`** —
   the anti-double-charge invariant. Compound index `(giveawayId, status)` for draws.
4. **LedgerTransaction** *(if local balance model is used — see B2/E8)* — userId,
   type (`DEBIT_ENTRY|REFUND|ADJUSTMENT`), currency, amount, balanceBefore/After,
   entryId?, ref, **immutable**, `processedBySession` for transaction traceability.
5. **WalletMirror** *(conditional, per E8)* — userId, balances {VE,SVE,Token},
   version (optimistic lock). Only used if VELOOP has no debit API.
6. **Winner** — giveawayId, userId, entryId (the winning ticket), rank,
   announcementStatus (`HOLD|ANNOUNCED`), displayInfo (masked per PDF), drawnAt/by,
   verificationStatus `[PDF]`. Unique `(giveawayId, userId)`; index on giveawayId+rank.
7. **Claim** — winId, userId, status (`PENDING_DOCS|SUBMITTED|APPROVED|SHIPPED|
   RECEIVED|FORFEITED|EXPIRED` `[ASSUMPTION]`), shipping/contact payload (schema-
   validated), deadlineAt `[PDF]`, history[].
8. **FraudFlag** — userId?, giveawayId?, entryId?, rule (e.g. `VELOCITY`,
   `SHARED_DEVICE`, `SHARED_IP`, `ANOMALY` `[PDF defines actual rules]`), score,
   context{}, status (`OPEN|CONFIRMED|DISMISSED`), resolvedBy/At.
9. **IdempotencyKey** — key, userId, endpoint, requestHash, responseSnapshot,
   status (`IN_PROGRESS|COMMITTED|FAILED`), expiresAt (TTL index).
10. **AuditLog** — actorId, actorRole, action, entityType/id, before/after (diff or
    snapshot), ip, requestId, metadata. Append-only; TTL/retention per PDF `[PDF]`.
11. **Counter** (optional) — atomic per-giveaway `entryCount` for display + max-
    entries enforcement (`findOneAndUpdate $inc`).

**Relationships (logical refs, Mongoose `ref` + populate where needed):**
User 1—N GiveawayEntry 1—N LedgerTransaction; User 1—N Winner 1—1 Claim;
Giveaway 1—N GiveawayEntry/Winner; Giveaway.createdBy → User(admin);
FraudFlag/IdempotencyKey/AuditLog reference users/giveaways. No cross-doc
transactions beyond entry+ledger+counter (kept to one transaction scope).

---

## F. UI Component & Page Plan

**Global**: Navbar (brand, wallet pill showing 3 balances when logged in, user menu),
Footer, Toast system, `ProtectedRoute` / `AdminRoute`, maintenance/coming-soon states.

1. **Home page** (`/`)
   - `HeroBanner` — featured giveaway carousel/single with countdown + CTA `[PDF design]`
   - `LiveNowStrip` — giveaways ending soon (urgency styling)
   - `GiveawayGrid` → `GiveawayCard` (image, prize, fee badges per currency,
     `StatusBadge`, `CountdownTimer`, "Enter" / participation-state button)
   - `RecentWinnersTicker` — latest announced winners (masked names per policy `[PDF]`)
   - `HowItWorks` section (rules copy from PDF)
2. **Giveaway Detail** (`/giveaways/:slug`)
   - Prize gallery (`ImageGallery`), title, description/rules (`RichText`)
   - `CountdownTimer` (large, server-synced), lifecycle state panel
     (`LIVE` / `NOT_STARTED (starts in…)` / `ENTRIES_CLOSED` / `COMPLETED` / `CANCELLED`)
   - `EntryPanel` — currency selector (VE / SVE / Token), quantity stepper,
     live cost calc, balance check inline, `InsufficientBalanceModal` with wallet CTA,
     enter confirm → idempotent submit → success receipt / typed error feedback;
     disabled-reason display (not logged in / blocked / limit reached / ineligible)
   - `MyEntriesSummary` (my entries + status on this giveaway)
   - `WinnersSection` when COMPLETED; social/share block `[PDF]`
3. **Auth** (`/auth/callback` for VELOOP redirect; session bootstrap). If PDF
   specifies in-app login instead, adapt here `[EXTERNAL]`.
4. **My Account** — `/my/entries` (history + fees paid), `/my/wins` (winnings),
   `/claims/:winId` claim form + status timeline.
5. **Winners history** — `/winners` (paginated feed by giveaway).
6. **Admin** (`/admin`, role-gated)
   - Dashboard (active giveaways, entries, pending draws/claims, fraud queue badge)
   - Giveaways: list + create/edit form (dates, fee tiers per currency, limits,
     images, rules, status workflow buttons with confirm-gates)
   - Draws & Announcements: close-entries → draw (preview entrant count) → announce,
     each step double-confirm + audit note
   - Claims pipeline (kanban/status list), Fraud flag review, Audit log viewer,
     User block management
7. **404/500/maintenance** pages.

Responsive: mobile-first; Bootstrap grid; premium feel via `variables.css` brand
tokens (colors/type from PDF brand guide `[PDF]`).

---

## G. Security & Fraud-Prevention Plan

**G1. Authentication & authorization**
- Validate VELOOP-issued JWTs: signature (JWKS/secret via env), `exp`, `iss`, `aud`
  `[EXTERNAL — exact validator config from PDF/VELOOP docs]`. No tokens in localStorage
  if PDF allows: httpOnly refresh cookie + in-memory access token `[ASSUMPTION]`.
- RBAC: `user` vs `admin` role claim **and** server-side role collection check
  (claim alone never trusted for admin). Admin endpoints deny-by-default.
**G2. API hardening**: helmet, strict CORS allow-list, zod validation every input,
  Mongo injection-safe queries (Mongoose casting, no raw `$where`), body size limits,
  no stack traces in prod errors, security response headers, request timeouts.
**G3. Rate limiting** (Redis-less: Mongo-backed bucket initially; upgrade path noted):
  tiered — global per-IP; per-route tighter on entry/claim/auth; per-user limits
  `[ASSUMPTION: e.g. entries ≤ N/min — PDF values]`; 429 + `Retry-After`.
**G4. Idempotency & double-spend**: mandatory `Idempotency-Key` on value-moving POSTs;
  unique `(userId, key)` + `GiveawayEntry` unique index; `IN_PROGRESS` lock row
  prevents concurrent replay; response snapshot replayed on retry.
**G5. Transactional integrity**: entry + debit + counter increment inside one Mongo
  transaction; on cancellation/refund: reverse ledger entries, never mutate history.
**G6. Fraud controls** `[rule values from PDF — framework implemented behind
  `fraudService` with pluggable rules]`:
  - Velocity: entries/user/hour·day; sudden spikes post-announcement
  - Device/IP clustering across accounts (shared fingerprint flags)
  - New-account-to-entry ratio anomalies; blocked-party checks
  - Actions: soft (flag + queue) vs hard (block), configurable; every auto-action
    audited; false-positive review workflow in admin.
**G7. Winner safety**: draw only from immutable closed entry snapshot; announce is a
  separate audited action; DQ flow re-ranks with audit note.
**G8. Audit logging**: every state change (admin or user money actions) → AuditLog
  with actor, diff, ip, requestId. Admin log viewer is read-only.
**G9. Secrets & data**: `.env` (git-ignored), no secrets in repo, seed script refuses
  `NODE_ENV=production` with mock data, PII minimization on public winner feeds
  (masking `[PDF]`), TLS-only assumptions.
**G10. OWASP top-10 pass** + dependency audit (`npm audit` in CI) before "done".

---

## H. Testing Plan

Layers (Jest + supertest backend; Vitest + Testing Library frontend; `mongodb-memory-server`
for CI isolation; Dockerized replica set locally):

**H1. Unit** — fee calculation per currency; eligibility; state-machine transitions;
countdown/timezone edge; idempotency key parse; name-masking util; fraud rule scoring.

**H2. Integration — happy paths**: auth exchange; list/detail; entry success (correct
debit + entry + ledger + counter + audit); claim submit; admin create→publish→close→
draw→announce full lifecycle.

**H3. Integration — failure/edge**: entry on each non-LIVE status; insufficient
balance (each currency); limit reached; ineligible (geo/KYC/blocked); bad/expired
token; non-admin hitting admin; malformed payloads; giveaway cancelled mid-flow →
refunds issued; idempotent retry returns original receipt; clock boundary (entry at
`endsAt` exactly — rule per PDF, tested both sides).

**H4. Concurrency (critical)**:
- N parallel entries, same user+same idempotency key → exactly 1 entry, 1 debit.
- Same user, different keys, parallel → respects per-user cap (no over-limit).
- Global entry cap (if PDF has one) → never oversold (atomic counter test).
- Balance race: 2 parallel debits with funds for only 1 → exactly one succeeds,
  ledger never goes negative.
- Draw while late entries attempted → entries closed is a hard fence.
- Admin double-draw click → rejected (state guard + idempotency).
- Tests run 10–50 parallel requests via `Promise.allSettled` against real Mongo txns.

**H5. Security tests**: rate limit 429 behavior; replay after TTL; role escalation
attempts; NoSQL injection probes; CORS reject.

**H6. Frontend**: component (CountdownTimer drift, EntryPanel state machine incl.
disabled reasons, InsufficientBalanceModal), page integration with mocked API
(msw-style fixtures), ProtectedRoute/AdminRoute redirect, responsive snapshots for
key breakpoints.

**H7. E2E smoke** (Playwright, dev-seeded): browse → login(mock) → enter → see entry
receipt; admin draw → winner visible.

**H8. Fixtures & data hygiene**: `backend/tests/helpers/seed.js` creates clearly fake
users/prizes; production deploy asserts zero mock markers. Coverage gate: services/
models ≥ 90%, money paths 100% branch. CI matrix runs all suites; concurrency suite
non-flaky (retries with isolation, not blind retry).

---

## I. Phased Implementation Roadmap

| Phase | Scope | Acceptance criteria |
|---|---|---|
| **0. Specs & scaffolding** | Obtain & parse PDF; Git init; monorepo workspaces; Docker Mongo; CI; env conventions | Workspace runs `npm run dev` both apps; PDF requirements verified & this plan updated; ☐-checklist section A marked verified |
| **1. Backend core** | Config, db, error/request pipeline, User, auth middleware + mock adapter, health | Token-verified routes work w/ dev mock issuer; CI green |
| **2. Giveaway domain** | Models (Giveaway/Entry/Audit…), lifecycle state machine, public read APIs, cron transitions | Statuses auto-progress in tests; list/detail APIs contract-complete |
| **3. Money path** | Wallet adapter (+ local ledger if needed), entry service with transactions, idempotency, rate limits, concurrency tests | H4 suite green: zero double-charges, zero oversells |
| **4. Frontend public** | Layout, Home + banner, detail page, countdown, EntryPanel, auth flows, states per F1–F4 | Responsive + all participation states render; wired to real API (mock wallet in dev) |
| **5. Winners & claims** | Draw service, announcement flow, winners pages, claim submit/status UI, refund-on-cancel | Full lifecycle demo: create→enter→close→draw→announce→claim |
| **6. Admin** | Admin API + panel (giveaways, draws, claims, fraud queue, audit viewer, RBAC) | Non-admin blocked everywhere; every action audited & visible |
| **7. Fraud & hardening** | Fraud rules (per PDF), G-checklist pass, logging, dependency audit, security tests | H5 green; threat checklist signed |
| **8. Testing & docs** | Frontend suites, E2E smoke, API.md, README, DEPLOYMENT.md | Coverage gates met; docs let fresh dev run project |
| **9. Deployment** | Staging deploy, prod config, seed guards, smoke verification | Deployed app passes smoke; zero mock data in prod; rollback documented |

Each phase ends with verification (tests + manual check) before the next; no feature
is marked done unless verified (per owner rule).

---

## J. Missing Information, Risks & External Dependencies

**J1. THE SPECIFICATION PDF IS ABSENT** — top blocking item. Sections marked `[PDF]`
cannot be finalized. Need the file (drop it in `docs/` or give its path).
**J2. VELOOP Auth (EXTERNAL)** — issuer URL, JWKS/secret, token claims, refresh
model, admin role representation, OAuth callback vs. in-app verification. Blocking
Phases 1 & 4 real-mode.
**J3. VELOOP Wallet API (EXTERNAL)** — do VEs/SVEs/Tokens live in a VELOOP API
(endpoints, auth, debit semantics, failure codes, idempotency support)? Or must this
project maintain its own ledger mirror? Decides B2/E8. Blocking Phase 3 real-mode.
**J4. Winner selection policy** — random vs weighted, winner count per giveaway,
DQ/re-draw rules, announcement approval chain. (High-impact; PDF required.)
**J5. Entry policy** — free entries, multi-entry pricing, caps, refund rules,
eligibility (geo/KYC/age), minimum balances.
**J6. Brand & design** — logo, colors, fonts, prize images, hero copy; 88-page PDF
presumably contains these; no assets are present in this workspace.
**J7. Notification channels** — email/SMS/push providers & credentials for winner
notices `[EXTERNAL]`.
**J8. Deployment target** — hosting, domains, environments, CI/CD secrets unknown.
**J9. Compliance/legal** — giveaway law (geo restrictions, T&C text, winner data
publication consent) must come from PDF/VELOOP legal; risk if assumed.
**J10. Scale expectations** — traffic for popular giveaways; Redis vs Mongo rate
limit store; affects Phase 7 upgrade trigger.

**Risks**: (R1) implementing money path against wrong wallet assumption → mitigated by
adapter pattern so backend owns one interface with swappable impl; (R2) lifecycle/fee
model divergence from PDF → Phase 0 gate before coding; (R3) double-charge/oversell
→ transactions + unique indexes + concurrency suite is the release gate; (R4) no local
MongoDB → Docker prerequisite documented, CI uses memory-server.

**Mitigation commitment**: until the PDF is provided, only Phase 0 (scaffolding, mock
adapters, non-business plumbing) may proceed with owner approval; all business rules
(fees, eligibility, draw logic, fraud thresholds, display policies) stay behind
explicit config/adapter seams so PDF values drop in without rework.
