# Supabase manual deployment checklist

Use this only with a clean/empty Supabase project.

## Ordered queries

Run every file under `supabase/manual_queries/` in numeric order, one SQL Editor query at a time. There are 20 files and each manual query is an exact copy of its corresponding migration under `supabase/migrations/`.

After Query 20 succeeds, create/register the first real account and run `supabase/admin_setup.sql` once with your email.

Do not run `seed.sql` on the real project.

## What Query 11 provides

- `greenbridge-main` operational shop
- default GreenBridge warehouse
- platform vehicle defaults
- starter voucher catalogue

These are application configuration/catalogue defaults, not fake transaction/history data.

## Required project keys for the app

- Project URL → `NEXT_PUBLIC_SUPABASE_URL`
- Publishable/anon key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Service-role key → `SUPABASE_SERVICE_ROLE_KEY` (server only)

No Google Maps key is required.
