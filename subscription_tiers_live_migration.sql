-- Live migration for the existing StockSales PostgreSQL database.
-- Safe to run repeatedly. It does not alter keys, redemption state, or expiry dates.
BEGIN;

ALTER TABLE public.unlock_keys
  ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'premium';

ALTER TABLE public.user_tokens
  ADD COLUMN IF NOT EXISTS tier VARCHAR(20) DEFAULT 'premium';

-- Rows created before plan support are Premium by definition.
UPDATE public.unlock_keys SET tier = 'premium' WHERE tier IS NULL;
UPDATE public.user_tokens SET tier = 'premium' WHERE tier IS NULL;

ALTER TABLE public.unlock_keys
  ALTER COLUMN tier SET DEFAULT 'premium',
  ALTER COLUMN tier SET NOT NULL;

ALTER TABLE public.user_tokens
  ALTER COLUMN tier SET DEFAULT 'premium',
  ALTER COLUMN tier SET NOT NULL;

-- Replace any older tier CHECK, regardless of its generated constraint name.
DO $migration$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT c.conrelid::regclass AS table_name, c.conname
    FROM pg_constraint AS c
    WHERE c.contype = 'c'
      AND c.conrelid IN (
        'public.unlock_keys'::regclass,
        'public.user_tokens'::regclass
      )
      AND position('tier' IN lower(pg_get_constraintdef(c.oid))) > 0
  LOOP
    EXECUTE format(
      'ALTER TABLE %s DROP CONSTRAINT %I',
      constraint_row.table_name,
      constraint_row.conname
    );
  END LOOP;
END
$migration$;

-- premium_pro remains readable for legacy rows; all application writes use pro.
ALTER TABLE public.unlock_keys
  DROP CONSTRAINT IF EXISTS unlock_keys_tier_values_check;
ALTER TABLE public.unlock_keys
  ADD CONSTRAINT unlock_keys_tier_values_check
  CHECK (tier IN ('premium', 'premium_plus', 'pro', 'premium_pro'));

ALTER TABLE public.user_tokens
  DROP CONSTRAINT IF EXISTS user_tokens_tier_values_check;
ALTER TABLE public.user_tokens
  ADD CONSTRAINT user_tokens_tier_values_check
  CHECK (tier IN ('premium', 'premium_plus', 'pro', 'premium_pro'));

CREATE INDEX IF NOT EXISTS idx_unlock_keys_tier
  ON public.unlock_keys(tier);
CREATE INDEX IF NOT EXISTS idx_user_tokens_tier
  ON public.user_tokens(tier);

COMMIT;
