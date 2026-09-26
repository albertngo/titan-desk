-- 008: sign-up restriction — the Before User Created hook and its trigger fallback.
begin;
select plan(8);

-- not configured (empty) → allow everything, the Azure tenant pin is the primary control
update mirror.settings set value = '' where key = 'allowed_email_domains';
select ok(mirror.email_domain_allowed('anyone@example.com'), 'empty allow-list allows any domain');
select is(mirror.hook_restrict_signup('{"user":{"email":"anyone@example.com"}}'::jsonb), '{}'::jsonb, 'hook returns {} (continue) when not configured');

-- configured
update mirror.settings set value = 'titanflooring.ca, Titan-Flooring.com' where key = 'allowed_email_domains';
select ok(mirror.email_domain_allowed('Staff@TitanFlooring.ca'), 'allowed domain, case-insensitive');
select ok(mirror.email_domain_allowed('x@titan-flooring.com'), 'second allowed domain, spaces in setting ignored');
select ok(not mirror.email_domain_allowed('x@gmail.com'), 'other domain rejected');
select is(mirror.hook_restrict_signup('{"user":{"email":"x@gmail.com"}}'::jsonb) -> 'error' ->> 'http_code', '403', 'hook returns a 403 error object');

-- trigger fallback on auth.users
select lives_ok($$insert into auth.users (email) values ('ok@titanflooring.ca')$$, 'allowed domain can be created');
select throws_ok($$insert into auth.users (email) values ('nope@gmail.com')$$, 'P0001', 'other domain is rejected by the trigger');

select * from finish();
rollback;
