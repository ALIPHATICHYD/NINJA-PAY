-- Indexes for more users. Not applied: run it in the Supabase SQL editor when
-- you're ready (docs/operations.md, "Changing the database").
--
-- 1. The daily job (/api/cron/settle-claims) reads the oldest pending claims
--    across every pool. Without an index that is a full scan of `claims`;
--    this keeps it to the pending rows, which stay few.
-- 2. `claim_pools` has two identical indexes on creator_address and two on
--    link_code (the unique constraint already indexes it). Each extra one
--    slows every insert and costs storage. Supabase's performance advisor
--    flags the first pair.
--
-- The joined reads in lib/supabase.ts (a pool with its claims) are served by
-- the existing (pool_id, share_index) and (pool_id, claimer_address) unique
-- indexes, which both lead with pool_id.
--
-- Undo: sql/scale-indexes-down.sql.

create index if not exists claims_pending_created_idx
  on public.claims (created_at)
  where status = 'pending';

drop index if exists public.idx_claim_pools_creator;   -- same as claim_pools_creator_idx
drop index if exists public.idx_claim_pools_link_code; -- same as claim_pools_link_code_key
