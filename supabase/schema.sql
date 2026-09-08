-- Matter Workspace prototype: schema, row-level security and seed data.
-- Run once in the Supabase SQL editor. Safe to re-run (drops and recreates).

drop table if exists audit_log cascade;
drop table if exists matter_walls cascade;
drop table if exists matter_members cascade;
drop table if exists matters cascade;
drop table if exists firm_users cascade;
drop function if exists jwt_email();
drop function if exists jwt_role();
drop function if exists is_walled(uuid);
drop function if exists can_see_matter(uuid);

-- ---------------------------------------------------------------------------
-- Identity helpers. The app signs a short-lived JWT per request carrying the
-- Microsoft Entra ID email plus the firm role. RLS reads those claims only.
-- ---------------------------------------------------------------------------
create function jwt_email() returns text
language sql stable as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create function jwt_role() returns text
language sql stable as $$
  select coalesce(auth.jwt() ->> 'app_role', 'none');
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table firm_users (
  email         text primary key,
  display_name  text not null,
  role          text not null check (role in ('attorney', 'paralegal', 'supervisor')),
  is_demo_admin boolean not null default false,
  created_at    timestamptz not null default now()
);

create table matters (
  id                   uuid primary key default gen_random_uuid(),
  matter_no            text not null unique,
  client_name          text not null,
  matter_type          text not null check (matter_type in ('Personal Injury', 'Medical Malpractice', 'Nursing Home')),
  stage                text not null default 'Intake'
                       check (stage in ('Intake', 'Claims Verification', 'Medical Management', 'Records', 'Demand', 'Negotiation', 'Litigation', 'Settlement', 'Closing', 'Archived')),
  date_of_loss         date,
  responsible_attorney text not null references firm_users(email),
  sharepoint_url       text,
  sharepoint_drive_id  text,
  sharepoint_item_id   text,
  created_by           text not null,
  created_at           timestamptz not null default now()
);

create table matter_members (
  matter_id  uuid not null references matters(id) on delete cascade,
  email      text not null references firm_users(email),
  primary key (matter_id, email)
);

-- Ethical wall: a listed person can never see the matter, whatever their role.
create table matter_walls (
  matter_id  uuid not null references matters(id) on delete cascade,
  email      text not null references firm_users(email),
  reason     text not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (matter_id, email)
);

create table audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor_email text not null,
  action      text not null,
  matter_id   uuid references matters(id) on delete set null,
  details     jsonb not null default '{}'::jsonb
);

create index on matter_members (email);
create index on matter_walls (email);
create index on audit_log (matter_id, at desc);

-- ---------------------------------------------------------------------------
-- Visibility rules
-- ---------------------------------------------------------------------------
create function is_walled(m uuid) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from matter_walls w
    where w.matter_id = m and lower(w.email) = jwt_email()
  );
$$;

create function can_see_matter(m uuid) returns boolean
language sql stable security definer as $$
  select
    not is_walled(m)
    and (
      jwt_role() = 'supervisor'
      or exists (select 1 from matter_members mm where mm.matter_id = m and lower(mm.email) = jwt_email())
      or exists (select 1 from matters x where x.id = m and lower(x.responsible_attorney) = jwt_email())
    );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table firm_users     enable row level security;
alter table matters        enable row level security;
alter table matter_members enable row level security;
alter table matter_walls   enable row level security;
alter table audit_log      enable row level security;

-- Everyone signed in can see the staff directory (names and roles only).
create policy firm_users_read on firm_users
  for select using (jwt_email() <> '');

create policy matters_read on matters
  for select using (can_see_matter(id));

create policy matters_insert on matters
  for insert with check (
    jwt_role() in ('attorney', 'supervisor')
    and lower(created_by) = jwt_email()
  );

create policy matters_update on matters
  for update using (can_see_matter(id) and jwt_role() in ('attorney', 'supervisor'));

create policy members_read on matter_members
  for select using (can_see_matter(matter_id));

create policy members_write on matter_members
  for insert with check (can_see_matter(matter_id) and jwt_role() in ('attorney', 'supervisor'));

-- Walls are supervisor-only. A walled person cannot even see that a wall exists.
create policy walls_read on matter_walls
  for select using (jwt_role() = 'supervisor' and not is_walled(matter_id));

create policy walls_write on matter_walls
  for insert with check (jwt_role() = 'supervisor' and lower(created_by) = jwt_email());

create policy walls_delete on matter_walls
  for delete using (jwt_role() = 'supervisor');

create policy audit_insert on audit_log
  for insert with check (lower(actor_email) = jwt_email());

create policy audit_read on audit_log
  for select using (
    jwt_role() = 'supervisor'
    or (matter_id is not null and can_see_matter(matter_id))
  );

-- ---------------------------------------------------------------------------
-- Seed data (demo firm). Replace the supervisor email with the real sign-in.
-- ---------------------------------------------------------------------------
insert into firm_users (email, display_name, role, is_demo_admin) values
  ('sales@crewnexa.com',           'Managing Attorney (you)', 'supervisor', true),
  ('demo.attorney@crewnexa.com',   'Dana Reyes, Attorney',    'attorney',   false),
  ('demo.paralegal@crewnexa.com',  'Sam Okafor, Paralegal',   'paralegal',  false),
  ('demo.conflict@crewnexa.com',   'Lee Whitman, Attorney',   'attorney',   false);

insert into matters (matter_no, client_name, matter_type, stage, date_of_loss, responsible_attorney, created_by) values
  ('2026-0142', 'Harper v. Brandywine Care Center', 'Nursing Home',        'Records',     '2026-02-11', 'demo.attorney@crewnexa.com', 'sales@crewnexa.com'),
  ('2026-0157', 'Nguyen v. Delmarva Trucking',      'Personal Injury',     'Demand',      '2026-03-30', 'demo.attorney@crewnexa.com', 'sales@crewnexa.com'),
  ('2026-0163', 'Estate of Collins v. St. Anne',    'Medical Malpractice', 'Litigation',  '2025-11-04', 'sales@crewnexa.com',         'sales@crewnexa.com'),
  ('2026-0171', 'Ortiz v. Christiana Ridge LLC',    'Personal Injury',     'Intake',      '2026-08-19', 'demo.conflict@crewnexa.com', 'sales@crewnexa.com');

insert into matter_members (matter_id, email)
select id, 'demo.paralegal@crewnexa.com' from matters where matter_no in ('2026-0142', '2026-0157');

insert into matter_members (matter_id, email)
select id, 'demo.attorney@crewnexa.com' from matters where matter_no = '2026-0163';

-- Lee Whitman previously defended St. Anne. Wall him off the Collins matter.
insert into matter_walls (matter_id, email, reason, created_by)
select id, 'demo.conflict@crewnexa.com', 'Prior representation of defendant at previous firm', 'sales@crewnexa.com'
from matters where matter_no = '2026-0163';

insert into audit_log (actor_email, action, matter_id, details)
select 'sales@crewnexa.com', 'wall.created', id, jsonb_build_object('email', 'demo.conflict@crewnexa.com')
from matters where matter_no = '2026-0163';
