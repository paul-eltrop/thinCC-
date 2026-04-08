-- Companies
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text,
  description text,
  founded_year text,
  headquarters text,
  employee_count text,
  industry text,
  created_at timestamptz default now()
);

-- User profiles linked to auth.users
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references companies(id),
  display_name text,
  role text default 'member',
  created_at timestamptz default now()
);

-- Team members per company
create table team_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  role text,
  day_rate integer,
  availability text
);

-- Document metadata per company
create table documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  doc_type text not null,
  file_path text not null,
  file_size integer,
  uploaded_at timestamptz default now()
);

-- Tenders per company
create table tenders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  client text,
  slug text not null,
  reference text,
  deadline date,
  estimated_value text,
  description text,
  status text default 'new',
  created_at timestamptz default now()
);

-- Share links tied to a company
create table share_links (
  id text primary key,
  company_id uuid not null references companies(id) on delete cascade,
  welcome_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Row Level Security
alter table companies enable row level security;
alter table profiles enable row level security;
alter table team_members enable row level security;
alter table documents enable row level security;
alter table tenders enable row level security;
alter table share_links enable row level security;

-- Policies: users see only their own company's data
create policy "Users see own company" on companies
  for all using (id = (select company_id from profiles where id = auth.uid()));

create policy "Users see own profile" on profiles
  for all using (id = auth.uid());

create policy "Users manage own team" on team_members
  for all using (company_id = (select company_id from profiles where id = auth.uid()));

create policy "Users manage own documents" on documents
  for all using (company_id = (select company_id from profiles where id = auth.uid()));

create policy "Users manage own tenders" on tenders
  for all using (company_id = (select company_id from profiles where id = auth.uid()));

-- Share links: anyone can read, only company members can create
create policy "Anyone can read share links" on share_links
  for select using (true);

create policy "Users create share links for own company" on share_links
  for insert with check (company_id = (select company_id from profiles where id = auth.uid()));
