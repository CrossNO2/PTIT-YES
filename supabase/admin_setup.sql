-- GreenBridge AI — one-time platform administrator setup
-- Run AFTER Queries 01 -> 20 and AFTER creating/registering your account.
-- Replace the email below, then run this query once in Supabase SQL Editor.

SELECT public.bootstrap_greenbridge_admin('YOUR_ADMIN_EMAIL@example.com');
