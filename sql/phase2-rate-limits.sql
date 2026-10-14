-- Shared rate limits for server routes (lib/shared-rate-limit.ts).
--
-- Adds one table and one function. Nothing existing changes. Only the service
-- role can use either: the table has Row Level Security on and no policies,
-- and the function is only executable by service_role. Keys are HMACs, never
-- wallet addresses. Until this runs, the relay counts in each server
-- instance's memory, as before.

create table if not exists public.rate_limits (
  key          text        not null,
  window_start timestamptz not null,
  hits         integer     not null default 0,
  primary key (key, window_start)
);

alter table public.rate_limits enable row level security;
-- Keep the table out of the public API schema altogether, not just empty to it.
revoke all on table public.rate_limits from anon, authenticated;

-- Counts one use of `p_key` in the current fixed window and says whether it is
-- within `p_limit`. The upsert is atomic, so concurrent requests can't both
-- take the last slot.
create or replace function public.hit_rate_limit(p_key text, p_window_seconds integer, p_limit integer)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  current_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  count_now integer;
begin
  insert into public.rate_limits as r (key, window_start, hits)
  values (p_key, current_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning r.hits into count_now;

  -- Old windows are cleared now and then, instead of by a scheduled job.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < now() - interval '1 day';
  end if;

  return count_now <= p_limit;
end;
$$;

revoke all on function public.hit_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- To undo:
--   drop function if exists public.hit_rate_limit(text, integer, integer);
--   drop table if exists public.rate_limits;
