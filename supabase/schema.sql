-- CRM Uploader schema
-- Run this in the Supabase SQL editor (Dashboard > SQL Editor > New query).
-- Safe to re-run: uses "if not exists" / "create or replace" where possible.

-- 1. Organisations (one per customer / tenant)
create table if not exists organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  notes text,                     -- optional context shown on export
  created_at timestamptz not null default now()
);

alter table organisations add column if not exists notes text;

-- 2. Imports: one row per uploaded CSV (keeps an audit trail + original headers)
create table if not exists imports (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  file_name text not null,
  headers text[] not null,        -- original column order; powers the export field dropdown
  date_column text,               -- which header was parsed into record_date
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

-- 3. CRM records: one row per CSV data row. Re-uploads APPEND (new import_id).
create table if not exists crm_records (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references organisations(id) on delete cascade,
  import_id uuid not null references imports(id) on delete cascade,
  record_date date,               -- parsed from the chosen dd/mm/yyyy column
  data jsonb not null,            -- the full original row, header -> value
  created_at timestamptz not null default now()
);

create index if not exists crm_records_org_date_idx on crm_records (organisation_id, record_date);
create index if not exists crm_records_data_gin_idx on crm_records using gin (data);
create index if not exists imports_org_idx on imports (organisation_id);

-- Defense in depth: enable RLS so the anon/publishable key can read nothing by
-- default. The app talks to the DB only from the server using the SECRET key,
-- which bypasses RLS. (Section 5 adds policies on `organisations` for users
-- signed in through Supabase Auth, used by the Feature Tracker page.)
alter table organisations enable row level security;
alter table imports        enable row level security;
alter table crm_records    enable row level security;

-- 4. WhatsApp blast: one import per CSV upload, one record per CSV row.
create table if not exists whatsapp_blast_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  headers text[] not null,
  row_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists whatsapp_blast_records (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references whatsapp_blast_imports(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_blast_records_import_idx
  on whatsapp_blast_records (import_id);
create index if not exists whatsapp_blast_imports_created_idx
  on whatsapp_blast_imports (created_at desc);

alter table whatsapp_blast_imports enable row level security;
alter table whatsapp_blast_records enable row level security;

-- 5. Feature Tracker (tracker/ — served at https://customer.n8npropfocus.com)
--    Which PropFocus features each organisation has switched on, plus the
--    organisation's lifecycle status and monthly revenue. Shares the
--    `organisations` table above so there is one customer list.
alter table organisations add column if not exists status text not null default 'free';
alter table organisations add column if not exists monthly_revenue numeric(12, 2) not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'organisations_status_check'
  ) then
    alter table organisations
      add constraint organisations_status_check
      check (status in ('free', 'pilot', 'subscribed', 'suspended', 'delinquent'));
  end if;
end $$;

create table if not exists features (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,        -- stable slug, e.g. website_visitor
  name text not null,              -- column header shown on the page
  category text,                   -- optional grouping label
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists organisation_features (
  organisation_id uuid not null references organisations(id) on delete cascade,
  feature_id uuid not null references features(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (organisation_id, feature_id)
);

create index if not exists organisation_features_feature_idx
  on organisation_features (feature_id);

-- The tracker page runs in the browser with the public anon key and signs users
-- in through Supabase Auth, so these three tables get RLS policies for the
-- `authenticated` role. imports / crm_records / whatsapp_* keep no policies and
-- stay reachable only through the CRM Uploader's server-side secret key.
alter table features              enable row level security;
alter table organisation_features enable row level security;

drop policy if exists "tracker: organisations for signed-in users" on organisations;
create policy "tracker: organisations for signed-in users" on organisations
  for all to authenticated using (true) with check (true);

drop policy if exists "tracker: features for signed-in users" on features;
create policy "tracker: features for signed-in users" on features
  for all to authenticated using (true) with check (true);

drop policy if exists "tracker: organisation_features for signed-in users" on organisation_features;
create policy "tracker: organisation_features for signed-in users" on organisation_features
  for all to authenticated using (true) with check (true);

-- Default feature columns. Rename, reorder or delete them from the page.
insert into features (key, name, category, sort_order) values
  ('website_visitor', 'Website Visitor Tracking', 'Acquisition',  10),
  ('custom_domain',   'Custom Domains',           'Acquisition',  20),
  ('microsites',      'Broker Microsites',        'Acquisition',  30),
  ('lead_capture',    'Lead Capture Forms',       'Acquisition',  40),
  ('followups',       'Follow-ups',               'Engagement',   50),
  ('whatsapp',        'WhatsApp Messaging',       'Engagement',   60),
  ('email_campaigns', 'Email Campaigns',          'Engagement',   70),
  ('site_visits',     'Site Visit Scheduling',    'Engagement',   80),
  ('ai_agent',        'AI Agent / Assistant',     'Automation',   90),
  ('salesforce_sync', 'Salesforce Integration',   'Integrations', 100),
  ('report_pack',     'Reports & Analytics',      'Insights',     110),
  ('priority_list',   'Priority Lead List',       'Insights',     120)
on conflict (key) do nothing;
