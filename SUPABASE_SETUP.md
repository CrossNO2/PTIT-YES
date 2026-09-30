# GreenBridge v2 — Supabase Database Setup & Migration Guide

This document describes how to deploy and maintain the GreenBridge v2 database schema on Supabase.

---

## 1. Migration Architecture

GreenBridge v2 uses an ordered, idempotent migration sequence located in `supabase/migrations/`.
Each migration is numbered sequentially from `001` to `014`:

| File | Subsystem / Scope | Purpose |
|------|-------------------|---------|
| `001_v2_extensions_enums.sql` | Foundation | PostgreSQL extensions (`uuid-ossp`, `postgis`, `pgcrypto`) & core enums (`user_role`, `bag_status`, `order_status`, etc.) |
| `002_v2_identity_organizations.sql` | Identity & Tenancy | Multi-tenant organizations, merchants, profiles, and role mappings |
| `003_v2_hubs_fleet_pudo.sql` | Physical Infrastructure | Hubs, sorting centers, vehicle fleet, and PUDO/smart locker entities |
| `004_v2_paas_bags.sql` | PaaS Asset Tracking | Reusable bag assets, QR identifiers, cycle counters, and condition logs |
| `005_v2_orders_logistics.sql` | Logistics Domain | Forward orders, bag assignments, customer delivery links |
| `006_v2_routes_ai_context.sql` | AI & Route Optimization | Forward and reverse routes, waypoints, and GALM AI context caching |
| `007_v2_recovery_domain.sql` | Reverse Logistics | Bag recovery requests, pickup slots, Strategy A/C metadata |
| `008_v2_deposits_incentives.sql` | Circular Economics | Deposit escrow ledger, green points, voucher catalogue and redemptions |
| `009_v2_esg_notifications_audit.sql` | ESG & Compliance | CO2 reduction audit metrics, system notifications, immutable audit log |
| `010_v2_rls_security.sql` | Security & Authorization | Multi-tenant Row-Level Security (RLS) policies across all v2 tables |
| `011_v2_core_rpcs.sql` | Operations Engine | Core RPCs: route generation, bag checkout, voucher redemption |
| `012_v2_bag_lifecycle_recovery_engine.sql` | Lifecycle State Machine | PaaS bag 10-state lifecycle engine, state transition audit, recovery requests |
| `013_v2_recovery_decision_engine.sql` | Reverse Decision Engine | Recovery Decision evaluation, Strategy A/C assignment, explainability schema |
| `014_v2_recovery_decision_unique.sql` | Data Integrity | Idempotency and uniqueness constraints on recovery request decisions |

---

## 2. Deployment Procedures

### Option A: Automated Supabase CLI (Recommended for Staging/Prod)

1. Ensure the Supabase CLI is authenticated:
   ```bash
   npx supabase login
   ```
2. Link your local project to the remote Supabase project:
   ```bash
   npx supabase link --project-ref <YOUR_PROJECT_REF>
   ```
3. Push all pending migrations in order:
   ```bash
   npx supabase db push
   ```

### Option B: Supabase Dashboard SQL Editor (Manual Deployment)

When deploying via the Supabase Web Dashboard:
1. Open your Supabase Project Dashboard -> **SQL Editor**.
2. Run each migration file **strictly in ascending numerical order** (`001` through `014`).
3. Confirm that each query succeeds without errors before proceeding to the next file.

> [!WARNING]
> Do NOT execute migrations out of order. Higher-numbered migrations have foreign key and type dependencies on earlier migrations.

---

## 3. Initial Administrative Setup

After migrations 001–014 have been executed:
1. Register the primary administrative account through your Supabase Auth UI or application sign-up.
2. In Supabase SQL Editor, verify or assign the administrative role to that user in `public.profiles`:
   ```sql
   UPDATE public.profiles
   SET role = 'admin'
   WHERE id = '<USER_UUID>';
   ```

---

## 4. Migration Integrity & Ordering Validation Script

To verify migration file presence, naming convention, numbering sequence, and file integrity prior to deployment:
```bash
npm run validate:migrations
```
This script checks:
- All required migration files (`001` to `014`) exist under `supabase/migrations/`.
- Strict sequential numbering (`001` through `014`) with no gaps or duplicates.
- Non-empty files (detects truncated or zero-byte files).
- Basic SQL keyword presence heuristic.

> [!NOTE]
> This script performs file-level integrity, sequence, and structure validation. Full semantic DDL execution and runtime PostgreSQL schema validation occur against the live database during deployment.
