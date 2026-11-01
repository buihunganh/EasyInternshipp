# Backend (Supabase)

The database schema, row-level security, workflow RPCs, storage buckets and analytics warehouse.
The frontend doesn't call it yet; see `IMPLEMENTATION_PLAN.md` for the integration phases.

```
backend/
└── supabase/
    ├── config.toml       Supabase CLI project config
    ├── migrations/       timestamped SQL, applied in order
    ├── seed.sql          reference data
    └── .temp/            CLI link state (gitignored, per machine)
```

The existing migrations are split by layer. Every module's tables are in `…000002`, its RPCs in `…000004`,
and its policies in `…000005`:

| Migration | Contents |
|---|---|
| `…000001_extensions_and_types` | extensions, enums |
| `…000002_core_tables` | all tables |
| `…000003_helpers_and_triggers` | helper functions, triggers |
| `…000004_business_rpcs` | workflow RPCs (`submit_job`, `apply_to_job`, `send_offer`, …) |
| `…000005_rls_policies` | row-level security policies, grants |
| `…000006_storage` | storage buckets and policies |
| `…000007_analytics_warehouse` | `analytics.*` star schema and KPI views |
| `…000008_scheduled_jobs` | `pg_cron` jobs |

## Commands (run from the repo root)

```bash
npx supabase login                          # once per machine
npm run db:link -- --project-ref <ref>      # once per machine, writes supabase/.temp/
npm run db:new -- recruiting_offer_expiry   # creates migrations/<timestamp>_recruiting_offer_expiry.sql
npm run db:migrations                       # compare local and remote
npm run db:push                             # apply pending migrations
```

Any other CLI command works the same way: `npx supabase --workdir backend <command>`.

## Rules

- **Never edit a migration that has been pushed.** Fix it with a new migration.
- New migrations each cover one change and are named after the module they serve
  (`accounts_…`, `jobs_…`, `recruiting_…`, `messages_…`, `community_…`, `university_…`, `admin_…`),
  so each frontend module owner can find their schema changes.
- Two people adding migrations at the same time: whoever merges second renames their file to a
  timestamp later than the last migration on `main` before merging, so the order stays linear.
- Permissions and business rules live in the database (RLS + RPCs). The frontend only hides actions.
