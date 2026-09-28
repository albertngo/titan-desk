-- 009: Design Dictionary + Design Rules — staff-only views, exact columns, safety always on.
begin;
select plan(14);

-- privileges
select ok(has_table_privilege('authenticated', 'api.design_dictionary', 'SELECT'), 'authenticated can SELECT design_dictionary');
select ok(has_table_privilege('authenticated', 'api.design_rules', 'SELECT'),      'authenticated can SELECT design_rules');
select ok(not has_table_privilege('anon', 'api.design_dictionary', 'SELECT'),      'anon cannot SELECT design_dictionary (staff only for now)');
select ok(not has_table_privilege('anon', 'api.design_rules', 'SELECT'),           'anon cannot SELECT design_rules (staff only for now)');
select ok(not has_table_privilege('authenticated', 'mirror.design_rules', 'SELECT'), 'authenticated cannot read mirror.design_rules');
select ok(has_table_privilege('sync_worker', 'mirror.design_dictionary', 'DELETE'), 'sync_worker can replace mirror.design_dictionary');

-- exact columns (internal notes never leave the mirror)
select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'api' and table_name = 'design_dictionary'),
  array['id','phrase','matches','kind','undertone','tone_depth_min','tone_depth_max','busyness','texture','style',
        'width_min_in','width_max_in','weight','also_look_for','also_avoid','say_to_client']::text[],
  'api.design_dictionary columns');
select is(
  (select array_agg(column_name::text order by ordinal_position) from information_schema.columns
    where table_schema = 'api' and table_name = 'design_rules'),
  array['key','rule','kind','rule_when','effect','field','rule_values','weight','say_to_client']::text[],
  'api.design_rules columns');

-- behaviour
insert into mirror.design_dictionary (airtable_record_id, phrase, matches, kind, undertone, active, notes) values
  ('recD1', 'Warm, cozy', '{warm,cozy}', 'Preference', '{Warm}', true,  'internal'),
  ('recD2', 'Retired',    '{old}',       'Preference', '{}',     false, null);
insert into mirror.design_rules (airtable_record_id, rule, key, kind, rule_when, effect, field, weight, active) values
  ('recR1', 'Below grade needs waterproof', 'below_grade_waterproof', 'Safety', 'Below grade', 'Require', 'Waterproof', null, false),
  ('recR2', 'Pets: mid tones',              'pets_mid_tones',         'Design', 'Pets',        'Boost',   'Tone depth', 0.5,  true),
  ('recR3', 'Switched off',                 'off_rule',               'Design', 'Pets',        'Boost',   'Texture',    0.3,  false);

set local role authenticated;
select is((select array_agg(phrase order by phrase) from api.design_dictionary), array['Warm, cozy'], 'inactive phrases are hidden');
select is((select array_agg(key order by key) from api.design_rules), array['below_grade_waterproof', 'pets_mid_tones'],
          'inactive design rules are hidden; a safety rule shows even with Active unticked');
select is((select weight from api.design_rules where key = 'below_grade_waterproof'), 0::numeric, 'a blank weight reads as 0');
select throws_ok($$select notes from api.design_dictionary$$, '42703', null, 'notes is not exposed');
reset role;

set local role anon;
select throws_ok($$select * from api.design_rules$$, '42501', null, 'anon: design_rules is permission denied');
reset role;

select throws_ok($$insert into mirror.design_rules (airtable_record_id, rule, key, kind, rule_when, effect)
                   values ('recX', 'x', 'pets_mid_tones', 'Design', 'Pets', 'Boost')$$,
                 '23505', null, 'rule keys are unique');

select * from finish();
rollback;
