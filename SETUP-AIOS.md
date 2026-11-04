# Setup jualan Foxdusk AIOS

Sistem ni: pembeli transfer → isi borang + upload resit di **foxdusk.com** →
kau semak di **foxdusk.com/admin** → klik **Confirm & send key** → pembeli terima
email dengan link muat turun peribadi + license key → Foxdusk Studio minta key masa
pertama kali dibuka.

Fail ni tak di-deploy ke website (ada dalam `.vercelignore`).

---

## 1. Supabase (database, resit, login admin)

1. Buka https://supabase.com → **New project**. Region: **Southeast Asia (Singapore)**.
2. **SQL Editor → New query** → paste seluruh isi `supabase/schema.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**:
   - Pastikan Email provider **ON**.
   - **Matikan "Allow new users to sign up"** (penting: hanya kau boleh login).
4. **Authentication → Users → Add user → Create new user**:
   - Email: `admin@foxdusk.com` (atau email kau), password yang kuat.
   - Tandakan **Auto Confirm User**.
5. **Project Settings → API Keys** (atau **API**), salin:
   - Project URL → `SUPABASE_URL`
   - `anon` / publishable key → `SUPABASE_ANON_KEY`
   - `service_role` / secret key → `SUPABASE_SERVICE_ROLE_KEY` (**rahsia**, jangan letak dalam kod)

## 2. Resend (hantar email dari admin@foxdusk.com)

1. Daftar di https://resend.com.
2. **Domains → Add domain** → `foxdusk.com`.
3. Resend akan beri beberapa rekod DNS (MX/TXT/DKIM). Tambah semua rekod tu di
   tempat kau urus DNS foxdusk.com (contohnya Vercel Domains, Cloudflare, atau
   pendaftar domain). Tunggu status **Verified**.
4. **API Keys → Create API key** (permission: Sending access) → `RESEND_API_KEY`.

Resend hanya *menghantar*. Kalau pembeli balas email, balasan pergi ke peti
`admin@foxdusk.com`, jadi pastikan peti tu wujud dan kau semak.

## 3. Zip dalam Supabase Storage

Zip disimpan dalam bucket **peribadi** `downloads`. Setiap pembeli dapat link
sendiri dalam email key (`foxdusk.com/api/download?t=…`). Link tu hanya
berfungsi selagi lesen mereka aktif. Bila kau klik **Cancel key**, link tu pun mati.

Upload atau ganti zip (dari folder FOXDUSK):

```bash
node tools/upload-zip.mjs
```

Tool ni ambil `FOXDUSK AIOS/releases/Foxdusk-AIOS.zip`, upload ke Supabase
(ganti versi lama), dan sahkan muat turun berfungsi. Untuk versi baru: jalankan
`npm run release` dalam FOXDUSK AIOS, kemudian arahan di atas. Semua pembeli
terus dapat versi terbaru melalui link yang sama.

## 4. Vercel (Environment Variables)

Vercel → projek foxdusk → **Settings → Environment Variables**. Tambah untuk
**Production** (dan Preview kalau nak uji):

| Nama | Nilai |
| --- | --- |
| `SUPABASE_URL` | dari langkah 1 |
| `SUPABASE_ANON_KEY` | dari langkah 1 |
| `SUPABASE_SERVICE_ROLE_KEY` | dari langkah 1 (rahsia) |
| `RESEND_API_KEY` | dari langkah 2 (rahsia) |
| `MAIL_FROM` | `Foxdusk AIOS <orders@admin.foxdusk.com>` (mesti guna domain yang Verified di Resend) |
| `MAIL_REPLY_TO` | `admin@foxdusk.com` |
| `ADMIN_EMAILS` | email admin yang boleh login, pisahkan dengan koma |
| `ADMIN_NOTIFY_EMAIL` | email yang terima notifikasi pesanan baru |
| `LICENSE_PRIVATE_KEY` | **seluruh isi** fail `.secrets/license-private.pem` (termasuk baris BEGIN/END) |
| `TURNSTILE_SECRET_KEY` | Secret key Turnstile dari langkah 4b (rahsia). Kosongkan untuk matikan |
| `TURNSTILE_SITE_KEY` | Site key Turnstile (awam) |
| `TURNSTILE_HOSTNAMES` | `www.foxdusk.com,foxdusk.com` |
| `STRIPE_SECRET_KEY` | Pilihan, langkah 4c. Kosongkan sehingga kau nak terima kad/FPX |
| `STRIPE_WEBHOOK_SECRET` | Pilihan, langkah 4c |

### 4c. Stripe: kad dan FPX (pilihan, boleh hidup/matikan)

Bila dihidupkan, pembeli boleh pilih **Card / FPX** dan bayar di halaman Stripe.
Selepas Stripe sahkan bayaran, pesanan **diluluskan sendiri** dan key dihantar
automatik. Bank transfer kekal ada.

1. Daftar / log masuk https://dashboard.stripe.com (akaun Malaysia, mata wang MYR).
   Hidupkan kaedah bayaran yang kau nak (Card, FPX) di **Settings → Payment methods**.
2. **Developers → API keys** → salin **Secret key** → `STRIPE_SECRET_KEY`.
   Mula dengan `sk_test_…` untuk uji, tukar ke `sk_live_…` bila nak jual sebenar.
3. **Developers → Webhooks → Add endpoint**:
   - URL: `https://www.foxdusk.com/api/stripe-webhook`
   - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
     `checkout.session.async_payment_failed`, `checkout.session.expired`
   - Salin **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.
4. Masukkan kedua-dua dalam `.env.local` dan Vercel, kemudian Redeploy.
5. **Admin → Settings → Card and FPX (Stripe)** → hidupkan suis → **Save**.
   Label "Test keys" atau "Live keys" menunjukkan key mana yang digunakan.
6. Uji dengan key test: kad `4242 4242 4242 4242`, tarikh masa depan, CVC apa-apa.
   Pesanan patut jadi **Paid** sendiri dan email key sampai.

Untuk matikan: tutup suis yang sama di admin. Tak perlu buang key.

### 4b. Cloudflare Turnstile (sekat bot pada borang order)

1. Log masuk https://dash.cloudflare.com → **Turnstile** → **Add widget**.
2. Widget name: `Foxdusk AIOS order`. Hostnames: tambah `foxdusk.com` dan
   `www.foxdusk.com` (dan `localhost` kalau nak uji di komputer).
3. Widget mode: **Managed** (Cloudflare tunjuk kotak tanda hanya bila perlu).
4. Klik **Create**. Cloudflare beri dua key:
   - **Site key** (awam): letak dalam `aios.json` sebagai `"turnstile_site_key"`.
   - **Secret key** (rahsia): letak dalam `.env.local` dan Vercel sebagai `TURNSTILE_SECRET_KEY`.
5. Redeploy. Widget muncul di atas butang **Send order**, dan server tolak
   pesanan tanpa pengesahan Turnstile yang sah.

Domain kau tak perlu diuruskan oleh Cloudflare untuk guna Turnstile. Pelan
percuma: sampai 20 widget, 10 hostname setiap widget, tanpa had pengesahan.

### Kunci lesen (`.secrets/license-private.pem`) — sangat penting

- Kunci ni yang menandatangani setiap lesen. Public key yang sepadan dah
  dimasukkan dalam Foxdusk Studio (`studio/license.mjs`).
- **Simpan salinan** di tempat selamat (contohnya password manager). Kalau hilang,
  semua Studio yang dah dijual tak boleh refresh lesen dan kau terpaksa keluarkan
  versi baru dengan kunci baru.
- **Jangan** commit, kongsi, atau letak dalam zip. Folder `.secrets/` dah dalam
  `.gitignore` dan `.vercelignore`.

## 5. Harga dan butiran bank

Edit `aios.json`:

```json
"price_rm": 199,
"bank": { "name": "Maybank", "account_name": "TRULAB PRODUCTION SDN. BHD.", "account_no": "5123 4567 8901" },
"duitnow_qr": "icons/duitnow-qr.png"
```

- Selagi `price_rm` ialah `0`, borang ditutup ("Sales open soon").
- QR DuitNow pilihan: letak gambar dalam `icons/` dan isi path-nya.

## 6. Deploy

Commit dan push ke GitHub (`main`). Vercel deploy sendiri.

## 7. Uji sebelum umum

1. Buka `https://www.foxdusk.com/admin` → login.
2. Klik **Free licence** → isi nama dan email kau → dapat key untuk diri sendiri.
3. Buka Foxdusk Studio kau sendiri → masukkan key tu → patut aktif.
4. Buat satu pesanan ujian di foxdusk.com dengan resit apa-apa → semak email
   "Pesanan diterima" sampai → di admin, klik **Reject** (supaya tiada key keluar)
   atau **Confirm** untuk uji email key.
5. Semak folder spam. Kalau email masuk spam, pastikan DNS Resend dah Verified.

## Kerja harian

- Email "Pesanan baru" masuk → semak bank → buka `/admin` → **Receipt** → **Confirm & send key**.
- Pembeli tukar komputer dan tak dapat aktifkan → **Reset computers**.
- Key dikongsi/dijual semula → **Cancel key** (berkesan dalam masa ~1 hari bila
  komputer tu online, paling lama 14 hari).
- Email pembeli tak sampai → **Resend email**.
