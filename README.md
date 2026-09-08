# Matter Workspace prototype

A small, real implementation of the four things that decide whether a custom
matter-management system survives contact with a law firm:

1. **Microsoft Entra ID sign-in** (OpenID Connect, single tenant, delegated Graph token with silent refresh).
2. **Roles enforced in the database**: attorney, paralegal, supervisor. Every query runs under Postgres row-level security keyed to the signed-in email. The UI cannot over-fetch.
3. **Ethical walls**: a walled person cannot see the matter, its members, its documents link, or the fact that a wall exists. Supervisor visibility is overridden too.
4. **SharePoint provisioning**: opening a matter creates `Matters/<no> - <client>/` plus nine standard sub-folders through Microsoft Graph, using the signed-in user's own permissions, and stores the link on the record.

Everything a user does is written to an audit table under the acting identity.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| App | Next.js (App Router, server actions, TypeScript) | One deployable, server-side secrets, no client-side tokens |
| Identity | Auth.js with the Microsoft Entra ID provider | Standard OIDC, tenant MFA and conditional access stay with IT |
| Data | Supabase Postgres with row-level security | Policies live next to the data; a UI bug cannot leak a row |
| Documents | Microsoft Graph, root site document library | Delegated calls, so SharePoint permissions still apply |
| Hosting | Vercel | Zero-ops for a prototype; the app is stateless and portable to Azure |

## How the security model works

The app never uses the Supabase service key. On every request it signs a
five-minute HS256 JWT containing `email` and `app_role` for the acting user, and
Supabase evaluates policies against those claims:

```sql
-- excerpt from supabase/schema.sql
create function can_see_matter(m uuid) returns boolean ... as $$
  select not is_walled(m)
    and ( jwt_role() = 'supervisor'
       or exists (select 1 from matter_members where matter_id = m and email = jwt_email())
       or exists (select 1 from matters where id = m and responsible_attorney = jwt_email()) );
$$;
create policy matters_read on matters for select using (can_see_matter(id));
```

Walls are checked first, so a supervisor who is walled off a matter loses it too.
Walled users cannot read `matter_walls`, so they cannot discover that a wall exists.

### Demo control

One Microsoft account is flagged `is_demo_admin`. That account gets a "run every
query as" switch in the header. It only changes the identity in the signed JWT;
the database does the rest. This is how one login can demonstrate all three
roles and the wall. It is a demo affordance and would be removed for production.

## Run locally

```bash
cp .env.example .env.local   # fill in the values below
npm install
npm run dev
```

Environment:

| Variable | Source |
| --- | --- |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `AUTH_URL` | `http://localhost:3000` locally, the site URL in production |
| `AUTH_MICROSOFT_ENTRA_ID_ID` | App registration, Application (client) ID |
| `AUTH_MICROSOFT_ENTRA_ID_SECRET` | App registration, Certificates and secrets |
| `AUTH_MICROSOFT_ENTRA_ID_TENANT_ID` | App registration, Directory (tenant) ID |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project settings, API (anon / publishable key) |
| `SUPABASE_JWT_SECRET` | Supabase project settings, JWT secret (legacy HS256) |

App registration requirements:

- Platform **Web**, redirect URI `<site>/api/auth/callback/microsoft-entra-id`
- Delegated Graph permissions: `User.Read`, `Sites.ReadWrite.All`, `Files.ReadWrite.All`, `offline_access`, with admin consent granted
- Single tenant

Database: paste `supabase/schema.sql` into the Supabase SQL editor and run it.
It creates the tables, policies and demo seed data. Change the supervisor email
in the seed block to the Microsoft account that will sign in.

## What is deliberately not here

- No document upload, versioning metadata or retention labels (next step, same Graph calls).
- No Outlook or Teams integration.
- No data migration from the current system.
- No production hardening: rate limits, key rotation, alerting.

## Layout

```
auth.ts                 Auth.js configuration, Graph scopes, token refresh
lib/identity.ts         who is signed in, who they are acting as
lib/supabase.ts         per-request JWT signing, RLS-scoped client
lib/graph.ts            SharePoint provisioning and folder listing
lib/actions.ts          server actions: open matter, walls, members, stage
app/                    pages: landing, matters, matter detail, open matter, audit
supabase/schema.sql     tables, policies, seed data
```
