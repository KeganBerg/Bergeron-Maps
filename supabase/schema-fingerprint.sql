-- Schema fingerprint: one line per object in the public schema, with a short hash of its definition.
-- Run it in the Supabase SQL Editor (read-only, changes nothing) and compare with the same query run
-- on a database built from supabase/migrations (docs/DATABASE.md). Comments and whitespace inside
-- function bodies are ignored, so a reworded copy of a migration still matches if the code is the same.
-- The first line lists scheduled jobs (pg_cron), which aren't part of the migrations.
with norm as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args,
         regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g') body,
         p.prosecdef, p.provolatile, pg_get_function_result(p.oid) result,
         coalesce((select string_agg(a.grantee::regrole::text, ',' order by a.grantee::regrole::text)
                   from aclexplode(p.proacl) a
                   where a.privilege_type = 'EXECUTE' and a.grantee::regrole::text in ('anon', 'authenticated', '-')), '') grants,
         p.proacl is null as default_acl
  from pg_proc p where p.pronamespace = 'public'::regnamespace
),
objects as (
  select 'function' kind, proname || '(' || args || ')' name,
         md5(body || '|' || prosecdef::text || '|' || provolatile::text || '|' || result) h,
         case when default_acl then 'default' else grants end extra
  from norm
  union all
  select 'table', c.relname,
         md5(string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull || ':' ||
                        coalesce(pg_get_expr(d.adbin, d.adrelid), ''), ',' order by a.attnum)),
         (c.relrowsecurity)::text
  from pg_class c join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  left join pg_attrdef d on d.adrelid = c.oid and d.adnum = a.attnum
  where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'v', 'p')
  group by c.relname, c.relrowsecurity
  union all
  select 'policy', tablename || '.' || policyname,
         md5(cmd || '|' || array_to_string(roles, ',') || '|' || coalesce(qual, '') || '|' || coalesce(with_check, '')), ''
  from pg_policies where schemaname = 'public'
  union all
  select 'constraint', conrelid::regclass::text || '.' || conname, md5(pg_get_constraintdef(oid)), ''
  from pg_constraint where connamespace = 'public'::regnamespace
  union all
  select 'index', indexname, md5(indexdef), '' from pg_indexes where schemaname = 'public'
  union all
  select 'trigger', tgrelid::regclass::text || '.' || tgname, md5(pg_get_triggerdef(oid)), ''
  from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
  union all
  select 'type', t.typname, md5(string_agg(e.enumlabel, ',' order by e.enumsortorder)), ''
  from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typnamespace = 'public'::regnamespace group by t.typname
)
select case when to_regclass('cron.job') is null then 'scheduled jobs: pg_cron is off'
            else 'scheduled jobs: ' || coalesce((select string_agg(x::text, '; ') from unnest(xpath('//row/jobname/text()|//row/schedule/text()',
                 query_to_xml('select jobname, schedule from cron.job where active order by jobname', true, false, ''))) x), 'none') end
       || E'\n' || count(*) || ' objects, fingerprint ' || left(md5(string_agg(kind || ' ' || name || ' ' || left(h, 8) || ' ' || extra, E'\n' order by kind, name)), 12)
       || E'\n' || string_agg(kind || ' ' || name || ' ' || left(h, 8) || ' ' || extra, E'\n' order by kind, name) as fingerprint
from objects;
