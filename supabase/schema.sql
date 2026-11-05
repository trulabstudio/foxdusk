-- Foxdusk AIOS sales: orders, licence keys, and activated computers.
-- Run once in Supabase: Dashboard > SQL Editor > New query > paste > Run.
-- Safe to run again.
--
-- Row Level Security is on with no policies, so the public (anon) key can read
-- or write nothing. Only the Vercel API, using the secret service key, can.

create table if not exists public.orders (
  id            uuid primary key default gen_random_uuid(),
  order_no      text not null unique,
  name          text not null,
  email         text not null,
  phone         text,
  amount_rm     numeric(10, 2) not null,
  receipt_path  text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note          text,
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    text,
  email_sent_at timestamptz
);
create index if not exists orders_status_created on public.orders (status, created_at desc);
create index if not exists orders_email on public.orders (lower(email));

create table if not exists public.licenses (
  key         text primary key,
  order_id    uuid references public.orders (id) on delete set null,
  name        text,
  email       text not null,
  status      text not null default 'active' check (status in ('active', 'revoked')),
  max_devices integer not null default 2 check (max_devices between 1 and 20),
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);
create index if not exists licenses_order on public.licenses (order_id);
create index if not exists licenses_email on public.licenses (lower(email));

create table if not exists public.activations (
  id          bigint generated always as identity primary key,
  license_key text not null references public.licenses (key) on delete cascade,
  device_id   text not null,
  device_name text,
  app_version text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (license_key, device_id)
);

alter table public.orders      enable row level security;
alter table public.licenses    enable row level security;
alter table public.activations enable row level security;

-- Private bucket for payment receipts (images or PDF, up to 3 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 3145728, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Foxdusk AIOS download: the zip lives in a private bucket. Each licence gets its
-- own download token; /api/download checks the licence is still active, then
-- hands out a link that expires in a few minutes. Safe to run again.
alter table public.licenses add column if not exists download_token text unique;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('downloads', 'downloads', false, 52428800, array['application/zip', 'application/x-zip-compressed', 'application/octet-stream'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Shop settings the admin can change at foxdusk.com/admin > Settings:
-- price, whether new orders are accepted, and the bank details buyers pay to.
-- One row only (id = 1). Safe to run again; existing values are kept.
create table if not exists public.settings (
  id           integer primary key default 1 check (id = 1),
  sales_open   boolean not null default true,
  price_rm     numeric(10, 2) not null default 299 check (price_rm >= 0 and price_rm <= 100000),
  bank_name    text,
  account_name text,
  account_no   text,
  duitnow_qr   text,
  updated_at   timestamptz not null default now(),
  updated_by   text
);
alter table public.settings enable row level security;
insert into public.settings (id, sales_open, price_rm, bank_name, account_name, account_no)
values (1, true, 299, 'Maybank', 'TRULAB STUDIO', '5147 6742 0283')
on conflict (id) do nothing;

-- Card and FPX payments through Stripe (switched on in admin > Settings).
-- A Stripe order waits as "awaiting_payment" until Stripe confirms it, then it
-- is approved and the key is emailed automatically. Safe to run again.
alter table public.settings add column if not exists stripe_enabled boolean not null default false;
alter table public.orders add column if not exists payment_method text not null default 'bank_transfer';
alter table public.orders add column if not exists stripe_session_id text unique;
alter table public.orders add column if not exists stripe_payment_intent text;
alter table public.orders alter column receipt_path drop not null;
alter table public.orders drop constraint if exists orders_status_check;
alter table public.orders add constraint orders_status_check
  check (status in ('pending', 'approved', 'rejected', 'awaiting_payment', 'expired'));

-- Contact details shown on the website (admin > Settings > Contact). Safe to run again.
alter table public.settings add column if not exists whatsapp text;
alter table public.settings add column if not exists contact_email text;
alter table public.settings add column if not exists whatsapp_message text;
update public.settings set whatsapp = coalesce(whatsapp, '60176982032'), contact_email = coalesce(contact_email, 'admin@foxdusk.com'),
  whatsapp_message = coalesce(whatsapp_message, 'Hi Foxdusk, I have a question about Foxdusk AIOS:') where id = 1;

-- Public images for the website (DuitNow QR), uploaded from admin > Settings.
-- Public on purpose: buyers' browsers load the QR straight from here. Safe to run again.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Hookdusk AIOS, a second product, sold alone or in a bundle with Foxdusk AIOS.
-- Each order is for one product ("foxdusk", "hookdusk" or "bundle"); each
-- licence lists the apps its key unlocks. Safe to run again.
alter table public.orders add column if not exists product text not null default 'foxdusk';
alter table public.orders drop constraint if exists orders_product_check;
alter table public.orders add constraint orders_product_check check (product in ('foxdusk', 'hookdusk', 'bundle'));

-- Licences sold before Hookdusk existed unlock both apps. This grant runs only
-- the first time, when the column is created, so later Foxdusk-only keys stay Foxdusk-only.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'licenses' and column_name = 'products') then
    alter table public.licenses add column products text[] not null default '{foxdusk}';
    update public.licenses set products = '{foxdusk,hookdusk}';
  end if;
end $$;
alter table public.licenses drop constraint if exists licenses_products_check;
alter table public.licenses add constraint licenses_products_check
  check (cardinality(products) > 0 and products <@ array['foxdusk', 'hookdusk']::text[]);

alter table public.settings add column if not exists price_hookdusk_rm numeric(10, 2) not null default 299 check (price_hookdusk_rm >= 0 and price_hookdusk_rm <= 100000);
alter table public.settings add column if not exists price_bundle_rm numeric(10, 2) not null default 399 check (price_bundle_rm >= 0 and price_bundle_rm <= 100000);

-- Upgrades: a buyer with one app adds the other to the SAME key. The order
-- names the key in upgrade_key; once paid, the app is added to that licence.
-- Price = bundle price minus the price of the app they already have. Safe to run again.
alter table public.orders add column if not exists upgrade_key text;
alter table public.orders drop constraint if exists orders_product_check;
alter table public.orders add constraint orders_product_check
  check (product in ('foxdusk', 'hookdusk', 'bundle', 'upgrade_hookdusk', 'upgrade_foxdusk'));
alter table public.orders drop constraint if exists orders_upgrade_check;
alter table public.orders add constraint orders_upgrade_check
  check (product not in ('upgrade_hookdusk', 'upgrade_foxdusk') or upgrade_key is not null);
create index if not exists orders_upgrade_key on public.orders (upgrade_key) where upgrade_key is not null;
