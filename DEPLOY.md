# 6.11 Drive GPS — deployment, operations and release checklist

Three parts, kept in separate folders:

| Part | Folder | Runs on |
|---|---|---|
| Website (React + Vite) | `gps website/` | Vercel (proposed) |
| API + Socket.IO (Node + Express) | `gps website/server/` | Render or a VPS with persistent WebSockets (proposed) |
| Driver app (React Native / Expo) | `drive-gps-mobile/` | App Store / Google Play builds |

Hosting, the PostgreSQL provider and the map provider are **proposals** in the PRD, not confirmed choices.

## 1. Environments
Use three, with separate databases and separate secrets: development, staging, production.
Never share a `JWT_ACCESS_SECRET` or `DATABASE_URL` between them. Never commit `.env` (it is git-ignored).

## 2. API configuration (`server/.env.example` lists every variable)
Required in production: `DATABASE_URL`, `JWT_ACCESS_SECRET` (32+ random characters; the server refuses to start without it), `CLIENT_URL` (the website origin, comma-separated for several).

- Website and API on **different sites** (e.g. Vercel + Render): set `COOKIE_SAMESITE=none` (forces Secure cookies, HTTPS required) and build the website with `VITE_API_URL=https://api.example.com/api/v1`.
- Same site: `COOKIE_SAMESITE=lax` and a reverse proxy that serves `/api` and `/socket.io` next to the website.
- `DATABASE_SSL=true` (default) for managed PostgreSQL such as Neon. Suggested database name: `611_drive_gps`.

## 3. Database migrations
Migrations are plain SQL in `server/migrations/`, applied in file order, each in a transaction.

```bash
cd server
npm run migrate        # applies what has not run yet; safe to repeat
```
Run it as a controlled step before starting a new API version (`render.yaml` does this as `preDeployCommand`). Take a backup first for any release that changes the schema. Create the first accounts with `npm run seed` using the `SEED_*` variables (passwords of 12+ characters), then remove those variables.

## 4. WebSockets and scaling
Socket.IO needs a host that keeps connections open (no serverless functions, no sleeping free tier). Test the host's idle and connection timeouts (the website reconnects by itself and re-reads a snapshot after every reconnect).
The in-process event bus works for **one API instance**. For more than one instance, add a shared Socket.IO adapter (Redis) and sticky sessions before scaling out; otherwise a GPS upload handled by instance A will not reach dashboards connected to instance B.

## 5. Backups and recovery
- Enable **point-in-time recovery** (Neon: history retention; other providers: continuous archiving) and encrypted automated backups. Pick the retention window deliberately.
- Add a periodic logical backup you control: `pg_dump --format=custom "$DATABASE_URL" > 611_drive_gps_$(date +%F).dump`, stored encrypted in a different account/region.
- **Practise recovery**: restore the latest backup into a scratch database, run `npm run migrate`, start the API against it and sign in. Do this before launch and on a schedule; a backup that was never restored is untested.
- Least privilege: the API's database user needs only read/write on application tables (no superuser, no DDL); use a separate owner role for migrations.

## 6. Monitoring
- `GET /api/v1/health` checks the API and the database (used by the Docker/Render health checks).
- Watch: 5xx rate, p95 latency of `POST /gps/locations/batch`, GPS points stored per minute, database connections/CPU/storage, socket connection count, and `LOGIN_FAILED` bursts in the audit log (`/superadmin/audit-logs`).
- Errors are written to stdout (`[error] …`); ship them to a log service. Alert on sustained 5xx and on "no GPS points for N minutes" during working hours.

## 7. Security status
Done in code (see `server/test/` — 66 automated tests): passwords hashed with bcrypt; 15-minute access tokens; single-use rotating refresh tokens stored only as hashes, with reuse detection; httpOnly refresh cookie for the web, secure storage on the phone; every query scoped by the company taken from the session, never from the client; cross-company foreign keys enforced by the database; roles checked on every route and every socket; Socket.IO handshake auth, server-chosen rooms, rate limiting, expiry and suspension disconnects; request body limits; rate limits (general, login/register, per-driver GPS uploads); `helmet` headers; audit log of privileged actions; CSV export protected against spreadsheet formulas.

Still to do or decide (not done):
- **TLS** is terminated by the host; verify HTTPS-only and HSTS on the real domains.
- **Row-Level Security** in PostgreSQL as defence in depth (PRD §9 suggests considering it).
- **Known advisories, reviewed and left**: `zod` < 4.6.6 (memory use on very large constrained collections; request bodies here are limited to 100 KB / 1 MB, so it is not reachable in a meaningful way — upgrade to zod 4 as a planned change) and `react-router` (server-side-rendering hydration only; the website is a plain SPA). Re-run `npm audit` before each release.
- Password reset, SMS OTP and an account-lockout policy are not built (SMS provider undecided).
- Location-data **privacy notice** and a **retention/deletion policy**: `npm run retention -- --days <N>` is a dry run by default (`--apply` deletes in batches); nothing is scheduled until the period is decided. Company deletion is not implemented.

## 8. Load test
`npm run loadtest -- 20 10 50` (20 drivers × 10 batches × 50 points) against an in-memory database ingested 10,000 points with no failures at about 2,000 points/s (p95 ≈ 650 ms) on a development laptop. That shows the code is sound under concurrency; it is **not** a capacity figure. Point it at staging with `LOADTEST_URL=https://staging-api…` and size the database from that result.

## 9. Not verifiable here — must be done before release (PRD §12, §14)
- **Real-device background location** on Android and iOS (screen off, app killed, battery saver, airplane mode, tunnel/no signal). Tune `GPS` in `drive-gps-mobile/src/config.ts` from the results.
- Store builds (EAS), permission texts and store privacy declarations for background location.
- Accessibility review (screen reader, contrast in Day/Night, keyboard use) of the website and the app.
- Decisions still open in the PRD: production PostgreSQL provider/region, map provider and billing (the website uses OpenStreetMap/Leaflet tiles, which are not for heavy production use), GPS intervals, retention, distance method (default: haversine over accurate points, see `server/src/services/geo.js`), SMS OTP and payment providers, plan prices and the expired-plan / grace / read-only rules.

## 10. How a company joins (onboarding)
1. A company opens **Request access** on the public website and sends its details. Nothing is created yet; nobody can self-register (`ALLOW_SELF_REGISTRATION` is off).
2. The platform admin is told two ways: a badge and card in the Super Admin dashboard, and an email to `ADMIN_NOTIFY_EMAIL` (needs SMTP).
3. In **Requests** the admin approves (choosing a plan starts a 7-day trial, `TRIAL_DAYS`) or rejects. Approving creates the company and its administrator and sends an email with a one-time link (valid 7 days) to choose a password. No password is created or emailed.
4. **Email needs an SMTP service** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`) and `APP_URL`. Without SMTP nothing is sent: the approval screen shows the link so the admin can hand it over, and the server log says the mail was not sent.
5. **Not built:** taking the card after the trial. It needs a payment provider (Stripe or similar): collect the card at approval or before the trial ends, then charge when `current_period_end` passes. Until then a trial just ends on its date and the admin decides (record a payment, or suspend the company).
6. **Passwords:** "Forgot password?" on the sign-in page emails a one-time link valid for 1 hour (same SMTP settings as above; without SMTP the link is printed in the server log outside production only). "Change password" is in the account menu of the dashboard; it closes the user's other sessions. The driver mobile app has no password screens: drivers use the website's "Forgot password?" link.

## 11. Online sign-up and card payment (Stripe)
Flow: **Sign in → Join us → company details → choose a plan → pay by card → account created automatically → email with a link to choose a password → dashboard.** Public pages have only one entry, Sign in; "Join us" is on the sign-in page.

- Plans come from Super Admin → Plans (only active, non-internal plans are offered). Price and truck limit are copied to the company's subscription at payment time.
- **Set up Stripe:** create a Stripe account, put the secret key in `STRIPE_SECRET_KEY` (use `sk_test_…` while testing). In Stripe → Developers → Webhooks add an endpoint `https://<your API>/api/v1/signup/webhooks/stripe` for the events `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `customer.subscription.deleted`, and put its signing secret in `STRIPE_WEBHOOK_SECRET`. Test locally with the Stripe CLI (`stripe listen --forward-to localhost:4000/api/v1/signup/webhooks/stripe`) and card `4242 4242 4242 4242`.
- The account is created only by Stripe's signed confirmation (the webhook), never by the browser returning from the payment page. Repeated or late webhooks are safe. A payment for an email that already has an account is logged for manual handling.
- Renewals extend the plan, a failed renewal marks it `past_due`, a cancellation marks it `cancelled`. **What the product does when a plan is past due or cancelled (read-only, grace period, suspension) is not decided yet and nothing is enforced automatically** (PRD §9).
- **Without a Stripe key:** local development shows a fake test checkout (never available in production); production switches online sign-up off (503) and the old request form (no plan) is used instead.
- **Not verified against Stripe itself:** the code passes tests that use real Stripe signature verification, but no live or test-mode payment was made because no Stripe account was available. Do a full test-mode payment before launch. Also decide taxes, receipts, refunds and the customer billing portal (Stripe Customer Portal) for changing the card or cancelling.


## 12. Publishing the driver app (so drivers can download it from the website)

The website has a "Get the app" page (`/download`). It offers the Android app as soon as the file exists.

1. **Put the API on the internet first** (sections above). The app in a driver's pocket cannot reach your computer.
2. **Build the Android file** from the `drive-gps-mobile` folder (needs a free Expo account):
   ```
   npm install -g eas-cli
   eas login
   eas build:configure          # once; the folder already has eas.json
   EXPO_PUBLIC_API_URL=https://YOUR-API-HOST/api/v1 eas build -p android --profile preview
   ```
   When it finishes, EAS gives a download link for the `.apk`. This build also records location with the
   screen off, which the test version in Expo Go cannot do.
3. **Give it to the website**, in either way:
   - save the file as `public/downloads/611-drive-gps.apk` and rebuild/deploy the website; or
   - set `VITE_ANDROID_APP_URL` (a Play Store link, or the link EAS gave you) and `VITE_IOS_APP_URL` when
     building the website.
4. For the Play Store and App Store (public listing), build with `--profile production`; the stores have their own
   review steps and fees (Google Play: one-time fee; Apple: yearly fee).

Drivers open the page, tap Download, install, and sign in with the email and password set under **Drivers**.
