-- =====================================================================
-- LeadraCRM — şema v1 (must + should dalgaları)
-- Hedef: Supabase (Postgres 15+). Yerelde Postgres 16 üzerinde çalıştırılıp denendi.
--
-- Kurallar
--   * Her tabloda workspace_id; kiracılar arası referanslar bileşik
--     yabancı anahtarlarla (workspace_id, id) engellenir.
--   * Zamanlar timestamptz, UTC saklanır.
--   * Para küçük birimde (kuruş/cent) bigint + para birimi.
--   * RLS her tabloda açık: kiracı duvarı + görüntüleme kapsamı.
--     Düzenle / ekle / sil / dışa aktar yetkileri veri katmanındaki tek
--     authorize() işlevinde denetlenir (architecture.md, "Erişim kuralları").
--   * Kanal ve posta kutusu gizli anahtarları tabloda durmaz; Supabase
--     Vault'taki kaydın kimliği tutulur.
-- =====================================================================

create extension if not exists citext;
create extension if not exists pg_trgm;

create schema if not exists app;

-- Büyük/küçük harf duyarsız karşılaştırma anahtarı. Türkçede I-ı ve İ-i çiftleri düz lower() ile eşleşmez
-- ("VIP" varken "vip" eklenebiliyordu); dört harf de "i" sayılır. Uygulamadaki fold() ile aynı kural.
-- Harf küçültme veritabanının yerel ayarına bağlı kalmasın diye ICU harmanlaması açıkça verilir.
create or replace function app.fold(t text) returns text
language sql immutable parallel safe as $$
  select btrim(lower(translate(normalize(t, NFKC), 'İIı', 'iii') collate "und-x-icu"))
$$;

-- ---------------------------------------------------------------------
-- Çalışma alanı, kullanıcılar, ekip
-- ---------------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email citext not null,
  lang text not null default 'en',
  timezone text,
  phone text,
  avatar_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  language text not null default 'en',
  country text,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  time_format text not null default '24' check (time_format in ('12', '24')),
  date_format text not null default 'text' check (date_format in ('text', 'dmy', 'mdy', 'ymd')),   -- text: "21 Kas 2026"
  loss_reasons_enabled boolean not null default true,
  name_display_order smallint not null default 1 check (name_display_order in (1, 2)),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index groups_workspace_idx on groups (workspace_id, sort);

-- rights: {"leads":{"view":L,"edit":L,"add":true|false,"delete":L,"export":L},
--          "contacts":{..},"companies":{..},"tasks":{"view":L,"edit":L,"delete":L},
--          "inbox":{"view":L},"mail":true,"lists":true}     L = "all" | "group" | "own" | "none"
-- Görme (view) kapsamını veritabanı (RLS) uygular; düzenleme, ekleme, silme ve dışa aktarmayı
-- uygulamanın authorize() işlevi denetler. Eksik anahtar "none" / false sayılır. Yönetici her şeyi yapar.
create table roles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  rights jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index roles_workspace_idx on roles (workspace_id);

create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  is_admin boolean not null default false,
  is_active boolean not null default true,
  group_id uuid,
  role_id uuid,
  rights jsonb not null default '{}',          -- role_id boşsa geçerli
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, user_id),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id),
  foreign key (workspace_id, role_id) references roles (workspace_id, id) on delete set null (role_id)
);
create index workspace_members_user_idx on workspace_members (user_id);
create index workspace_members_group_idx on workspace_members (workspace_id, group_id);

create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  email citext not null,
  full_name text not null default '',
  is_admin boolean not null default false,
  group_id uuid,
  role_id uuid,
  rights jsonb not null default '{}',
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  invited_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id),
  foreign key (workspace_id, role_id) references roles (workspace_id, id) on delete set null (role_id),
  check (expires_at > created_at)
);
-- Aynı e-postaya aynı çalışma alanında tek bekleyen davet.
create unique index invitations_one_pending on invitations (workspace_id, email) where status = 'pending';

-- ---- Giriş: uygulamanın kendi şifreli girişi ----------------------------
-- Bu üç tabloya yalnız sunucu erişir: RLS açık, hiçbir kural yok (authenticated rolü hiçbir satırı göremez).
-- Şifrenin kendisi saklanmaz; yalnız scrypt özeti (src/server/password.ts).
create table user_credentials (
  user_id uuid primary key references profiles (id) on delete cascade,
  password_hash text not null,
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Oturum: çerezdeki belirtecin SHA-256 özeti. Süresi kullanıldıkça uzar.
create table user_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  token_hash text not null unique,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index user_sessions_user_idx on user_sessions (user_id);

-- Tek kullanımlık belirteçler: e-posta doğrulama ve şifre sıfırlama. Yalnız özeti saklanır.
create table auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind text not null check (kind in ('verify', 'reset')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index auth_tokens_user_idx on auth_tokens (user_id, kind);

create table subscriptions (
  workspace_id uuid primary key references workspaces (id) on delete cascade,
  provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  plan text not null default 'trial' check (plan in ('trial', 'base', 'advanced', 'pro', 'enterprise')),
  seats int not null default 10 check (seats >= 1),   -- denemede 10 koltuk; abone olurken yönetici seçer
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  billing_period text check (billing_period in ('month', 'year')),
  cancel_at_period_end boolean not null default false,   -- iptal edildi; dönem sonuna kadar kullanım sürer
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Pipeline ve aşamalar
-- ---------------------------------------------------------------------

create table pipelines (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  sort int not null default 0,
  is_main boolean not null default false,
  incoming_enabled boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (not (is_main and archived_at is not null))      -- ana pipeline arşivlenemez
);
create unique index pipelines_one_main on pipelines (workspace_id) where is_main;
create index pipelines_workspace_idx on pipelines (workspace_id, sort);

create table stages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  pipeline_id uuid not null,
  name text not null check (length(name) between 1 and 100),
  sort int not null default 0,
  color smallint not null default 8 check (color between 1 and 8),   -- tasarım token'ı: --stage-1 … --stage-8
  kind text not null default 'open' check (kind in ('incoming', 'open', 'won', 'lost')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (pipeline_id, id),
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete cascade
);
-- Pipeline başına tam bir gelen, bir kazanıldı, bir kaybedildi aşaması.
create unique index stages_one_system_kind on stages (pipeline_id, kind) where kind <> 'open';
create index stages_pipeline_idx on stages (pipeline_id, sort);

create table loss_reasons (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index loss_reasons_workspace_idx on loss_reasons (workspace_id, sort);

-- ---------------------------------------------------------------------
-- Dosyalar, kanallar, kaynaklar
-- ---------------------------------------------------------------------

create table files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  bucket text not null,
  path text not null,
  name text not null,
  mime text,
  size_bytes bigint not null check (size_bytes >= 0),
  uploaded_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (bucket, path)
);
create index files_workspace_idx on files (workspace_id, created_at desc);

create table channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('telegram', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'livechat', 'sms', 'viber')),
  name text not null,
  external_account_id text not null,           -- bot kimliği, telefon numarası kimliği, sayfa kimliği
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  credentials_secret_id uuid,                  -- Supabase Vault kaydı (kullanılmıyor; anahtar aşağıdaki sütunda şifreli durur)
  credentials_sealed text,                     -- kanal anahtarı: uygulama sırrıyla AES-256-GCM (src/server/secret-box.ts)
  is_demo boolean not null default false,      -- örnek verinin kanalı: anahtarı yoktur, yalnız geliştirmede mesaj "gönderilmiş" sayılır
  last_event_at timestamptz,                   -- kanaldan gelen son bildirim (kanal sağlığı)
  webhook_token_hash text,                     -- gelen webhook yolundaki gizli parçanın özeti
  pipeline_id uuid,                            -- gelen talepler bu pipeline'a düşer
  settings jsonb not null default '{}',
  last_error text,
  connected_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete set null (pipeline_id)
);
-- Bir dış hesap aynı anda tek çalışma alanına bağlı olabilir (webhook yönlendirmesi buna dayanır).
create unique index channels_external_unique on channels (kind, external_account_id) where status <> 'disconnected';
create index channels_workspace_idx on channels (workspace_id, kind);

create table sources (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('channel', 'webform', 'chat_button', 'import', 'manual', 'api', 'google_sheets', 'email')),
  name text not null,
  channel_id uuid,
  pipeline_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, channel_id) references channels (workspace_id, id) on delete set null (channel_id),
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete set null (pipeline_id)
);
create index sources_workspace_idx on sources (workspace_id, kind);

-- ---------------------------------------------------------------------
-- Şirketler, kişiler, lead'ler
-- ---------------------------------------------------------------------

create table companies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 255),
  responsible_user_id uuid,
  group_id uuid,                               -- sorumlunun grubu (kapsam denetimi için kopya)
  custom jsonb not null default '{}',          -- {alan_id: değer}
  closest_task_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  updated_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, responsible_user_id) references workspace_members (workspace_id, user_id) on delete set null (responsible_user_id),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id)
);
create index companies_list_idx on companies (workspace_id, updated_at desc) where deleted_at is null;
create index companies_responsible_idx on companies (workspace_id, responsible_user_id) where deleted_at is null;
create index companies_name_trgm on companies using gin (name gin_trgm_ops);
create index companies_custom_gin on companies using gin (custom jsonb_path_ops);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null default '',
  first_name text,
  last_name text,
  company_id uuid,                             -- kişi başına tek şirket
  responsible_user_id uuid,
  group_id uuid,
  custom jsonb not null default '{}',
  closest_task_at timestamptz,
  deleted_at timestamptz,
  created_by uuid references profiles (id) on delete set null,
  updated_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, company_id) references companies (workspace_id, id) on delete set null (company_id),
  foreign key (workspace_id, responsible_user_id) references workspace_members (workspace_id, user_id) on delete set null (responsible_user_id),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id)
);
create index contacts_list_idx on contacts (workspace_id, updated_at desc) where deleted_at is null;
create index contacts_responsible_idx on contacts (workspace_id, responsible_user_id) where deleted_at is null;
create index contacts_company_idx on contacts (company_id) where company_id is not null;
create index contacts_name_trgm on contacts using gin (name gin_trgm_ops);
create index contacts_custom_gin on contacts using gin (custom jsonb_path_ops);

-- Sıra önemli olan tablolarda (iletişim bilgileri, akış, mesajlar) created_at varsayılanı clock_timestamp()'tir:
-- aynı işlem içinde art arda eklenen satırlar now() ile aynı ana düşer ve sıraları belirsizleşirdi.
-- Telefon, e-posta ve kanal kimlikleri. Gelen mesajın kime ait olduğu buradan bulunur.
create table contact_handles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  contact_id uuid not null,
  kind text not null check (kind in ('phone', 'email', 'telegram', 'whatsapp', 'instagram', 'facebook', 'tiktok', 'livechat', 'viber', 'sms')),
  value text not null check (length(value) between 1 and 320),   -- normalleştirilmiş: E.164, küçük harf e-posta, platform kimliği
  label text,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade
);
-- Kanal kimliği çalışma alanında tek kişiye aittir: aynı kişiden gelen ikinci mesaj yeni kişi açamaz.
-- Telefon ve e-posta bilerek serbest (paylaşılan numara olabilir; yinelenenler birleştirme ile çözülür).
create unique index contact_handles_channel_identity on contact_handles (workspace_id, kind, value)
  where kind not in ('phone', 'email');
create index contact_handles_lookup_idx on contact_handles (workspace_id, kind, value);
create index contact_handles_contact_idx on contact_handles (contact_id);
create index contact_handles_value_trgm on contact_handles using gin (value gin_trgm_ops);

create table leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null default '',
  price_minor bigint not null default 0 check (price_minor >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  pipeline_id uuid not null,
  stage_id uuid not null,
  responsible_user_id uuid,
  group_id uuid,
  company_id uuid,                             -- lead başına tek şirket
  loss_reason_id uuid,
  source_id uuid,
  score int,
  incoming_category text check (incoming_category in ('chat', 'form', 'mail', 'call')),
  incoming_meta jsonb,
  stage_entered_at timestamptz not null default now(),
  closed_at timestamptz,                       -- tetikleyici yönetir: kazanıldı/kaybedildi aşamasında dolu
  closest_task_at timestamptz,
  last_message_at timestamptz,
  custom jsonb not null default '{}',
  deleted_at timestamptz,                      -- çöp kutusu
  created_by uuid references profiles (id) on delete set null,
  updated_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  -- Dolu pipeline ve dolu aşama silinemez.
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete no action,
  -- Aşama, lead'in pipeline'ına ait olmak zorunda.
  foreign key (pipeline_id, stage_id) references stages (pipeline_id, id) on delete no action,
  foreign key (workspace_id, responsible_user_id) references workspace_members (workspace_id, user_id) on delete set null (responsible_user_id),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id),
  foreign key (workspace_id, company_id) references companies (workspace_id, id) on delete set null (company_id),
  foreign key (workspace_id, loss_reason_id) references loss_reasons (workspace_id, id) on delete set null (loss_reason_id),
  foreign key (workspace_id, source_id) references sources (workspace_id, id) on delete set null (source_id)
);
create index leads_board_idx on leads (workspace_id, pipeline_id, stage_id, updated_at desc) where deleted_at is null;
create index leads_responsible_idx on leads (workspace_id, responsible_user_id) where deleted_at is null;
create index leads_created_idx on leads (workspace_id, created_at desc);
create index leads_closed_idx on leads (workspace_id, closed_at) where closed_at is not null;
create index leads_no_task_idx on leads (workspace_id, closest_task_at) where deleted_at is null and closed_at is null;
create index leads_company_idx on leads (company_id) where company_id is not null;
create index leads_trash_idx on leads (workspace_id, deleted_at) where deleted_at is not null;
create index leads_name_trgm on leads using gin (name gin_trgm_ops);
create index leads_custom_gin on leads using gin (custom jsonb_path_ops);

create table lead_contacts (
  workspace_id uuid not null,
  lead_id uuid not null,
  contact_id uuid not null,
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (lead_id, contact_id),
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade
);
create unique index lead_contacts_one_main on lead_contacts (lead_id) where is_main;
create index lead_contacts_contact_idx on lead_contacts (contact_id);

-- ---------------------------------------------------------------------
-- Etiketler ve özel alanlar
-- ---------------------------------------------------------------------

create table tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'contact', 'company')),
  name text not null check (length(name) between 1 and 60),
  color smallint check (color between 1 and 8),   -- tasarım token'ı: --stage-1 … --stage-8
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (color is null or entity_type = 'lead')         -- renk yalnız lead etiketlerinde
);
create unique index tags_name_unique on tags (workspace_id, entity_type, app.fold(name));

create table taggings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  tag_id uuid not null,
  lead_id uuid,
  contact_id uuid,
  company_id uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(lead_id, contact_id, company_id) = 1),
  foreign key (workspace_id, tag_id) references tags (workspace_id, id) on delete cascade,
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references companies (workspace_id, id) on delete cascade
);
create unique index taggings_lead_unique on taggings (tag_id, lead_id) where lead_id is not null;
create unique index taggings_contact_unique on taggings (tag_id, contact_id) where contact_id is not null;
create unique index taggings_company_unique on taggings (tag_id, company_id) where company_id is not null;
create index taggings_lead_idx on taggings (lead_id) where lead_id is not null;
create index taggings_contact_idx on taggings (contact_id) where contact_id is not null;
create index taggings_company_idx on taggings (company_id) where company_id is not null;

create table custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  entity_type text not null check (entity_type in ('lead', 'contact', 'company')),
  name text not null check (length(name) between 1 and 120),
  code text,
  type text not null check (type in (
    'text', 'textarea', 'numeric', 'checkbox', 'select', 'multiselect', 'radio',
    'date', 'datetime', 'url', 'phone', 'email', 'address', 'birthday',
    'price', 'file', 'linked_entity', 'tracking')),
  sort int not null default 0,
  is_system boolean not null default false,    -- silinemez ve adlandırılamaz
  is_api_only boolean not null default false,
  show_on_card boolean not null default true,
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create unique index custom_fields_code_unique on custom_fields (workspace_id, entity_type, code) where code is not null;
create index custom_fields_list_idx on custom_fields (workspace_id, entity_type, sort);
-- Aynı kayıt türünde aynı adla iki alan olamaz (Türkçe harf katlamasıyla).
create unique index custom_fields_name_unique on custom_fields (workspace_id, entity_type, app.fold(name));

create table custom_field_options (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  field_id uuid not null,
  value text not null check (length(value) between 1 and 255),
  sort int not null default 0,
  color smallint check (color between 1 and 8),   -- tasarım token'ı: --stage-1 … --stage-8
  created_at timestamptz not null default now(),
  foreign key (workspace_id, field_id) references custom_fields (workspace_id, id) on delete cascade
);
create index custom_field_options_field_idx on custom_field_options (field_id, sort);

create table custom_field_stage_rules (
  workspace_id uuid not null,
  field_id uuid not null,
  stage_id uuid not null,
  rule text not null check (rule in ('required', 'hidden')),
  primary key (field_id, stage_id, rule),
  foreign key (workspace_id, field_id) references custom_fields (workspace_id, id) on delete cascade,
  foreign key (workspace_id, stage_id) references stages (workspace_id, id) on delete cascade
);
create index custom_field_stage_rules_stage_idx on custom_field_stage_rules (stage_id);

-- ---------------------------------------------------------------------
-- Görevler, notlar, etkinlik günlüğü
-- ---------------------------------------------------------------------

create table task_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 60),
  code text,
  color smallint check (color between 1 and 8),   -- tasarım token'ı: --stage-1 … --stage-8
  icon text,
  is_system boolean not null default false,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index task_types_workspace_idx on task_types (workspace_id, sort);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid,
  contact_id uuid,
  company_id uuid,
  task_type_id uuid not null,
  text text not null default '',
  due_at timestamptz not null,
  duration_seconds int check (duration_seconds is null or duration_seconds >= 0),
  responsible_user_id uuid,
  group_id uuid,
  completed_at timestamptz,
  completed_by uuid references profiles (id) on delete set null,
  result_text text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (num_nonnulls(lead_id, contact_id, company_id) = 1),
  check (result_text is null or completed_at is not null),
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references companies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, task_type_id) references task_types (workspace_id, id) on delete no action,
  foreign key (workspace_id, responsible_user_id) references workspace_members (workspace_id, user_id) on delete set null (responsible_user_id),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id)
);
create index tasks_calendar_idx on tasks (workspace_id, responsible_user_id, due_at) where completed_at is null;
create index tasks_due_idx on tasks (workspace_id, due_at);
create index tasks_lead_idx on tasks (lead_id, due_at) where lead_id is not null;
create index tasks_contact_idx on tasks (contact_id, due_at) where contact_id is not null;
create index tasks_company_idx on tasks (company_id, due_at) where company_id is not null;
create index tasks_type_idx on tasks (task_type_id);

create table notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  lead_id uuid,
  contact_id uuid,
  company_id uuid,
  type text not null default 'common' check (type in (
    'common', 'attachment', 'system', 'call_in', 'call_out', 'sms_in', 'sms_out', 'geolocation')),
  body text,
  params jsonb not null default '{}',
  file_id uuid,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(lead_id, contact_id, company_id) = 1),
  check (type <> 'attachment' or file_id is not null),
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references companies (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references files (workspace_id, id) on delete set null (file_id)
);
create index notes_lead_idx on notes (lead_id, created_at desc) where lead_id is not null;
create index notes_contact_idx on notes (contact_id, created_at desc) where contact_id is not null;
create index notes_company_idx on notes (company_id, created_at desc) where company_id is not null;

-- Yalnız eklenir. Etkinlik akışı, etkinlik günlüğü ve raporlar buradan okunur.
create table events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  type text not null,                          -- lead_added, lead_stage_changed, task_completed, incoming_chat_message ...
  lead_id uuid,
  contact_id uuid,
  company_id uuid,
  actor_kind text not null default 'user' check (actor_kind in ('user', 'bot', 'automation', 'integration', 'system')),
  actor_user_id uuid references profiles (id) on delete set null,
  value_before jsonb,
  value_after jsonb,
  created_at timestamptz not null default clock_timestamp(),
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, company_id) references companies (workspace_id, id) on delete cascade
);
create index events_lead_idx on events (lead_id, created_at desc) where lead_id is not null;
create index events_contact_idx on events (contact_id, created_at desc) where contact_id is not null;
create index events_company_idx on events (company_id, created_at desc) where company_id is not null;
create index events_report_idx on events (workspace_id, type, created_at desc);
create index events_actor_idx on events (workspace_id, actor_user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Mesajlaşma
-- ---------------------------------------------------------------------

create table chat_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null default 'general' check (kind in ('general', 'whatsapp')),
  name text not null check (length(name) between 1 and 120),
  body text not null,
  file_id uuid,
  buttons jsonb not null default '[]',
  wa_category text check (wa_category in ('marketing', 'utility')),
  wa_language text,
  wa_header text,
  wa_footer text,
  wa_status text check (wa_status in ('draft', 'pending', 'approved', 'rejected', 'paused')),
  wa_external_id text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (jsonb_typeof(buttons) = 'array' and jsonb_array_length(buttons) <= 3),
  check ((kind = 'whatsapp') = (wa_status is not null)),
  foreign key (workspace_id, file_id) references files (workspace_id, id) on delete set null (file_id)
);
create index chat_templates_workspace_idx on chat_templates (workspace_id, kind, name);

-- Bir kanal üzerindeki bir müşteriyle kalıcı yazışma. Kapanır, yeni mesajla yeniden açılır.
create table conversations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  channel_id uuid not null,
  contact_id uuid not null,
  lead_id uuid,                                -- konuşma başına en çok bir lead
  external_chat_id text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  assigned_user_id uuid,
  group_id uuid,
  unread_count int not null default 0 check (unread_count >= 0),
  last_message_at timestamptz,
  last_message_preview text,
  last_inbound_at timestamptz,                 -- WhatsApp 24 saat penceresi buradan hesaplanır
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  -- Aynı sohbet için ikinci konuşma açılamaz: tekrar gelen webhook'a karşı son savunma.
  unique (channel_id, external_chat_id),
  foreign key (workspace_id, channel_id) references channels (workspace_id, id) on delete no action,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete set null (lead_id),
  foreign key (workspace_id, assigned_user_id) references workspace_members (workspace_id, user_id) on delete set null (assigned_user_id),
  foreign key (workspace_id, group_id) references groups (workspace_id, id) on delete set null (group_id)
);
create index conversations_inbox_idx on conversations (workspace_id, status, last_message_at desc);
create index conversations_assigned_idx on conversations (workspace_id, assigned_user_id, last_message_at desc);
create index conversations_lead_idx on conversations (lead_id) where lead_id is not null;
create index conversations_contact_idx on conversations (contact_id);

create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  sender_kind text not null check (sender_kind in ('contact', 'user', 'bot', 'system')),
  sender_user_id uuid references profiles (id) on delete set null,
  type text not null default 'text' check (type in (
    'text', 'picture', 'video', 'file', 'voice', 'audio', 'sticker', 'location', 'contact', 'template')),
  body text,
  file_id uuid,
  payload jsonb not null default '{}',         -- konum, kartvizit, butonlar
  reply_to_id uuid references messages (id) on delete set null,
  template_id uuid,
  external_message_id text,                    -- kanalın verdiği kimlik
  client_token uuid,                           -- arayüzden gönderimde çift tıklama / yeniden deneme koruması
  status text not null check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  error_code text,
  error_text text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  check ((direction = 'in') = (sender_kind = 'contact')),
  check ((direction = 'in') = (status = 'received')),
  check (body is not null or file_id is not null or payload <> '{}'::jsonb),
  foreign key (workspace_id, conversation_id) references conversations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references files (workspace_id, id) on delete set null (file_id),
  foreign key (workspace_id, template_id) references chat_templates (workspace_id, id) on delete set null (template_id)
);
-- Aynı kanal mesajı iki kez kaydedilemez; aynı gönderim iki kez kuyruğa giremez.
create unique index messages_external_unique on messages (conversation_id, external_message_id) where external_message_id is not null;
create unique index messages_client_token_unique on messages (workspace_id, client_token) where client_token is not null;
create index messages_thread_idx on messages (conversation_id, created_at desc);
create index messages_outbox_idx on messages (created_at) where direction = 'out' and status = 'queued';

-- Ham gelen webhook'lar. Önce buraya yazılır, sonra işlenir. Yalnız sunucu erişir.
create table webhook_inbox (
  id uuid primary key default gen_random_uuid(),
  provider text not null,                      -- telegram, whatsapp, billing ...
  channel_id uuid references channels (id) on delete cascade,
  external_event_id text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text,
  unique nulls not distinct (provider, channel_id, external_event_id)
);
create index webhook_inbox_pending_idx on webhook_inbox (received_at) where processed_at is null;

create table team_chats (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('direct', 'group')),
  name text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (kind = 'direct' or name is not null)
);

create table team_chat_members (
  workspace_id uuid not null,
  chat_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (chat_id, user_id),
  foreign key (workspace_id, chat_id) references team_chats (workspace_id, id) on delete cascade,
  foreign key (workspace_id, user_id) references workspace_members (workspace_id, user_id) on delete cascade
);
create index team_chat_members_user_idx on team_chat_members (user_id);

create table team_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  chat_id uuid not null,
  sender_user_id uuid references profiles (id) on delete set null,
  body text not null,
  file_id uuid,
  conversation_id uuid,                        -- müşteri konuşmasından yapılan etiketleme
  created_at timestamptz not null default now(),
  foreign key (workspace_id, chat_id) references team_chats (workspace_id, id) on delete cascade,
  foreign key (workspace_id, file_id) references files (workspace_id, id) on delete set null (file_id),
  foreign key (workspace_id, conversation_id) references conversations (workspace_id, id) on delete set null (conversation_id)
);
create index team_messages_chat_idx on team_messages (chat_id, created_at desc);

-- ---------------------------------------------------------------------
-- Otomasyon ve botlar
-- ---------------------------------------------------------------------

create table bots (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  definition jsonb not null default '{"steps": []}',
  version int not null default 1,
  is_active boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index bots_workspace_idx on bots (workspace_id);

create table automations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  pipeline_id uuid not null,
  stage_id uuid not null,
  kind text not null check (kind in (
    'add_task', 'change_stage', 'change_responsible', 'change_field', 'edit_tags',
    'send_webhook', 'run_bot', 'send_template', 'send_email', 'create_lead', 'complete_tasks')),
  on_event text not null default 'stage_entered' check (on_event in (
    'stage_entered', 'lead_created', 'message_received', 'responsible_changed', 'no_reply')),
  conditions jsonb not null default '[]',
  delay_seconds int not null default 0 check (delay_seconds >= 0),
  active_hours jsonb,                          -- boşsa 7/24
  settings jsonb not null default '{}',          -- change_responsible: {"mode": "user" | "round_robin", "user_ids": [...]}
  rr_cursor bigint not null default 0,         -- sırayla dağıtımda sıradaki kişi; sunucu tek sorguda artırıp okur
  bot_id uuid,
  sort int not null default 0,
  is_active boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check ((kind = 'run_bot') = (bot_id is not null)),
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete cascade,
  foreign key (pipeline_id, stage_id) references stages (pipeline_id, id) on delete cascade,
  foreign key (workspace_id, bot_id) references bots (workspace_id, id) on delete no action
);
create index automations_stage_idx on automations (stage_id, on_event) where is_active;
create index automations_bot_idx on automations (bot_id) where bot_id is not null;

-- Yalnız sunucu erişir.
create table automation_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  automation_id uuid not null references automations (id) on delete cascade,
  lead_id uuid not null references leads (id) on delete cascade,
  dedupe_key text not null,                    -- tetikleyen olayın kimliği
  depth smallint not null default 0 check (depth between 0 and 5),   -- zincirleme tetiklenme sınırı
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'skipped')),
  run_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  -- Aynı olay aynı otomasyonu aynı lead için iki kez çalıştıramaz.
  unique (automation_id, lead_id, dedupe_key)
);
create index automation_runs_due_idx on automation_runs (run_at) where status = 'queued';
create index automation_runs_lead_idx on automation_runs (lead_id, created_at desc);

-- Yalnız sunucu erişir.
create table bot_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  bot_id uuid not null references bots (id) on delete cascade,
  conversation_id uuid not null references conversations (id) on delete cascade,
  lead_id uuid references leads (id) on delete set null,
  status text not null default 'running' check (status in ('running', 'waiting', 'finished', 'stopped', 'failed')),
  current_step text,
  state jsonb not null default '{}',
  resume_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
-- Konuşma başına tek aktif bot.
create unique index bot_runs_one_active on bot_runs (conversation_id) where status in ('running', 'waiting');
create index bot_runs_resume_idx on bot_runs (resume_at) where status = 'waiting';

-- ---------------------------------------------------------------------
-- Lead kaynakları, giden webhook'lar
-- ---------------------------------------------------------------------

create table webforms (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  pipeline_id uuid not null,
  stage_id uuid not null,
  fields jsonb not null default '[]',
  tag_id uuid,
  public_token text not null unique,
  is_active boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete cascade,
  foreign key (pipeline_id, stage_id) references stages (pipeline_id, id) on delete no action,
  foreign key (workspace_id, tag_id) references tags (workspace_id, id) on delete set null (tag_id)
);
create index webforms_workspace_idx on webforms (workspace_id);

-- Yalnız sunucu erişir.
create table webform_submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  webform_id uuid not null references webforms (id) on delete cascade,
  lead_id uuid references leads (id) on delete set null,
  payload jsonb not null,
  ip inet,
  referer text,
  created_at timestamptz not null default now()
);
create index webform_submissions_form_idx on webform_submissions (webform_id, created_at desc);

-- Dışarıdan lead alma kapısı. Google Sheets, reklam formu, Zapier/Make ya da müşterinin kendi sistemi
-- bu kapının adresine veri gönderir ve hedef aşamada lead oluşur. Kime atanacağı otomasyonla belirlenir
-- (lead_created olayı, change_responsible). Adresteki gizli anahtarın yalnız özeti saklanır.
create table lead_intakes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'generic' check (kind in ('generic', 'google_sheets')),
  -- Kaynağın katalogdaki adı (google_sheets, zapier, make ...). Veri biçimini kind belirler; bu yalnız
  -- ekranda hangi kaynağın kurulduğunu ve hangi kurulum yönergesinin gösterileceğini söyler.
  provider text not null default 'generic' check (provider ~ '^[a-z0-9_]{1,40}$'),
  pipeline_id uuid not null,
  stage_id uuid not null,
  mapping jsonb not null default '{}',         -- {gelen anahtar ya da sütun başlığı: hedef alan}
  tag_id uuid,
  token_hash text not null unique,
  is_active boolean not null default true,
  last_received_at timestamptz,
  last_error text,                             -- son reddedilen gönderimin nedeni; ekranda gösterilir
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, pipeline_id) references pipelines (workspace_id, id) on delete cascade,
  foreign key (pipeline_id, stage_id) references stages (pipeline_id, id) on delete no action,
  foreign key (workspace_id, tag_id) references tags (workspace_id, id) on delete set null (tag_id)
);
create index lead_intakes_workspace_idx on lead_intakes (workspace_id);
create index lead_intakes_pipeline_idx on lead_intakes (workspace_id, pipeline_id);
create index lead_intakes_stage_idx on lead_intakes (stage_id);
create index lead_intakes_tag_idx on lead_intakes (tag_id) where tag_id is not null;

-- Yalnız sunucu erişir. Aynı dış kayıt (ör. aynı tablo satırı) iki kez gelirse tek lead oluşur.
create table lead_intake_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  intake_id uuid not null references lead_intakes (id) on delete cascade,
  external_id text not null check (length(external_id) between 1 and 255),
  lead_id uuid references leads (id) on delete set null,
  payload jsonb not null,
  status text not null default 'received' check (status in ('received', 'created', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  unique (intake_id, external_id)
);
create index lead_intake_events_lead_idx on lead_intake_events (lead_id) where lead_id is not null;

-- Çalışma alanına bağlanan Google hesabı. Yalnız sunucu erişir. Yenileme anahtarı şifreli saklanır;
-- istenen tek izin kullanıcının seçtiği dosyalara erişimdir (drive.file).
create table google_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  google_sub text not null check (length(google_sub) between 1 and 255),
  email text not null check (length(email) between 3 and 254),
  refresh_token_enc text not null,
  scope text not null default '',
  status text not null default 'active' check (status in ('active', 'reconnect')),
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, google_sub)
);

-- Bir Google tablosunun bir sayfasını bir lead alma kapısına bağlar. Yalnız sunucu erişir.
-- last_row: lead'e çevrilen son satırın numarası (1 = başlık satırı). Kanal alanları Google'ın değişiklik
-- bildirimi (files.watch) içindir; bildirim yoksa tablo belirli aralıklarla yoklanır.
create table sheet_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  intake_id uuid not null unique references lead_intakes (id) on delete cascade,
  google_account_id uuid not null references google_accounts (id) on delete cascade,
  spreadsheet_id text not null check (length(spreadsheet_id) between 1 and 255),
  spreadsheet_name text not null check (length(spreadsheet_name) between 1 and 500),
  sheet_id bigint not null,
  sheet_title text not null check (length(sheet_title) between 1 and 255),
  last_row integer not null default 1 check (last_row >= 1),
  drive_version text,
  channel_id text unique,
  channel_resource_id text,
  channel_token_hash text,
  channel_expires_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sheet_links_workspace_idx on sheet_links (workspace_id);
create index sheet_links_account_idx on sheet_links (google_account_id);

create table webhooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  url text not null check (url ~ '^https://'),
  events text[] not null check (cardinality(events) > 0),
  secret_id uuid,                              -- imzalama anahtarı, Vault kaydı
  is_active boolean not null default true,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index webhooks_workspace_idx on webhooks (workspace_id) where is_active;

-- Yalnız sunucu erişir.
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  webhook_id uuid not null references webhooks (id) on delete cascade,
  event_id uuid references events (id) on delete set null,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'delivered', 'failed')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  response_code int,
  created_at timestamptz not null default now()
);
create index webhook_deliveries_due_idx on webhook_deliveries (next_attempt_at) where status = 'queued';

-- ---------------------------------------------------------------------
-- E-posta (3. dalga)
-- ---------------------------------------------------------------------

create table mailboxes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid,                                -- boşsa paylaşılan kutu
  address citext not null,
  provider text not null check (provider in ('imap', 'gmail', 'microsoft')),
  settings jsonb not null default '{}',        -- sunucu, port (gizli değer yok)
  credentials_secret_id uuid,
  status text not null default 'pending' check (status in ('pending', 'connected', 'error', 'disconnected')),
  sync_state jsonb not null default '{}',
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, address),
  foreign key (workspace_id, user_id) references workspace_members (workspace_id, user_id) on delete cascade
);

create table email_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  mailbox_id uuid not null,
  subject text not null default '',
  contact_id uuid,
  lead_id uuid,
  last_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, mailbox_id) references mailboxes (workspace_id, id) on delete cascade,
  foreign key (workspace_id, contact_id) references contacts (workspace_id, id) on delete set null (contact_id),
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete set null (lead_id)
);
create index email_threads_mailbox_idx on email_threads (mailbox_id, last_message_at desc);
create index email_threads_lead_idx on email_threads (lead_id) where lead_id is not null;
create index email_threads_contact_idx on email_threads (contact_id) where contact_id is not null;

create table emails (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  thread_id uuid not null,
  mailbox_id uuid not null,
  direction text not null check (direction in ('in', 'out')),
  message_id_header text not null,
  in_reply_to text,
  from_addr citext not null,
  to_addrs jsonb not null default '[]',
  cc_addrs jsonb not null default '[]',
  subject text not null default '',
  body_text text,
  body_html text,
  sender_user_id uuid references profiles (id) on delete set null,
  sent_at timestamptz not null,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, thread_id) references email_threads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, mailbox_id) references mailboxes (workspace_id, id) on delete cascade,
  unique (mailbox_id, message_id_header)       -- aynı e-posta iki kez eşitlenemez
);
create index emails_thread_idx on emails (thread_id, sent_at);

-- ---------------------------------------------------------------------
-- Kişisel: kayıtlı filtreler, bildirimler; arka plan işleri
-- ---------------------------------------------------------------------

create table saved_filters (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  user_id uuid,                                -- boşsa herkese açık
  entity_type text not null check (entity_type in ('lead', 'contact', 'company', 'task', 'conversation')),
  name text not null check (length(name) between 1 and 80),
  criteria jsonb not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references workspace_members (workspace_id, user_id) on delete cascade
);
create index saved_filters_idx on saved_filters (workspace_id, entity_type, user_id);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid not null,
  type text not null,
  title text not null,
  body text,
  lead_id uuid,
  conversation_id uuid,
  task_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (workspace_id, user_id) references workspace_members (workspace_id, user_id) on delete cascade,
  foreign key (workspace_id, lead_id) references leads (workspace_id, id) on delete cascade,
  foreign key (workspace_id, conversation_id) references conversations (workspace_id, id) on delete cascade,
  foreign key (workspace_id, task_id) references tasks (workspace_id, id) on delete cascade
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

-- İçe aktarma, dışa aktarma, toplu güncelleme, birleştirme.
create table data_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces (id) on delete cascade,
  kind text not null check (kind in ('import', 'export', 'bulk_update', 'merge')),
  entity_type text not null check (entity_type in ('lead', 'contact', 'company')),
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed', 'canceled')),
  params jsonb not null default '{}',
  total_rows int not null default 0 check (total_rows >= 0),
  processed_rows int not null default 0 check (processed_rows >= 0),
  failed_rows int not null default 0 check (failed_rows >= 0),
  source_file_id uuid,
  result_file_id uuid,
  error text,
  created_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, source_file_id) references files (workspace_id, id) on delete set null (source_file_id),
  foreign key (workspace_id, result_file_id) references files (workspace_id, id) on delete set null (result_file_id)
);
create index data_jobs_idx on data_jobs (workspace_id, created_at desc);

-- ---------------------------------------------------------------------
-- Yabancı anahtar destek dizinleri
-- Üst kayıt silinirken (özellikle çalışma alanı silinirken zincirleme)
-- alt tablonun baştan sona taranmasını önler.
-- Bilerek dizinlenmeyenler: created_by / updated_by / uploaded_by gibi
-- profiles'a giden denetim sütunları (kullanıcı silme nadirdir, arka plan işidir)
-- ve küçük yapılandırma tablolarına giden grup, rol, pipeline, kanal
-- referansları (bu üst kayıtlar nadiren silinir; tarama çalışma alanıyla sınırlı kalır).
-- ---------------------------------------------------------------------
create index leads_stage_idx on leads (stage_id);
create index leads_group_idx on leads (workspace_id, group_id);
create index leads_source_idx on leads (workspace_id, source_id) where source_id is not null;
create index leads_loss_reason_idx on leads (workspace_id, loss_reason_id) where loss_reason_id is not null;
create index automations_pipeline_idx on automations (pipeline_id);
create index bot_runs_bot_idx on bot_runs (bot_id);
create index bot_runs_lead_idx on bot_runs (lead_id) where lead_id is not null;
create index webform_submissions_lead_idx on webform_submissions (lead_id) where lead_id is not null;
create index webforms_stage_idx on webforms (stage_id);
create index webforms_tag_idx on webforms (tag_id) where tag_id is not null;
create index webhook_deliveries_webhook_idx on webhook_deliveries (webhook_id, created_at desc);
create index webhook_deliveries_event_idx on webhook_deliveries (event_id) where event_id is not null;
create index webhook_inbox_channel_idx on webhook_inbox (channel_id) where channel_id is not null;
create index notifications_lead_idx on notifications (lead_id) where lead_id is not null;
create index notifications_conversation_idx on notifications (conversation_id) where conversation_id is not null;
create index notifications_task_idx on notifications (task_id) where task_id is not null;
create index messages_reply_idx on messages (reply_to_id) where reply_to_id is not null;
create index messages_file_idx on messages (file_id) where file_id is not null;
create index messages_template_idx on messages (template_id) where template_id is not null;
create index notes_file_idx on notes (file_id) where file_id is not null;
create index chat_templates_file_idx on chat_templates (file_id) where file_id is not null;
create index team_messages_file_idx on team_messages (file_id) where file_id is not null;
create index team_messages_conversation_idx on team_messages (conversation_id) where conversation_id is not null;
create index data_jobs_source_file_idx on data_jobs (source_file_id) where source_file_id is not null;
create index data_jobs_result_file_idx on data_jobs (result_file_id) where result_file_id is not null;

-- =====================================================================
-- İşlevler ve tetikleyiciler
-- =====================================================================

create or replace function app.set_updated_at() returns trigger
language plpgsql as $$
begin
  -- Yalnız türetilmiş kopyalar (grup: group_id, çalışma alanının para birimi: currency) değiştiyse kayıt
  -- "güncellenmiş" sayılmaz: bir üyenin grubu ya da çalışma alanının para birimi değişince kayıtların sırası
  -- ve "son güncelleme" zamanı bozulmamalı.
  if tg_op = 'UPDATE' and to_jsonb(new) - array['group_id', 'currency'] = to_jsonb(old) - array['group_id', 'currency'] then
    return new;
  end if;
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  for t in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name
    where c.table_schema = 'public' and c.column_name = 'updated_at' and tb.table_type = 'BASE TABLE'
  loop
    execute format('create trigger set_updated_at before update on %I for each row execute function app.set_updated_at()', t);
  end loop;
end $$;

-- Yeni kayıt olan kullanıcıya profil açar.
create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---- Yetki yardımcıları (RLS bunları çağırır) ------------------------

create or replace function app.is_member(ws uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.is_active
  );
$$;

create or replace function app.is_admin(ws uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.is_active and m.is_admin
  );
$$;

create or replace function app.my_group(ws uuid) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select m.group_id from workspace_members m
  where m.workspace_id = ws and m.user_id = auth.uid() and m.is_active;
$$;

-- 'all' | 'group' | 'own' | 'none'; üye değilse null.
create or replace function app.view_scope(ws uuid, entity text) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when m.is_admin then 'all'
    else coalesce((case when m.role_id is not null then r.rights else m.rights end) -> entity ->> 'view', 'none')
  end
  from workspace_members m
  left join roles r on r.id = m.role_id
  where m.workspace_id = ws and m.user_id = auth.uid() and m.is_active;
$$;

-- Sorumlusu olmayan kayıt ortak havuzdur: kapsamı 'none' olmayan herkes görür.
create or replace function app.can_view(ws uuid, entity text, responsible uuid, grp uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    case app.view_scope(ws, entity)
      when 'all' then true
      when 'group' then responsible is null or responsible = auth.uid() or (grp is not null and grp = app.my_group(ws))
      when 'own' then responsible is null or responsible = auth.uid()
      else false
    end,
    false);
$$;

-- ---- Grup kopyası -----------------------------------------------------
-- Kayıtlardaki group_id, sorumlunun grubunun kopyasıdır ("grubunun kayıtları" kapsamı satır başına
-- alt sorgu yapmadan denetlenebilsin diye). Sorumlu değişince ve üyenin grubu değişince güncellenir.
create or replace function app.sync_group_from_responsible() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.group_id := (select m.group_id from workspace_members m
                   where m.workspace_id = new.workspace_id and m.user_id = new.responsible_user_id);
  return new;
end $$;

create or replace function app.sync_group_from_assignee() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  new.group_id := (select m.group_id from workspace_members m
                   where m.workspace_id = new.workspace_id and m.user_id = new.assigned_user_id);
  return new;
end $$;

create trigger leads_sync_group before insert or update of responsible_user_id on leads
  for each row execute function app.sync_group_from_responsible();
create trigger contacts_sync_group before insert or update of responsible_user_id on contacts
  for each row execute function app.sync_group_from_responsible();
create trigger companies_sync_group before insert or update of responsible_user_id on companies
  for each row execute function app.sync_group_from_responsible();
create trigger tasks_sync_group before insert or update of responsible_user_id on tasks
  for each row execute function app.sync_group_from_responsible();
create trigger conversations_sync_group before insert or update of assigned_user_id on conversations
  for each row execute function app.sync_group_from_assignee();

create or replace function app.member_group_changed() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.group_id is distinct from old.group_id then
    update leads set group_id = new.group_id where workspace_id = new.workspace_id and responsible_user_id = new.user_id;
    update contacts set group_id = new.group_id where workspace_id = new.workspace_id and responsible_user_id = new.user_id;
    update companies set group_id = new.group_id where workspace_id = new.workspace_id and responsible_user_id = new.user_id;
    update tasks set group_id = new.group_id where workspace_id = new.workspace_id and responsible_user_id = new.user_id;
    update conversations set group_id = new.group_id where workspace_id = new.workspace_id and assigned_user_id = new.user_id;
  end if;
  return null;
end $$;
create trigger workspace_members_group_changed after update of group_id on workspace_members
  for each row execute function app.member_group_changed();

-- ---- Son yönetici ------------------------------------------------------
-- Çalışma alanında her zaman en az bir etkin yönetici kalır; yoksa kimse ayarları değiştiremez.
create or replace function app.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from workspaces w where w.id = old.workspace_id)
     and not exists (select 1 from workspace_members m where m.workspace_id = old.workspace_id and m.is_admin and m.is_active) then
    raise exception 'last_admin' using errcode = 'check_violation';
  end if;
  return null;
end $$;
create constraint trigger workspace_members_keep_admin after update of is_admin, is_active or delete on workspace_members
  deferrable initially immediate for each row execute function app.keep_one_admin();

-- ---- Limitler ve sistem aşamaları ------------------------------------

create or replace function app.enforce_pipeline_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from pipelines where workspace_id = new.workspace_id) >= 50 then
    raise exception 'pipeline_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger pipelines_limit before insert on pipelines
  for each row execute function app.enforce_pipeline_limit();

create or replace function app.enforce_stage_limit() returns trigger
language plpgsql as $$
begin
  if (select count(*) from stages where pipeline_id = new.pipeline_id) >= 100 then
    raise exception 'stage_limit_reached' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger stages_limit before insert on stages
  for each row execute function app.enforce_stage_limit();

create or replace function app.protect_system_stage() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.kind is distinct from old.kind or new.pipeline_id is distinct from old.pipeline_id then
      raise exception 'stage_kind_is_fixed' using errcode = 'check_violation';
    end if;
    return new;
  end if;
  -- DELETE: sistem aşaması yalnız pipeline'ıyla birlikte silinir.
  if old.kind <> 'open' and exists (select 1 from pipelines p where p.id = old.pipeline_id) then
    raise exception 'system_stage_cannot_be_deleted' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger stages_protect before update or delete on stages
  for each row execute function app.protect_system_stage();

create or replace function app.protect_main_pipeline() returns trigger
language plpgsql as $$
begin
  if old.is_main and exists (select 1 from workspaces w where w.id = old.workspace_id) then
    raise exception 'main_pipeline_cannot_be_deleted' using errcode = 'check_violation';
  end if;
  return old;
end $$;
create trigger pipelines_protect_main before delete on pipelines
  for each row execute function app.protect_main_pipeline();

-- ---- Lead: aşama değişimi ---------------------------------------------

create or replace function app.leads_stage_sync() returns trigger
language plpgsql as $$
declare k text;
begin
  if tg_op = 'UPDATE' and new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  select s.kind into k from stages s where s.id = new.stage_id;
  if tg_op = 'UPDATE' then
    new.stage_entered_at := now();
  end if;
  if k in ('won', 'lost') then
    new.closed_at := coalesce(new.closed_at, now());
  else
    new.closed_at := null;
  end if;
  if k <> 'lost' then
    new.loss_reason_id := null;
  end if;
  if k <> 'incoming' then
    new.incoming_category := null;
  end if;
  return new;
end $$;
create trigger leads_stage_sync before insert or update of stage_id, pipeline_id on leads
  for each row execute function app.leads_stage_sync();

-- ---- Görevler: en yakın görev tarihi ----------------------------------

create or replace function app.recalc_closest_task(p_lead uuid, p_contact uuid, p_company uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_lead is not null then
    update leads set closest_task_at =
      (select min(t.due_at) from tasks t where t.lead_id = p_lead and t.completed_at is null)
    where id = p_lead;
  elsif p_contact is not null then
    update contacts set closest_task_at =
      (select min(t.due_at) from tasks t where t.contact_id = p_contact and t.completed_at is null)
    where id = p_contact;
  elsif p_company is not null then
    update companies set closest_task_at =
      (select min(t.due_at) from tasks t where t.company_id = p_company and t.completed_at is null)
    where id = p_company;
  end if;
end $$;

create or replace function app.tasks_touch_parent() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform app.recalc_closest_task(new.lead_id, new.contact_id, new.company_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform app.recalc_closest_task(old.lead_id, old.contact_id, old.company_id);
  end if;
  return null;
end $$;
create trigger tasks_touch_parent after insert or delete or update of due_at, completed_at, lead_id, contact_id, company_id on tasks
  for each row execute function app.tasks_touch_parent();

-- ---- Mesajlar: konuşma özetini güncelle -------------------------------

create or replace function app.messages_touch_conversation() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_lead uuid;
begin
  update conversations c set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.body, '[' || new.type || ']'), 140),
    last_inbound_at = case when new.direction = 'in' then new.created_at else c.last_inbound_at end,
    unread_count = case when new.direction = 'in' then c.unread_count + 1 else c.unread_count end,
    status = case when new.direction = 'in' then 'open' else c.status end,
    closed_at = case when new.direction = 'in' then null else c.closed_at end
  where c.id = new.conversation_id
  returning c.lead_id into v_lead;

  if v_lead is not null then
    update leads set last_message_at = new.created_at where id = v_lead;
  end if;
  return null;
end $$;
create trigger messages_touch_conversation after insert on messages
  for each row execute function app.messages_touch_conversation();

-- ---- Çalışma alanı kurulumu -------------------------------------------
-- Kayıt sonrası tek çağrı: çalışma alanı + yönetici üyelik + ana pipeline
-- (gelen, açık aşamalar, kazanıldı, kaybedildi) + görev türleri + deneme aboneliği.
create or replace function app.create_workspace(
  p_name text,
  p_slug text,
  p_stage_names text[] default array['First contact', 'Discussion', 'Proposal'],
  p_task_type_names text[] default array['Follow-up', 'Meeting']
) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_ws uuid;
  v_pipeline uuid;
  i int;
  palette smallint[] := array[1, 2, 3, 5, 7];
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = 'insufficient_privilege';
  end if;
  if coalesce(cardinality(p_stage_names), 0) = 0 or coalesce(cardinality(p_task_type_names), 0) = 0 then
    raise exception 'stage_and_task_type_names_required' using errcode = 'check_violation';
  end if;

  insert into workspaces (name, slug, created_by) values (p_name, p_slug, v_user) returning id into v_ws;
  insert into workspace_members (workspace_id, user_id, is_admin) values (v_ws, v_user, true);
  insert into subscriptions (workspace_id, trial_ends_at) values (v_ws, now() + interval '14 days');

  insert into pipelines (workspace_id, name, is_main) values (v_ws, 'Sales', true) returning id into v_pipeline;
  insert into stages (workspace_id, pipeline_id, name, sort, kind, color)
    values (v_ws, v_pipeline, 'Incoming', 10, 'incoming', 8);
  for i in 1 .. cardinality(p_stage_names) loop
    insert into stages (workspace_id, pipeline_id, name, sort, kind, color)
      values (v_ws, v_pipeline, p_stage_names[i], 10 + i * 10, 'open', palette[1 + (i - 1) % cardinality(palette)]);
  end loop;
  insert into stages (workspace_id, pipeline_id, name, sort, kind, color) values
    (v_ws, v_pipeline, 'Won', 10000, 'won', 4),
    (v_ws, v_pipeline, 'Lost', 11000, 'lost', 6);

  for i in 1 .. cardinality(p_task_type_names) loop
    insert into task_types (workspace_id, name, is_system, sort) values (v_ws, p_task_type_names[i], true, i * 10);
  end loop;

  insert into sources (workspace_id, kind, name, pipeline_id) values (v_ws, 'manual', 'Manual', v_pipeline);
  return v_ws;
end $$;

-- =====================================================================
-- Satır düzeyi güvenlik (RLS)
-- =====================================================================

grant usage on schema app to authenticated, service_role;

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- profiles: kendisi ve aynı çalışma alanını paylaştığı kişiler.
create policy profiles_select on profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from workspace_members me
    join workspace_members other on other.workspace_id = me.workspace_id
    where me.user_id = (select auth.uid()) and me.is_active and other.user_id = profiles.id
  )
);
create policy profiles_update on profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces: üye okur, yönetici günceller. Oluşturma yalnız app.create_workspace ile.
create policy workspaces_select on workspaces for select to authenticated using (app.is_member(id));
create policy workspaces_update on workspaces for update to authenticated
  using (app.is_admin(id)) with check (app.is_admin(id));

-- A sınıfı: yapılandırma tabloları. Üye okur, yönetici yazar.
do $$
declare t text;
begin
  foreach t in array array[
    'groups', 'roles', 'workspace_members', 'pipelines', 'stages', 'loss_reasons',
    'custom_fields', 'custom_field_options', 'custom_field_stage_rules', 'task_types',
    'channels', 'sources', 'chat_templates', 'bots', 'automations', 'webforms', 'lead_intakes', 'webhooks'
  ] loop
    execute format('create policy %I on %I for select to authenticated using (app.is_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (app.is_admin(workspace_id))', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (app.is_admin(workspace_id)) with check (app.is_admin(workspace_id))', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (app.is_admin(workspace_id))', t || '_delete', t);
  end loop;
end $$;

-- Yalnız yönetici: davetler. Abonelik: üye okur, yazma yalnız sunucudan.
create policy invitations_admin on invitations for all to authenticated
  using (app.is_admin(workspace_id)) with check (app.is_admin(workspace_id));
create policy subscriptions_select on subscriptions for select to authenticated using (app.is_member(workspace_id));

-- B sınıfı: kiracı düzeyi. Üye okur ve yazar (ayrıntılı yetki veri katmanında).
do $$
declare t text;
begin
  foreach t in array array['tags', 'taggings', 'contact_handles', 'lead_contacts', 'files'] loop
    execute format('create policy %I on %I for select to authenticated using (app.is_member(workspace_id))', t || '_select', t);
    execute format('create policy %I on %I for insert to authenticated with check (app.is_member(workspace_id))', t || '_insert', t);
    execute format('create policy %I on %I for update to authenticated using (app.is_member(workspace_id)) with check (app.is_member(workspace_id))', t || '_update', t);
    execute format('create policy %I on %I for delete to authenticated using (app.is_member(workspace_id))', t || '_delete', t);
  end loop;
end $$;

-- C sınıfı: görüntüleme kapsamı olan kayıtlar (yok / sorumlu olduğu / grubu / tümü).
create policy leads_select on leads for select to authenticated
  using (app.can_view(workspace_id, 'leads', responsible_user_id, group_id));
create policy leads_insert on leads for insert to authenticated
  with check (app.is_member(workspace_id));
create policy leads_update on leads for update to authenticated
  using (app.can_view(workspace_id, 'leads', responsible_user_id, group_id))
  with check (app.is_member(workspace_id));
create policy leads_delete on leads for delete to authenticated
  using (app.is_admin(workspace_id));

create policy contacts_select on contacts for select to authenticated
  using (app.can_view(workspace_id, 'contacts', responsible_user_id, group_id));
create policy contacts_insert on contacts for insert to authenticated
  with check (app.is_member(workspace_id));
create policy contacts_update on contacts for update to authenticated
  using (app.can_view(workspace_id, 'contacts', responsible_user_id, group_id))
  with check (app.is_member(workspace_id));
create policy contacts_delete on contacts for delete to authenticated
  using (app.is_admin(workspace_id));

create policy companies_select on companies for select to authenticated
  using (app.can_view(workspace_id, 'companies', responsible_user_id, group_id));
create policy companies_insert on companies for insert to authenticated
  with check (app.is_member(workspace_id));
create policy companies_update on companies for update to authenticated
  using (app.can_view(workspace_id, 'companies', responsible_user_id, group_id))
  with check (app.is_member(workspace_id));
create policy companies_delete on companies for delete to authenticated
  using (app.is_admin(workspace_id));

create policy tasks_select on tasks for select to authenticated
  using (app.can_view(workspace_id, 'tasks', responsible_user_id, group_id));
create policy tasks_insert on tasks for insert to authenticated
  with check (app.is_member(workspace_id));
create policy tasks_update on tasks for update to authenticated
  using (app.can_view(workspace_id, 'tasks', responsible_user_id, group_id))
  with check (app.is_member(workspace_id));
create policy tasks_delete on tasks for delete to authenticated
  using (app.can_view(workspace_id, 'tasks', responsible_user_id, group_id));

create policy conversations_select on conversations for select to authenticated
  using (app.can_view(workspace_id, 'inbox', assigned_user_id, group_id));
create policy conversations_update on conversations for update to authenticated
  using (app.can_view(workspace_id, 'inbox', assigned_user_id, group_id))
  with check (app.is_member(workspace_id));

-- Mesajlar konuşmanın görünürlüğünü izler (alt sorguda conversations RLS'i uygulanır).
create policy messages_select on messages for select to authenticated using (
  exists (select 1 from conversations c where c.id = messages.conversation_id)
);
create policy messages_insert on messages for insert to authenticated with check (
  direction = 'out' and sender_kind = 'user' and sender_user_id = (select auth.uid()) and status = 'queued'
  and exists (select 1 from conversations c where c.id = messages.conversation_id and c.workspace_id = messages.workspace_id)
);

-- Notlar ve olaylar üst kaydın görünürlüğünü izler.
create policy notes_select on notes for select to authenticated using (
  (lead_id is not null and exists (select 1 from leads l where l.id = notes.lead_id))
  or (contact_id is not null and exists (select 1 from contacts c where c.id = notes.contact_id))
  or (company_id is not null and exists (select 1 from companies c where c.id = notes.company_id))
);
create policy notes_insert on notes for insert to authenticated
  with check (app.is_member(workspace_id) and created_by = (select auth.uid()));
create policy notes_update on notes for update to authenticated
  using (created_by = (select auth.uid()) or app.is_admin(workspace_id))
  with check (app.is_member(workspace_id));
create policy notes_delete on notes for delete to authenticated
  using (created_by = (select auth.uid()) or app.is_admin(workspace_id));

create policy events_select on events for select to authenticated using (
  (lead_id is not null and exists (select 1 from leads l where l.id = events.lead_id))
  or (contact_id is not null and exists (select 1 from contacts c where c.id = events.contact_id))
  or (company_id is not null and exists (select 1 from companies c where c.id = events.company_id))
  or (num_nonnulls(lead_id, contact_id, company_id) = 0 and app.is_admin(workspace_id))
);

-- Ekip sohbeti: yalnız üyesi olduğu sohbetler.
create or replace function app.in_team_chat(p_chat uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from team_chat_members m where m.chat_id = p_chat and m.user_id = auth.uid());
$$;
create policy team_chats_select on team_chats for select to authenticated
  using (app.is_member(workspace_id) and (app.in_team_chat(id) or created_by = (select auth.uid())));
create policy team_chats_insert on team_chats for insert to authenticated
  with check (app.is_member(workspace_id) and created_by = (select auth.uid()));
create policy team_chat_members_select on team_chat_members for select to authenticated
  using (app.in_team_chat(chat_id));
create policy team_messages_select on team_messages for select to authenticated
  using (app.in_team_chat(chat_id));
create policy team_messages_insert on team_messages for insert to authenticated
  with check (app.in_team_chat(chat_id) and sender_user_id = (select auth.uid()));

-- E-posta: paylaşılan kutu ya da kendi kutusu.
create policy mailboxes_select on mailboxes for select to authenticated
  using (app.is_member(workspace_id) and (user_id is null or user_id = (select auth.uid())));
create policy mailboxes_write on mailboxes for all to authenticated
  using (app.is_admin(workspace_id) or user_id = (select auth.uid()))
  with check (app.is_admin(workspace_id) or (app.is_member(workspace_id) and user_id = (select auth.uid())));
create policy email_threads_select on email_threads for select to authenticated
  using (exists (select 1 from mailboxes m where m.id = email_threads.mailbox_id));
create policy emails_select on emails for select to authenticated
  using (exists (select 1 from mailboxes m where m.id = emails.mailbox_id));

-- Kişisel tablolar.
create policy saved_filters_select on saved_filters for select to authenticated
  using (app.is_member(workspace_id) and (user_id is null or user_id = (select auth.uid())));
create policy saved_filters_write on saved_filters for all to authenticated
  using (user_id = (select auth.uid()) or (user_id is null and app.is_admin(workspace_id)))
  with check (app.is_member(workspace_id) and (user_id = (select auth.uid()) or (user_id is null and app.is_admin(workspace_id))));

create policy notifications_select on notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_update on notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy data_jobs_select on data_jobs for select to authenticated
  using (app.is_member(workspace_id) and (created_by = (select auth.uid()) or app.is_admin(workspace_id)));

-- Politikası olmayan tablolar yalnız sunucudan (service_role) erişilir:
--   webhook_inbox, automation_runs, bot_runs, webform_submissions, lead_intake_events, webhook_deliveries
-- Ayrıca şu yazmalar yalnız sunucudan yapılır: conversations insert, events insert,
-- gelen messages, subscriptions, notifications insert, data_jobs insert/update,
-- team_chat_members, email_threads, emails.
