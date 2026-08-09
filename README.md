# GreenBridge AI

GreenBridge AI is a desktop-first logistics and reverse-logistics platform for managing deliveries, recyclable-packaging pickups, route optimization, Green Points, vouchers, and ESG operations from one workspace.

The application provides separate workspaces for **Admin**, **Shipper**, and **Customer**, backed by Supabase Auth/Postgres/RLS and a free/open mapping stack based on OpenStreetMap, Nominatim, and OSRM. Google Maps and Google Routes are not required.

## Main features

### Admin
- ESG & Logistics dashboard with KPI cards, route map, route summary, performance trend, recent orders, and ESG reports.
- Orders, pickups, warehouses, vehicles, shippers, routes, route optimization, audit logs, ESG reports, and settings.
- Route approval/persistence and cached road-distance matrices.
- Operational analytics sourced from Supabase rather than hard-coded dashboard data.

### Customer
- Create recyclable-packaging pickup requests.
- Track pickup history and status.
- Green Points ledger.
- Voucher catalogue and redemption flow.
- Customer data isolation through RLS.

### Shipper
- View today's assigned route and route stops.
- Update delivery status and upload delivery proof.
- QR verification for packaging pickups.
- Route/history views with masked customer PII and controlled unmasking.

### Security & data integrity
- Supabase Auth with role-aware application access.
- Row Level Security policies for tenant/user isolation.
- Server-only service-role operations.
- Audit logging, order status history, QR hardening, atomic voucher redemption, and reverse-logistics persistence.

## Tech stack

- Next.js 16 + React 19 + TypeScript
- Supabase Auth, Postgres, RLS, RPC, and Storage
- Tailwind CSS 4
- Leaflet + OpenStreetMap
- Nominatim geocoding
- OSRM routing/distance matrices
- Recharts analytics
- Vitest

## Environment setup

Create `.env.local` in the same directory as `package.json`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=http://localhost:3000
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org
OSRM_BASE_URL=https://router.project-osrm.org
```

The code also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` as a legacy alias for the public Supabase key.

**Never commit `.env.local` or expose `SUPABASE_SERVICE_ROLE_KEY` in browser code.** The repository `.gitignore` excludes `.env*`; `.env.example` is intentionally safe to commit.

## Supabase database setup

There are two SQL locations:

- `supabase/migrations/` — the 20 ordered schema/security migrations for CLI or migration-based workflows.
- `supabase/manual_queries/` — SQL files intended for manual execution in the Supabase SQL Editor.

For a fresh Supabase project, run **01 → 20 in order** from `supabase/manual_queries/`. These create the schema, functions, RLS policies, indexes, storage configuration, operational defaults, and security hardening.

Files **21–23 are setup helpers, not core migrations**:

- `21_setup_user_test.sql` — maps the three local test Auth users to application profiles/roles.
- `22_create_operational_shop.sql` — creates/ensures the `greenbridge-main` operational shop.
- `23_warehouse.sql` — creates/ensures the default GreenBridge warehouse.

If using the test-user helper, first create these users in **Supabase → Authentication → Users**:

```text
admin@test.com
shipper@test.com
customer@test.com
```

For the current manual test setup, ensure the operational shop and warehouse exist before running the test-user role mapping. The expected role mapping is:

| Account | account_type | Shop role |
| --- | --- | --- |
| `admin@test.com` | `platform_admin` | `owner` |
| `shipper@test.com` | `shop_user` | `shipper` |
| `customer@test.com` | `customer` | none |

`supabase/seed.sql` is development/demo seed data. It is not required for a real production deployment.

## Local development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

If environment variables are changed while the dev server is running, stop and restart `npm run dev` so Next.js reloads them.

## Quality checks

Before pushing a release candidate:

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

All four should be reviewed before production deployment. Do not treat a successful dev-server launch alone as a production verification.

## GitHub

Before committing, confirm secrets are not tracked:

```bash
git status
git check-ignore .env.local
```

Then commit normally:

```bash
git add .
git commit -m "feat: finalize GreenBridge AI platform"
git push origin main
```

## Deploying to Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Add the production environment variables in **Project Settings → Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_APP_URL` set to the production site URL
   - optional `NOMINATIM_BASE_URL`
   - optional `OSRM_BASE_URL`
4. Deploy.
5. Add the production URL/redirect URLs to the Supabase Auth URL configuration if the authentication flow requires them.
6. Smoke-test Admin, Customer, and Shipper flows against the production Supabase project.

## Mapping notes

GreenBridge uses free/open mapping services by default:

- OpenStreetMap for map tiles/data.
- Nominatim for geocoding.
- OSRM for road routing and distance/time matrices.

The public Nominatim and OSRM services are appropriate for development and low-volume demos. For sustained production traffic, use a hosted provider or self-host these services and point the environment variables to those endpoints.

## Recommended end-to-end smoke test

Use the three role accounts to verify this chain before release:

**Customer creates pickup → Admin sees pickup/order → Admin optimizes and approves route → Shipper sees assigned route → Shipper completes delivery/pickup → Green Points/history/ESG data update → Admin dashboard reflects operational data.**

## Repository safety

Do not commit:

- `.env.local`
- Supabase service-role keys
- `.next/`
- `node_modules/`
- local build artifacts

If a service-role key has ever been exposed publicly, rotate it in Supabase before deployment.

---

GreenBridge AI — sustainable logistics, reverse logistics, route intelligence, and measurable ESG impact.
