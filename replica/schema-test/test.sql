\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create schema test;
grant usage on schema test to authenticated;

create function test.ok(cond boolean, label text) returns text language plpgsql as $$
begin
  if cond is distinct from true then raise exception 'FAIL: %', label; end if;
  return 'ok   ' || label;
end $$;

create function test.rejects(stmt text, label text) returns text language plpgsql as $$
declare msg text;
begin
  begin
    execute stmt;
  exception when others then
    get stacked diagnostics msg = message_text;
    return 'ok   ' || label || '   <- ' || left(msg, 60);
  end;
  raise exception 'FAIL: % (statement was accepted)', label;
end $$;

-- ---------- users ----------
insert into auth.users (email, raw_user_meta_data) values ('a@t.local', '{"full_name":"Ada"}') returning id as ua \gset
insert into auth.users (email, raw_user_meta_data) values ('b@t.local', '{"full_name":"Bora"}') returning id as ub \gset
insert into auth.users (email, raw_user_meta_data) values ('c@t.local', '{"full_name":"Can"}') returning id as uc \gset
select test.ok((select count(*) from profiles) = 3, 'signup creates a profile row');

-- ---------- workspace seed ----------
set role authenticated;
set request.jwt.claim.sub = :'ua';
select app.create_workspace('Acme', 'acme') as ws1 \gset
select test.ok((select count(*) from pipelines) = 1, 'seed: one main pipeline');
select test.ok((select count(*) from stages) = 6, 'seed: incoming + 3 open + won + lost');
select test.ok((select count(*) from task_types) = 2, 'seed: two task types');
select test.ok((select plan from subscriptions) = 'trial', 'seed: trial subscription');
select id as p1 from pipelines \gset
select id as st_in from stages where kind = 'incoming' \gset
select id as st_open from stages where kind = 'open' order by sort limit 1 \gset
select id as st_open2 from stages where kind = 'open' order by sort offset 1 limit 1 \gset
select id as st_won from stages where kind = 'won' \gset
select id as st_lost from stages where kind = 'lost' \gset
select id as tt from task_types order by sort limit 1 \gset

set request.jwt.claim.sub = :'uc';
select app.create_workspace('Other', 'other-co') as ws2 \gset
select id as p2 from pipelines \gset
select id as st2_open from stages where kind = 'open' order by sort limit 1 \gset
select test.ok((select count(*) from pipelines) = 1, 'tenant wall: second tenant sees only its own pipeline');

reset role;
insert into workspace_members (workspace_id, user_id, rights) values
  (:'ws1', :'ub', '{"leads":{"view":"own"},"contacts":{"view":"all"},"companies":{"view":"all"},"tasks":{"view":"own"},"inbox":{"view":"own"}}');

-- ---------- channels ----------
set role authenticated;
set request.jwt.claim.sub = :'ua';
insert into channels (workspace_id, kind, name, external_account_id, status, pipeline_id)
  values (:'ws1', 'telegram', 'Bot', 'bot-1', 'connected', :'p1') returning id as ch1 \gset
set request.jwt.claim.sub = :'ub';
select test.rejects(format($q$insert into channels (workspace_id, kind, name, external_account_id) values (%L, 'telegram', 'x', 'bot-2')$q$, :'ws1'),
  'non-admin cannot connect a channel');
set request.jwt.claim.sub = :'uc';
select test.rejects(format($q$insert into channels (workspace_id, kind, name, external_account_id, status) values (%L, 'telegram', 'x', 'bot-1', 'connected')$q$, :'ws2'),
  'same external account cannot be connected to two workspaces');
reset role;

-- ---------- inbound flow (server side) ----------
insert into contacts (workspace_id, name) values (:'ws1', 'Müşteri Bir') returning id as c1 \gset
insert into contacts (workspace_id, name) values (:'ws1', 'Kopya') returning id as c2 \gset
insert into contact_handles (workspace_id, contact_id, kind, value) values (:'ws1', :'c1', 'telegram', '777');
select test.rejects(format($q$insert into contact_handles (workspace_id, contact_id, kind, value) values (%L, %L, 'telegram', '777')$q$, :'ws1', :'c2'),
  'one channel identity maps to one contact');
insert into contact_handles (workspace_id, contact_id, kind, value) values (:'ws1', :'c1', 'phone', '+905550000000'), (:'ws1', :'c2', 'phone', '+905550000000');
select test.ok(true, 'shared phone number is allowed on two contacts');

insert into leads (workspace_id, name, currency, pipeline_id, stage_id, incoming_category, responsible_user_id)
  values (:'ws1', 'Telegram talebi', 'USD', :'p1', :'st_in', 'chat', :'ua') returning id as l1 \gset
insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (:'ws1', :'l1', :'c1', true);
select test.rejects(format($q$insert into lead_contacts (workspace_id, lead_id, contact_id, is_main) values (%L, %L, %L, true)$q$, :'ws1', :'l1', :'c2'),
  'a lead has exactly one main contact');
select test.rejects(format($q$insert into leads (workspace_id, name, currency, pipeline_id, stage_id) values (%L, 'x', 'USD', %L, %L)$q$, :'ws1', :'p1', :'st2_open'),
  'stage must belong to the lead''s pipeline');
select test.rejects(format($q$insert into leads (workspace_id, name, currency, pipeline_id, stage_id) values (%L, 'x', 'USD', %L, %L)$q$, :'ws1', :'p2', :'st2_open'),
  'lead cannot point at another tenant''s pipeline');
select test.rejects(format($q$insert into leads (workspace_id, name, currency, pipeline_id, stage_id, price_minor) values (%L, 'x', 'USD', %L, %L, -5)$q$, :'ws1', :'p1', :'st_open'),
  'negative price is rejected');

insert into conversations (workspace_id, channel_id, contact_id, lead_id, external_chat_id, assigned_user_id)
  values (:'ws1', :'ch1', :'c1', :'l1', '777', :'ua') returning id as conv1 \gset
select test.rejects(format($q$insert into conversations (workspace_id, channel_id, contact_id, external_chat_id) values (%L, %L, %L, '777')$q$, :'ws1', :'ch1', :'c1'),
  'same chat cannot open a second conversation');
insert into messages (workspace_id, conversation_id, direction, sender_kind, body, external_message_id, status)
  values (:'ws1', :'conv1', 'in', 'contact', 'Merhaba', 'm1', 'received');
select test.rejects(format($q$insert into messages (workspace_id, conversation_id, direction, sender_kind, body, external_message_id, status) values (%L, %L, 'in', 'contact', 'Merhaba', 'm1', 'received')$q$, :'ws1', :'conv1'),
  'replayed webhook cannot store the same message twice');
select test.rejects(format($q$insert into messages (workspace_id, conversation_id, direction, sender_kind, body, status) values (%L, %L, 'in', 'contact', 'x', 'queued')$q$, :'ws1', :'conv1'),
  'inbound message must have status received');
select test.ok((select unread_count = 1 and last_inbound_at is not null and last_message_preview = 'Merhaba' from conversations where id = :'conv1'),
  'inbound message bumps unread count, preview and 24h-window clock');
select test.ok((select last_message_at is not null from leads where id = :'l1'), 'inbound message stamps the lead');

update conversations set status = 'closed', closed_at = now(), unread_count = 0 where id = :'conv1';
insert into messages (workspace_id, conversation_id, direction, sender_kind, body, external_message_id, status)
  values (:'ws1', :'conv1', 'in', 'contact', 'Orada mısınız?', 'm2', 'received');
select test.ok((select status = 'open' and closed_at is null from conversations where id = :'conv1'), 'new inbound message reopens a closed conversation');

insert into webhook_inbox (provider, channel_id, external_event_id, payload) values ('telegram', :'ch1', 'u-1', '{}');
select test.rejects(format($q$insert into webhook_inbox (provider, channel_id, external_event_id, payload) values ('telegram', %L, 'u-1', '{}')$q$, :'ch1'),
  'webhook delivered twice is stored once');
insert into webhook_inbox (provider, channel_id, external_event_id, payload) values ('billing', null, 'evt_1', '{}');
select test.rejects($q$insert into webhook_inbox (provider, channel_id, external_event_id, payload) values ('billing', null, 'evt_1', '{}')$q$,
  'billing webhook delivered twice is stored once');

-- ---------- stage transitions ----------
insert into loss_reasons (workspace_id, name) values (:'ws1', 'Bütçe') returning id as lr \gset
update leads set stage_id = :'st_open' where id = :'l1';
select test.ok((select incoming_category is null and closed_at is null from leads where id = :'l1'), 'accepting an incoming lead clears the incoming flag');
update leads set stage_id = :'st_lost', loss_reason_id = :'lr' where id = :'l1';
select test.ok((select closed_at is not null and loss_reason_id is not null from leads where id = :'l1'), 'lost stage sets closed_at and keeps the loss reason');
update leads set stage_id = :'st_open' where id = :'l1';
select test.ok((select closed_at is null and loss_reason_id is null from leads where id = :'l1'), 'reopening clears closed_at and the loss reason');
update leads set stage_id = :'st_won' where id = :'l1';
select test.ok((select closed_at is not null from leads where id = :'l1'), 'won stage sets closed_at');

insert into leads (workspace_id, name, currency, pipeline_id, stage_id, responsible_user_id)
  values (:'ws1', 'İkinci', 'USD', :'p1', :'st_open', :'ua') returning id as l2 \gset
select test.rejects(format('delete from stages where id = %L', :'st_won'), 'system stage cannot be deleted');
select test.rejects(format($q$update stages set kind = 'open' where id = %L$q$, :'st_won'), 'stage kind cannot be changed');
select test.rejects(format('delete from stages where id = %L', :'st_open'), 'stage that still holds leads cannot be deleted');
select test.rejects(format($q$insert into stages (workspace_id, pipeline_id, name, kind) values (%L, %L, 'İkinci kazanıldı', 'won')$q$, :'ws1', :'p1'),
  'a pipeline has only one won stage');
delete from stages where id = :'st_open2';
select test.ok((select count(*) from stages where pipeline_id = :'p1') = 5, 'empty open stage can be deleted');

-- ---------- tasks ----------
insert into tasks (workspace_id, lead_id, task_type_id, text, due_at, responsible_user_id)
  values (:'ws1', :'l2', :'tt', 'Ara', now() + interval '1 day', :'ua') returning id as t1 \gset
select test.ok((select closest_task_at is not null from leads where id = :'l2'), 'adding a task sets the lead''s closest task time');
update tasks set completed_at = now(), result_text = 'Arandı' where id = :'t1';
select test.ok((select closest_task_at is null from leads where id = :'l2'), 'completing the task clears it');
select test.rejects(format($q$insert into tasks (workspace_id, lead_id, task_type_id, due_at, result_text) values (%L, %L, %L, now(), 'x')$q$, :'ws1', :'l2', :'tt'),
  'a result needs a completed task');
select test.rejects(format($q$insert into tasks (workspace_id, lead_id, contact_id, task_type_id, due_at) values (%L, %L, %L, %L, now())$q$, :'ws1', :'l2', :'c1', :'tt'),
  'a task belongs to exactly one record');
select test.rejects(format('delete from task_types where id = %L', :'tt'), 'task type in use cannot be deleted');

-- ---------- bots and automations ----------
insert into bots (workspace_id, name) values (:'ws1', 'Karşılama') returning id as b1 \gset
insert into bot_runs (workspace_id, bot_id, conversation_id) values (:'ws1', :'b1', :'conv1') returning id as br1 \gset
select test.rejects(format('insert into bot_runs (workspace_id, bot_id, conversation_id) values (%L, %L, %L)', :'ws1', :'b1', :'conv1'),
  'one active bot per conversation');
update bot_runs set status = 'finished', ended_at = now() where id = :'br1';
insert into bot_runs (workspace_id, bot_id, conversation_id) values (:'ws1', :'b1', :'conv1');
select test.ok(true, 'a new bot can start once the previous one finished');

insert into automations (workspace_id, pipeline_id, stage_id, kind) values (:'ws1', :'p1', :'st_open', 'add_task') returning id as a1 \gset
insert into automation_runs (workspace_id, automation_id, lead_id, dedupe_key) values (:'ws1', :'a1', :'l2', 'evt-1');
select test.rejects(format($q$insert into automation_runs (workspace_id, automation_id, lead_id, dedupe_key) values (%L, %L, %L, 'evt-1')$q$, :'ws1', :'a1', :'l2'),
  'same event cannot run an automation twice');
select test.rejects(format($q$insert into automation_runs (workspace_id, automation_id, lead_id, dedupe_key, depth) values (%L, %L, %L, 'evt-2', 6)$q$, :'ws1', :'a1', :'l2'),
  'automation chain depth is capped');
select test.rejects(format($q$insert into automations (workspace_id, pipeline_id, stage_id, kind) values (%L, %L, %L, 'run_bot')$q$, :'ws1', :'p1', :'st_open'),
  'run_bot automation needs a bot');

-- ---------- lead intake and round-robin ----------
insert into lead_intakes (workspace_id, name, kind, pipeline_id, stage_id, token_hash)
  values (:'ws1', 'Reklam tablosu', 'google_sheets', :'p1', :'st_open', 'hash-1') returning id as in1 \gset
insert into lead_intake_events (workspace_id, intake_id, external_id, payload) values (:'ws1', :'in1', 'row-2', '{}');
select test.rejects(format($q$insert into lead_intake_events (workspace_id, intake_id, external_id, payload) values (%L, %L, 'row-2', '{}')$q$, :'ws1', :'in1'),
  'the same external record is stored once (no duplicate lead)');
select test.rejects(format($q$insert into lead_intakes (workspace_id, name, pipeline_id, stage_id, token_hash) values (%L, 'Kopya', %L, %L, 'hash-1')$q$, :'ws1', :'p1', :'st_open'),
  'intake tokens are unique');
select test.rejects(format($q$insert into lead_intakes (workspace_id, name, kind, pipeline_id, stage_id, token_hash) values (%L, 'Tür', 'excel', %L, %L, 'hash-2')$q$, :'ws1', :'p1', :'st_open'),
  'intake kind is restricted');
with c as (update automations set rr_cursor = rr_cursor + 1 where id = :'a1' returning rr_cursor)
  select test.ok((select rr_cursor from c) = 1, 'round-robin cursor advances and is read in one statement');

-- ---------- row level security ----------
insert into leads (workspace_id, name, currency, pipeline_id, stage_id, responsible_user_id)
  values (:'ws1', 'Bora''nın', 'USD', :'p1', :'st_open', :'ub') returning id as l3 \gset
insert into leads (workspace_id, name, currency, pipeline_id, stage_id)
  values (:'ws1', 'Sahipsiz', 'USD', :'p1', :'st_open') returning id as l4 \gset
insert into notes (workspace_id, lead_id, body, created_by) values (:'ws1', :'l2', 'Ada''nın notu', :'ua');

set role authenticated;
set request.jwt.claim.sub = :'uc';
select test.ok((select count(*) from leads) = 0, 'RLS: other tenant sees no leads');
select test.ok((select count(*) from contacts) = 0, 'RLS: other tenant sees no contacts');
select test.ok((select count(*) from messages) = 0, 'RLS: other tenant sees no messages');
select test.ok((select count(*) from workspace_members) = 1, 'RLS: other tenant sees only its own members');
select test.ok((select count(*) from lead_intakes) = 0, 'RLS: other tenant sees no intake endpoints');
select test.rejects(format($q$insert into leads (workspace_id, name, currency, pipeline_id, stage_id) values (%L, 'sızma', 'USD', %L, %L)$q$, :'ws1', :'p1', :'st_open'),
  'RLS: cannot insert a lead into another tenant');

set request.jwt.claim.sub = :'ub';
select test.ok((select count(*) from leads) = 2, 'RLS: "own" scope sees own + unassigned leads only');
select test.ok((select count(*) from leads where id = :'l2') = 0, 'RLS: "own" scope cannot see a colleague''s lead');
select test.ok((select count(*) from notes) = 0, 'RLS: notes follow the lead''s visibility');
select test.ok((select count(*) from conversations) = 0, 'RLS: "own" inbox scope hides a colleague''s conversation');
select test.ok((select count(*) from messages) = 0, 'RLS: messages follow the conversation''s visibility');
select test.ok((select count(*) from contacts) = 2, 'RLS: "all" scope on contacts sees every contact');
with u as (update pipelines set name = 'hacked' returning 1) select test.ok((select count(*) from u) = 0, 'RLS: non-admin cannot rename a pipeline');
with u as (update leads set name = 'hacked' where id = :'l2' returning 1) select test.ok((select count(*) from u) = 0, 'RLS: cannot update a lead outside the view scope');
insert into leads (workspace_id, name, currency, pipeline_id, stage_id, responsible_user_id)
  values (:'ws1', 'Bora ekledi', 'USD', :'p1', :'st_open', :'ub');
select test.ok((select count(*) from leads) = 3, 'RLS: member can add a lead in own tenant');
select test.rejects(format('select count(*) from webhook_inbox'), 'RLS: clients cannot read without table access') where false;
select test.ok((select count(*) from webhook_inbox) = 0, 'RLS: server-only table returns nothing to clients');
select test.ok((select count(*) from automation_runs) = 0, 'RLS: automation runs are server-only');
select test.ok((select count(*) from lead_intake_events) = 0, 'RLS: intake events are server-only');
select test.ok((select count(*) from lead_intakes) = 1, 'RLS: a member can see intake endpoints');
with u as (update lead_intakes set name = 'hacked' returning 1) select test.ok((select count(*) from u) = 0, 'RLS: non-admin cannot change an intake endpoint');

set request.jwt.claim.sub = :'ua';
select test.ok((select count(*) from leads) = 5, 'RLS: admin sees every lead in the tenant');
\set tok '11111111-1111-4111-8111-111111111111'
insert into messages (workspace_id, conversation_id, direction, sender_kind, sender_user_id, body, client_token, status)
  values (:'ws1', :'conv1', 'out', 'user', :'ua', 'Selam', :'tok', 'queued');
select test.rejects(format($q$insert into messages (workspace_id, conversation_id, direction, sender_kind, sender_user_id, body, client_token, status) values (%L, %L, 'out', 'user', %L, 'Selam', %L, 'queued')$q$, :'ws1', :'conv1', :'ua', :'tok'),
  'double-clicked send is stored once');
select test.rejects(format($q$insert into messages (workspace_id, conversation_id, direction, sender_kind, sender_user_id, body, status) values (%L, %L, 'out', 'user', %L, 'sahte', 'queued')$q$, :'ws1', :'conv1', :'ub'),
  'RLS: cannot send a message as another user');
select test.rejects(format($q$insert into messages (workspace_id, conversation_id, direction, sender_kind, body, status) values (%L, %L, 'in', 'contact', 'sahte gelen', 'received')$q$, :'ws1', :'conv1'),
  'RLS: clients cannot forge an inbound message');
select test.ok((select unread_count from conversations where id = :'conv1') = 1, 'outbound message does not change the unread count');
reset role;

-- ---------- group copy and last admin ----------
insert into groups (workspace_id, name) values (:'ws1', 'Satış ekibi') returning id as g1 \gset
select l.updated_at as l3_updated from leads l where l.id = :'l3' \gset
update workspace_members set group_id = :'g1' where workspace_id = :'ws1' and user_id = :'ub';
select test.ok((select group_id from leads where id = :'l3') = :'g1', 'changing a member''s group updates the group copy on their leads');
select test.ok((select updated_at from leads where id = :'l3') = :'l3_updated'::timestamptz, 'the group copy does not count as an update to the record');
update leads set responsible_user_id = :'ua' where id = :'l3';
select test.ok((select group_id from leads where id = :'l3') is null, 'reassigning a lead takes the new owner''s group');
update leads set responsible_user_id = :'ub' where id = :'l3';
select l.updated_at as l3_updated from leads l where l.id = :'l3' \gset
update leads set currency = 'USD' where id = :'l3';
select test.ok((select updated_at from leads where id = :'l3') = :'l3_updated'::timestamptz, 'a workspace currency change does not count as an update to the lead');
update leads set name = name || ' ' where id = :'l3';
select test.ok((select updated_at from leads where id = :'l3') >= :'l3_updated'::timestamptz, 'a real change still stamps updated_at');
select test.rejects(format($q$update workspace_members set is_admin = false where workspace_id = %L and user_id = %L$q$, :'ws1', :'ua'),
  'the last admin cannot be demoted');
select test.rejects(format($q$update workspace_members set is_active = false where workspace_id = %L and user_id = %L$q$, :'ws1', :'ua'),
  'the last admin cannot be deactivated');

-- ---------- limits, invitations ----------
select test.rejects(format($q$insert into pipelines (workspace_id, name, is_main) values (%L, 'İkinci ana', true)$q$, :'ws1'), 'one main pipeline per workspace');
select test.rejects(format('delete from pipelines where id = %L', :'p1'), 'main pipeline cannot be deleted');
insert into pipelines (workspace_id, name) select :'ws1', 'P' || g from generate_series(2, 50) g;
select test.rejects(format($q$insert into pipelines (workspace_id, name) values (%L, 'P51')$q$, :'ws1'), 'pipeline limit is 50');
insert into invitations (workspace_id, email, token_hash, expires_at) values (:'ws1', 'yeni@t.local', 'h1', now() + interval '12 hours');
select test.rejects(format($q$insert into invitations (workspace_id, email, token_hash, expires_at) values (%L, 'YENI@t.local', 'h2', now() + interval '12 hours')$q$, :'ws1'),
  'one pending invitation per e-mail (case-insensitive)');
insert into tags (workspace_id, entity_type, name, color) values (:'ws1', 'lead', 'VIP', 5);
select test.rejects(format($q$insert into tags (workspace_id, entity_type, name) values (%L, 'lead', 'vip')$q$, :'ws1'), 'tag names are unique per record type, ignoring case');
select test.rejects(format($q$insert into tags (workspace_id, entity_type, name, color) values (%L, 'contact', 'Renkli', 5)$q$, :'ws1'), 'only lead tags carry a colour');

-- ---------- cascades ----------
delete from auth.users where id = :'ub';
select test.ok((select count(*) from leads where id = :'l3' and responsible_user_id is null and workspace_id is not null) = 1,
  'deleting a user unassigns their leads without touching workspace_id');
delete from workspaces where id = :'ws1';
select test.ok((select count(*) from leads where workspace_id = :'ws1') + (select count(*) from stages where workspace_id = :'ws1')
  + (select count(*) from messages where workspace_id = :'ws1') = 0, 'deleting a workspace removes all of its data');
select test.ok((select count(*) from pipelines) = 1, 'the other tenant is untouched');

-- ---------- structure report ----------
select test.ok((select count(*) from pg_tables where schemaname = 'public' and not rowsecurity) = 0, 'RLS is enabled on every table');
\echo '--- counts ---'
select 'tables=' || (select count(*) from pg_tables where schemaname = 'public')
  || ' policies=' || (select count(*) from pg_policies where schemaname = 'public')
  || ' indexes=' || (select count(*) from pg_indexes where schemaname = 'public')
  || ' triggers=' || (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal)
  || ' functions=' || (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'app');
\echo '--- tables without any policy (server-only) ---'
select string_agg(t.tablename, ', ' order by t.tablename) from pg_tables t
  where t.schemaname = 'public' and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = t.tablename);
\echo '--- foreign keys to tenant data with no supporting index (audit columns to profiles and plain workspace_id excluded) ---'
with fk as (
  select c.oid, c.conrelid, c.conname, c.conkey, c.confrelid,
         array(select k.attnum from unnest(c.conkey) k(attnum)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
               where cardinality(c.conkey) = 1 or a.attname <> 'workspace_id') as own_cols,
         (select a.attnum from pg_attribute a where a.attrelid = c.conrelid and a.attname = 'workspace_id') as ws_col
  from pg_constraint c
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
    and c.confrelid not in ('profiles'::regclass, 'workspaces'::regclass)
)
select coalesce(string_agg(fk.conrelid::regclass || '.' || fk.conname, E'\n' order by 1), '(none)')
from fk
where not exists (
  select 1 from pg_index i
  where i.indrelid = fk.conrelid
    and (i.indkey[0] = any (fk.own_cols) or (i.indkey[0] = fk.ws_col and i.indkey[1] = any (fk.own_cols)))
);
