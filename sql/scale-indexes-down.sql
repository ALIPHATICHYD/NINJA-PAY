-- Undoes sql/scale-indexes.sql.
drop index if exists public.claims_pending_created_idx;
create index if not exists idx_claim_pools_creator on public.claim_pools (creator_address);
create index if not exists idx_claim_pools_link_code on public.claim_pools (link_code);
