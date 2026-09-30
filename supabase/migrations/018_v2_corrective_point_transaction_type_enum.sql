-- GreenBridge v2 - Migration 018: Add missing enum values to point_transaction_type
-- Adds 'bag_return_reward' and 'prompt_return_bonus' to public.point_transaction_type

ALTER TYPE public.point_transaction_type ADD VALUE IF NOT EXISTS 'bag_return_reward';
ALTER TYPE public.point_transaction_type ADD VALUE IF NOT EXISTS 'prompt_return_bonus';
