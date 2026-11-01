# VELOOP Rewards Giveaway — Frontend

React 19 + Vite + Bootstrap + CSS Modules giveaway experience: premium banner
and hero, individual prize routes, live countdowns with ACTIVE / ENDED /
UPCOMING states, server-priced entry with a confirmation modal, winner and
Previous-Winner tabs with an announcement slider, winner-specific claim forms
(physical address vs. gift-card email), and honest loading / empty / error /
retry states throughout.

## Run

```bash
npm install
npm run dev        # http://localhost:5173 — /api is proxied to the backend on :4000
npm test           # Vitest + Testing Library (52 tests)
npm run build      # production bundle
npm run preview    # serve the built bundle locally
```

Start the backend first (see [`../backend/README.md`](../backend/README.md));
with the dev server up and fixtures seeded the app reads real data.

## Data source (and why a failure is never faked)

All network access goes through the centralized client in
[`src/api/client.js`](src/api/client.js). Configuration lives in
[`src/config/env.js`](src/config/env.js):

| `VITE_API_BASE_URL` | Effect |
|---|---|
| empty (default) | same-origin `/api/v1`, proxied by Vite to `http://127.0.0.1:4000` (override with `VITE_DEV_PROXY_TARGET`) |
| origin or full URL | the client calls that API root directly (backend `CORS_ORIGINS` must allow the site) |

Explicitly-fictional development mocks are ON by default **only** when no API
is configured and this is a dev server. `VITE_USE_MOCK_DATA=false` forces the
real API. **A production build can never enable mocks** — if the API fails,
the UI shows an error/retry state, never fake data or a false success.

Authentication: the identity issuer is external (VELOOP). Against the real API
there is no in-app sign-in; a dev-mock bearer token minted by the backend
(`npm run token:dev`) can be installed with `setCredential()` — it is treated
strictly as a credential and re-verified via `GET /auth/me`. The `/login` page
is a clearly-labelled development session used with the demo store.

## Structure

```
src/
├── api/          # one client per resource + token store + error normalization
├── components/   # common/ (Modal, Countdown, states…), giveaway/, layout/
├── config/       # env, currencies, claim fields/status, prize types
├── context/      # AuthContext — verified session, never client-trusted claims
├── hooks/        # useAsync (loading/error/retry), useCountdown
├── mocks/        # FICTIONAL dev fixtures only — isolated, never in prod builds
├── pages/        # Home, Giveaways, GiveawayDetail, Winners, Login, NotFound
├── services/     # server-authoritative surfaces over api/ or mocks/
└── styles/       # global.css + variables.css (tokens); components use *.module.css
```

Routes: `/` home, `/giveaways` list, `/giveaways/:slug` every individual prize
page, `/winners` winners + previous winners, `/login` dev sign-in, `*` 404.

## Deployment

Pre-configured for both hosts — SPA rewrites included so deep links resolve:

- **Vercel**: [`vercel.json`](vercel.json) (build `npm run build`, output
  `dist`). Import the repo with Root Directory = `frontend`, set
  `VITE_API_BASE_URL` to the deployed API origin.
- **Netlify**: [`netlify.toml`](netlify.toml) (same build/publish settings +
  `/* → /index.html` redirect). Base directory `frontend`.

Step-by-step (env matrix, CORS wiring, verification):
[`../docs/DEPLOYMENT.md`](../docs/DEPLOYMENT.md).

Accessibility & responsiveness: keyboard-operable modals with focus trap and
restore, skip link, `aria-live` state announcements, `prefers-reduced-motion`
support, and CSS Modules media queries down to small phones (320 px).
