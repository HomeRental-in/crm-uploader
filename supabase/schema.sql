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

-- Defense in depth: enable RLS with no policies so the anon/publishable key can
-- read nothing. The app talks to the DB only from the server using the SECRET
-- key, which bypasses RLS. If you later add per-user login, add policies here.
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
