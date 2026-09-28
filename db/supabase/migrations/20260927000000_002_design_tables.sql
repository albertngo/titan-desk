-- 002: Design Dictionary + Design Rules (Airtable tables tblKJNVM4T9LfKwIs, tblymUIiDJiay30YL).
--
-- The Help me choose flow (web/src/lib/design) reads these to turn what a client says into
-- catalogue attributes (Dictionary) and to apply a designer's judgment (Rules). Both tables
-- are small (tens of rows) and edited by Albert in Airtable; the worker replaces them whole
-- on every sync run (sync/titan_sync/design.py). Staff-only for now: the public website
-- agent reads them later, through a view added then.
--
-- Safety rules are listed in Airtable for visibility but ENFORCED IN CODE
-- (web/src/lib/design/safety.ts): api.design_rules returns them whatever their Active box
-- says, and the app never relaxes them.

create table mirror.design_dictionary (
  airtable_record_id text primary key,
  phrase             text not null,
  matches            text[] not null default '{}',   -- lower-cased trigger words/phrases
  kind               text not null check (kind in ('Preference', 'Avoid')),
  undertone          text[] not null default '{}',
  tone_depth_min     smallint check (tone_depth_min between 1 and 5),
  tone_depth_max     smallint check (tone_depth_max between 1 and 5),
  busyness           text[] not null default '{}',
  texture            text[] not null default '{}',
  style              text[] not null default '{}',
  width_min_in       numeric,
  width_max_in       numeric,
  weight             numeric not null default 1 check (weight >= 0),
  also_look_for      text,
  also_avoid         text,
  say_to_client      text,
  notes              text,                           -- internal; not in the api view
  active             boolean not null default false,
  synced_at          timestamptz not null default now()
);

create table mirror.design_rules (
  airtable_record_id text primary key,
  rule               text not null,
  key                text not null unique,
  kind               text not null check (kind in ('Safety', 'Design')),
  rule_when          text not null,
  effect             text not null check (effect in ('Require', 'Exclude', 'Boost', 'Penalize', 'Warn')),
  field              text,
  rule_values        text,
  weight             numeric check (weight >= 0),
  say_to_client      text,
  notes              text,                           -- internal; not in the api view
  active             boolean not null default false,
  synced_at          timestamptz not null default now()
);

grant select, insert, update, delete on mirror.design_dictionary, mirror.design_rules to sync_worker;
alter table mirror.design_dictionary enable row level security;
alter table mirror.design_rules enable row level security;
create policy sync_all on mirror.design_dictionary for all to sync_worker using (true) with check (true);
create policy sync_all on mirror.design_rules      for all to sync_worker using (true) with check (true);

-- Active phrases only; internal notes stay behind.
create view api.design_dictionary as
select airtable_record_id as id, phrase, matches, kind, undertone, tone_depth_min, tone_depth_max,
       busyness, texture, style, width_min_in, width_max_in, weight,
       also_look_for, also_avoid, say_to_client
  from mirror.design_dictionary
 where active;

-- Active design rules, plus EVERY safety rule regardless of its Active box (safety is never off).
create view api.design_rules as
select key, rule, kind, rule_when, effect, field, rule_values, coalesce(weight, 0) as weight, say_to_client
  from mirror.design_rules
 where active or kind = 'Safety';

grant select on api.design_dictionary, api.design_rules to authenticated;
