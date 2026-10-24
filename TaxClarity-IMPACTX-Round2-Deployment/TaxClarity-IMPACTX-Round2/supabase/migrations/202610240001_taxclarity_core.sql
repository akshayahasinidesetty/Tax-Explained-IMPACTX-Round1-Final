-- Supabase Postgres schema. Apply with Supabase CLI after reviewing policies.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  preferred_financial_year text not null default 'FY 2025-26',
  taxpayer_category text not null default 'individual',
  age_band text,
  theme text not null default 'system' check (theme in ('light','dark','system')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.tax_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'Tax calculation',
  financial_year text not null,
  assessment_year text not null,
  rule_version text not null,
  input_json jsonb not null,
  result_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_group_id uuid not null default gen_random_uuid(),
  version_number integer not null check (version_number > 0),
  supersedes_id uuid references public.documents(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null check (file_size between 1 and 10485760),
  sha256 text,
  extraction_status text not null default 'PENDING' check (extraction_status in ('PENDING','PARSED','FAILED','USER_CONFIRMED')),
  extracted_records jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, document_group_id, version_number)
);
create table if not exists public.reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_version text not null default 'not-applicable',
  status text not null default 'COMPLETED' check (status in ('RUNNING','COMPLETED','FAILED')),
  created_at timestamptz not null default now()
);
create table if not exists public.findings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  run_id uuid references public.reconciliation_runs(id) on delete set null,
  issue_type text not null,
  severity text not null check (severity in ('INFO','WARNING','HIGH')),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  delta numeric not null default 0,
  explanation text not null,
  evidence jsonb not null default '[]'::jsonb,
  status text not null default 'NEEDS_REVIEW' check (status in ('NEEDS_REVIEW','UNDER_REVIEW','MORE_EVIDENCE','RESOLVED','DISMISSED','SUPERSEDED')),
  dismissal_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.audit_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists public.report_metadata (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  report_type text not null,
  storage_path text,
  included_sections text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.tax_calculations enable row level security;
alter table public.documents enable row level security;
alter table public.reconciliation_runs enable row level security;
alter table public.findings enable row level security;
alter table public.audit_events enable row level security;
alter table public.report_metadata enable row level security;

create policy "profile owner select" on public.profiles for select using (auth.uid() = id);
create policy "profile owner insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profile owner update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "calculations owner all" on public.tax_calculations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "documents owner all" on public.documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "runs owner all" on public.reconciliation_runs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "findings owner all" on public.findings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "audit owner read" on public.audit_events for select using (auth.uid() = user_id);
create policy "audit owner insert" on public.audit_events for insert with check (auth.uid() = user_id);
create policy "reports owner all" on public.report_metadata for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Audit rows intentionally have no UPDATE/DELETE policy. Use private storage and
-- create a private bucket named "taxclarity-private"; never expose service-role keys.


-- Create a profile row when Supabase Auth creates an account.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created_taxclarity on auth.users;
create trigger on_auth_user_created_taxclarity
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Private document bucket: object path must begin with the authenticated user's UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('taxclarity-private', 'taxclarity-private', false, 10485760,
  array['text/csv','application/pdf','image/png','image/jpeg','image/webp',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy "private files owner select" on storage.objects
for select to authenticated
using (bucket_id = 'taxclarity-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private files owner insert" on storage.objects
for insert to authenticated
with check (bucket_id = 'taxclarity-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private files owner update" on storage.objects
for update to authenticated
using (bucket_id = 'taxclarity-private' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'taxclarity-private' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "private files owner delete" on storage.objects
for delete to authenticated
using (bucket_id = 'taxclarity-private' and (storage.foldername(name))[1] = auth.uid()::text);
