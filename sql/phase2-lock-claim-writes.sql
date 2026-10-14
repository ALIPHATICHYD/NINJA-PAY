-- Only NinjaPay's server may write claim links (app/api/claims/route.ts).
--
-- Run this only after:
--   1. SUPABASE_SERVICE_ROLE_KEY is set in Vercel and the site is redeployed,
--   2. GET /api/health says "the server writes claim links", and
--   3. one claim link has been created and claimed on that deployment.
-- Before that, browsers still write claim rows with the public key, and this
-- would stop claim links working.
--
-- Reads stay public: the claim page reads pools and claims with the public key.
-- The service role skips Row Level Security, so the server keeps writing.

begin;

-- claim_pools: no more public inserts or updates (the app never updates a pool).
drop policy if exists "Allow public insert"                on public.claim_pools;
drop policy if exists "Allow public insert on claim_pools" on public.claim_pools;
drop policy if exists "Allow public update"                on public.claim_pools;
drop policy if exists "Allow public update on claim_pools" on public.claim_pools;
drop policy if exists "create claim pools"                 on public.claim_pools;

-- claims: no more public reserving, marking paid or releasing.
drop policy if exists "reserve claims"   on public.claims;
drop policy if exists "mark claims paid" on public.claims;
drop policy if exists "release claims"   on public.claims;

-- transactions: the app stopped writing this table; close it too.
drop policy if exists "Allow public insert on transactions" on public.transactions;
drop policy if exists "insert transactions"                 on public.transactions;

commit;

-- To undo (browsers write claim rows again, as before):
--   create policy "create claim pools" on public.claim_pools for insert with check (true);
--   create policy "reserve claims"     on public.claims      for insert with check (true);
--   create policy "mark claims paid"   on public.claims      for update using (true);
--   create policy "release claims"     on public.claims      for delete using (status = 'pending');
