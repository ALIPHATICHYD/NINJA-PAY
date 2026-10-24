# Running NinjaPay

What to do when something breaks, and the settings that only the owner can change. The README covers how the app works; this covers keeping it up.

## Alerts and error tracking

Every server error (`instrumentation.ts`) and every error a visitor's page can't render past (`app/error.tsx`, `app/global-error.tsx` → `/api/errors`) is written as one JSON log line. Find them in Vercel → the project → Logs, filtered on `"level":"error"`. Each line carries `requestId`, Vercel's `x-vercel-id` for that request; search the logs for it to see the whole request. A failed upstream behind `/api/evm-rpc` is a `"level":"warn"` line with `"event":"rpc-upstream-failed"`, saying which endpoint failed (`premium` or `public`), how, and how long it took. If most failures name one endpoint, that endpoint is the problem.

Set `ALERT_WEBHOOK_URL` in Vercel (production only) to a Slack or Discord incoming webhook to be told as well. `lib/alerts.ts` sends:

| Alert | When | How often at most |
| --- | --- | --- |
| Server error / A visitor hit an error | First time each error (grouped by its digest) shows up | Once an hour per error |
| Relayer low on INJ | `/api/health` finds the relayer can pay for fewer than 20 more transfers | Every 6 hours |
| Relayer out of INJ | A relayed transfer failed for lack of gas | Once an hour |
| Claim-settling job failed | `/api/cron/settle-claims` threw | Once an hour |
| Claim-settling backlog | The job found a full batch (100) of stale reservations | Once a day |
| Premium RPC failing over | `/api/evm-rpc` got an error or timeout from `INJECTIVE_EVM_RPC_URL` and served the request from Injective's public RPC | Once an hour |

Each server instance sends at most 30 alerts an hour in all, so a flood of errors can't flood the channel. Alerts and logs never carry keys, signatures, request bodies, query strings or URL fragments (where a claim link keeps its key).

The low-balance alert only fires when something polls `/api/health`. Point an uptime monitor at it every few minutes: it answers 503 when any check fails.

## Spend

What can cost money, and what caps it:

- **The USDC relayer wallet** pays gas for people who send USDC without INJ. Each transfer's fee is capped at `MAX_RELAY_FEE` (0.002 INJ), each sender at 10 relays an hour, and everyone together at 100 an hour, so the most it can spend is 0.2 INJ an hour. Those counts hold across server instances only once `sql/phase2-rate-limits.sql` is applied and `SUPABASE_SERVICE_ROLE_KEY` is set. Keep only a few days' worth of INJ in it.
- **Vercel and Supabase usage.** Set a spend limit or budget alert in each dashboard (Vercel → Settings → Billing; Supabase → Organization → Billing). What each plan offers changes, so check there.

## Rolling back

A bad deploy: in Vercel → Deployments, open the last good production deployment and choose **Instant Rollback** (or `vercel rollback` from the CLI). It switches traffic back without a rebuild. Then fix forward on a branch and merge as usual.

A rollback reverts code only. It doesn't undo database changes or environment variables, so:

- New SQL changes in `sql/` ship with a matching `-down.sql` that undoes them, and code must work with the database both before and after the change. Apply the SQL, then deploy the code that needs it.
- Change an environment variable, then redeploy. To undo, set it back and redeploy.

## Changing the database

Nothing here runs automatically. Apply a file from `sql/` in Supabase → SQL Editor, after taking a backup (below). Pending:

| File | What it does | Undo |
| --- | --- | --- |
| `sql/phase2-rate-limits.sql` | Shared rate-limit counts for the relay | Drop `rate_limits` and `hit_rate_limit` |
| `sql/phase2-lock-claim-writes.sql` | Refuses claim writes from browsers once the server writes them | See the README, "Locking claim writes" |
| `sql/scale-indexes.sql` | Index for the daily job; drops two duplicate indexes | `sql/scale-indexes-down.sql` |

## Live and test databases

Today one Supabase project serves production, every preview deployment and local development: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are set for all three in Vercel, and `SUPABASE_SERVICE_ROLE_KEY` for production and preview. So a preview build of any branch can write to the live data with full access.

To separate them:

1. Create a second Supabase project (or a Supabase branch) for testing, and run the README's schema and the `sql/` files on it.
2. In Vercel → Settings → Environment Variables, scope the live values to **Production** only, and add the test project's values for **Preview** and **Development**.
3. Remove `SUPABASE_SERVICE_ROLE_KEY` from Preview, or give Preview the test project's key.
4. Redeploy production.

## Backups

Check Supabase → Database → Backups for what your plan keeps and for how long. Keep your own copy as well, at least before every database change:

```bash
SUPABASE_DB_URL='postgresql://…' scripts/backup-db.sh
```

Test that it restores, into an empty throwaway Postgres (never the live one), every month or so:

```bash
docker run -d --name restore-test -e POSTGRES_PASSWORD=test -p 5433:5432 postgres:16
SUPABASE_DB_URL='postgresql://…' RESTORE_TEST_URL='postgresql://postgres:test@localhost:5433/postgres' scripts/backup-db.sh
```

It compares row counts table by table and fails if they differ. A dump holds wallet addresses and claim records but no keys, since NinjaPay never stores any. Keep it private.

What the chain holds can't be lost with the database: payments, claim payouts and approvals are all on Injective. The database holds claim links, their reservations and recorded transactions, and claims settle again from the chain (`lib/claim-recovery.ts`).

## Webhooks

NinjaPay receives no webhooks today. Paystack and VTpass aren't live (see the README's feature status). Before any incoming webhook goes live, its route must check the sender's signature against the raw request body with a constant-time compare, reject old or replayed events, and do nothing twice for the same event id. Whether a fiat webhook can go live at all is a licensing question, not a code one.

## Background jobs

One job: `/api/cron/settle-claims`, daily at 04:00 UTC (`vercel.json`). It needs `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY`. Running it twice is harmless: it only does what the chain says about each payout. It alerts when it fails or falls behind.
