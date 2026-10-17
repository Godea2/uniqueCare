-- Explicit RLS deny policies for anon + authenticated.
-- The API uses the Supabase service role, which bypasses RLS.
-- Safe / idempotent. Run in the Supabase SQL editor.

do $$
declare
  r record;
begin
  for r in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = true
  loop
    execute format('drop policy if exists deny_anon_all on public.%I', r.tablename);
    execute format('drop policy if exists deny_authenticated_all on public.%I', r.tablename);
    execute format(
      'create policy deny_anon_all on public.%I for all to anon using (false) with check (false)',
      r.tablename
    );
    execute format(
      'create policy deny_authenticated_all on public.%I for all to authenticated using (false) with check (false)',
      r.tablename
    );
  end loop;
end $$;

comment on schema public is
  'UniqueCare: clients never query Postgres directly. RLS denies anon/authenticated; API uses service_role.';
