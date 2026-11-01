# VELOOP Rewards Giveaway — Deployment Runbook

Everything below is derived from the code in this repository; no deployment
URLs, credentials or platform names are pre-supplied because none exist yet.
Placeholders are written as `<FRONTEND_URL>` / `<API_URL>` / `<ATLAS_URI>`.

---

## 1. Topology

```
Vercel / Netlify  ──▶  static SPA (frontend/dist)
                          │  HTTPS + JSON, CORS (Bearer tokens)
                          ▼
Render / Railway / Fly   ──▶  Express API (backend, Node ≥ 20)
                          │
                          ▼
MongoDB Atlas replica set  ──  transactions REQUIRED for paid entries
```

Secrets (DB URI, JWT keys, wallet API key, `DEVICE_HASH_SALT`) live **only** in
the backend host's environment/secret manager. The frontend ships **public**
`VITE_*` build args only. Nothing secret is ever committed — `.env*` files are
git-ignored except `.env.example` templates.

---

## 2. Database — MongoDB Atlas (or any replica set)

1. Create an **M0/M10+ replica set** cluster, a database user, and an IP /
   VPC allow-list for your API host.
2. Copy the SRV connection string (`mongodb+srv://<user>@<cluster>/<db>?...`).
3. **Transaction requirement (platform-specific, important):** MongoDB
   multi-document transactions exist **only on replica sets / sharded clusters
   (via mongos)** — never on a stand-alone `mongod`, and Atlas M0 free tier
   supports them but with tight limits. The paid `dev`/`http` entry path runs
   its debit + participation + ledger + audit as one transaction. On a
   stand-alone the API **fails closed** with
   `503 TRANSACTION_INFRASTRUCTURE_REQUIRED` and moves no money (default
   `MONGODB_REQUIRE_TRANSACTIONS=true`). Free entries and all reads work
   anywhere.
4. **Apply indexes** (production runs with `autoIndex` OFF — indexes do not
   exist until you create them):
   ```bash
   MONGODB_URI=<ATLAS_URI> NODE_ENV=production npm run db:migrate
   # inspect first:  npm run db:migrate:dry   |   drift gate: npm run db:migrate:check
   ```
   Run this once per deploy that changes models. It is idempotent.
5. **Seeding is development-only.** `npm run seed:dev` / `seed:reset` call
   `assertNotProduction()` and **exit** when `NODE_ENV=production`, so fictional
   fixtures cannot overwrite or mix into production records. Never seed Atlas
   production data with these scripts; fixture rows are additionally stamped
   `seedBatch=dev-fixture-v2` and `recordSnapshot()` refuses fixture balances
   in production.

## 3. Backend — Render / Railway / Fly.io (any Node ≥ 20 host)

Repo root `backend/`. A `Procfile` (`web: node src/server.js`) is included for
Procfile hosts; other hosts use the start command below. The app binds
`process.env.PORT`, serves `/health` (liveness — never touches the DB) and
`/health/ready` (readiness — `503` + `{"database":"disconnected"}` until MongoDB
connects), and performs graceful shutdown on SIGTERM (`GRACEFUL_SHUTDOWN_TIMEOUT_MS`).

- **Build command:** `npm ci`
- **Start command:** `node src/server.js` (with `NODE_ENV=production`)
- **Health check path:** `/health/ready` (or `/health` if you must not gate on DB)

Required production environment variables (the app **refuses to boot** in
production if any is missing/insecure — fail-fast by design):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGODB_URI` | `<ATLAS_URI>` (boot exits if unreachable) |
| `AUTH_MODE` | `jwt` (`dev-mock` is **refused** in production) |
| `JWT_SECRET` or `JWT_PUBLIC_KEY` | the VELOOP issuer's key; `JWT_ALGORITHMS` must match; `jwt` mode without a key is refused |
| `DEV_JWT_SECRET` | must be changed away from `change-me-local-dev-only` — the production gate refuses the public placeholder **even in `jwt` mode** (defense-in-depth against copied `.env` files) |
| `CORS_ORIGINS` | `<FRONTEND_URL>` — exact origins, comma-separated. Empty or `*` is **refused** in production |
| `TRUST_PROXY` | the proxy hop count (e.g. `1`) so rate-limit keys see real client IPs |
| `DEVICE_HASH_SALT` | long-lived secret; do not rotate casually |
| `WALLET_MODE` | `http` + the `WALLET_*` contract when VELOOP supplies it; `disabled` is a safe production default (paid entries honestly return `503 WALLET_NOT_CONFIGURED`). `dev` is **refused** in production |
| Optional | `LOG_LEVEL`, `RATE_LIMIT_*`, `JSON_BODY_LIMIT`, `FRAUD_RETENTION_DAYS`, `ELIGIBILITY_GEO_SOURCE`/geo + KYC provider config |

Deploy steps (Render shown; Railway/Fly are equivalent):

```bash
# Render dashboard → New Web Service → connect repo → Root: backend/
# Build: npm ci   Deploy: node src/server.js   Health: /health/ready
# Add every variable above. Then:
curl https://<API_URL>/health         # → {"status":"ok", "environment":"production"}
curl https://<API_URL>/health/ready   # → 200 {"database":"connected"}
```

## 4. Frontend — Vercel or Netlify

`frontend/vercel.json` and `frontend/netlify.toml` are pre-configured
(build `npm run build`, output `dist`, SPA rewrites so React Router deep links
like `/giveaways/:slug` resolve to `index.html`).

**Vercel:** import repo → Root Directory = `frontend` → framework Vite (auto) →
add env var → deploy.
```bash
npx vercel          # or dashboard flow
```

**Netlify:** add new site from Git → base directory `frontend` → build command
`npm run build`, publish directory `dist` (picked up from `netlify.toml`).
```bash
npx netlify deploy --prod --dir=dist   # or dashboard flow
```

Environment variables (public, build-time — **never secrets**):

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | `<API_URL>` (bare origin works — the client appends `/api/v1`) |

Then add `<FRONTEND_URL>` to backend `CORS_ORIGINS` and redeploy/restart the
API (exact-origin allow-list).

## 5. Post-deploy verification checklist

```bash
# 1) Health & DB access
curl -s https://<API_URL>/health        # status ok, environment production
curl -s https://<API_URL>/health/ready  # database: connected

# 2) API connectivity + envelope (no auth needed)
curl -s https://<API_URL>/api/v1 | head -c 400          # live route self-index
curl -s https://<API_URL>/api/v1/auth/me                # {"error":{"code":"LOGIN_REQUIRED"},"requestId":...}

# 3) CORS from the deployed frontend only (expect NO allow header on the bad origin)
curl -s -o /dev/null -D - -X OPTIONS https://<API_URL>/api/v1/giveaways \
     -H "Origin: <FRONTEND_URL>" -H "Access-Control-Request-Method: GET"   # allow header present
curl -s -o /dev/null -D - -X OPTIONS https://<API_URL>/api/v1/giveaways \
     -H "Origin: https://evil.example"                                     # no access-control-allow-origin

# 4) Indexes actually applied (should list unique (userId, giveawayId) etc.)
npm run db:migrate:check     # against MONGODB_URI; exits non-zero on drift

# 5) Production frontend really calls the API and never fakes data:
#    open <FRONTEND_URL> → network tab shows calls to <API_URL>/api/v1,
#    a killed API yields the error/retry state — never mock content
#    (mocks are force-disabled in production builds by src/config/env.js).
```

## 6. Demo mode vs. real integration (deployment decision table)

| | Demo / development | Production |
|---|---|---|
| `AUTH_MODE` | `dev-mock` (+ `npm run token:dev`) | `jwt` with real VELOOP issuer key |
| `WALLET_MODE` | `dev` (fictional in-DB balances, real transactions) | `http` once the VELOOP wallet contract exists; `disabled` until then |
| Frontend mocks | allowed (dev server only) | impossible — production builds force them off |
| Seed fixtures | `npm run seed:dev` (refuses production) | never |
| Boot behavior | lenient; serves without DB | fail-fast on any insecure/missing config |

Shipping with the demo seams configured as above is an explicitly labelled
**demo deployment**. Real VELOOP **funds** only move once `WALLET_MODE=http`
is configured against the genuine wallet API and `AUTH_MODE=jwt` verifies
genuine issuer tokens — both are `[INTEGRATION REQUIRED]` items in
[`backend/docs/API.md`](../backend/docs/API.md).

## 7. Pushing this repository to GitHub

The remote is already configured (`origin` — see `git remote -v`). Review then
push normally; **never force-push**:

```bash
git status && git diff                 # inspect everything first
git ls-files | Select-String -Pattern '\.env$|\.pem$|\.key$'   # must print NOTHING
git add <intended files>               # stage deliberately, not `git add -A` blindly
git commit -m "docs+deploy: submission-ready README, host configs, review fixes"
git push origin main                   # plain push; no --force
```
