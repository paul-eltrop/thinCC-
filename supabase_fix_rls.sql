-- Fix: Signup braucht INSERT-Rechte bevor ein Profile existiert

-- Companies: authentifizierte User duerfen erstellen, eigene sehen/bearbeiten
drop policy if exists "Users see own company" on companies;
create policy "Users insert company" on companies
  for insert with check (auth.uid() is not null);
create policy "Users see own company" on companies
  for select using (id = (select company_id from profiles where id = auth.uid()));
create policy "Users update own company" on companies
  for update using (id = (select company_id from profiles where id = auth.uid()));

-- Profiles: User darf eigenes Profile erstellen und sehen
drop policy if exists "Users see own profile" on profiles;
create policy "Users insert own profile" on profiles
  for insert with check (id = auth.uid());
create policy "Users see own profile" on profiles
  for select using (id = auth.uid());
create policy "Users update own profile" on profiles
  for update using (id = auth.uid());
