# CRM Uploader

A simple internal tool to upload customer CRM data (CSV) into Supabase and
export a filtered slice back out as CSV. Built with Next.js (App Router) and
protected by a single shared password.

## What it does

- **Upload**: pick a customer (organisation), choose a CSV, and select which
  column holds the date (`dd/mm/yyyy`). Rows are stored in Supabase. Re-uploading
  a customer's CSV **appends** new rows (each upload is tracked separately).
- **Export**: pick a customer, a date range, and optionally a column/value
  filter, then download the matching rows as a CSV.
- Every column and value from the original CSV is preserved (stored as JSONB),
  so the data stays faithful for later mapping against PropFocus.

## How it works

| Piece | Where |
| --- | --- |
| Shared-password gate | `proxy.ts` (HTTP Basic Auth) |
| DB access (secret key, bypasses RLS) | `lib/supabaseAdmin.ts` |
| Date parsing (`dd/mm/yyyy` → ISO) | `lib/parseDMY.ts` |
| API routes | `app/api/{organisations,headers,upload,export}` |
| UI (one page) | `app/page.tsx` |
| Database schema | `supabase/schema.sql` |

## Setup

### 1. Create the database tables

In the Supabase dashboard, open **SQL Editor → New query**, paste the contents
of [`supabase/schema.sql`](supabase/schema.sql), and run it.

### 2. Configure environment variables

```bash
cp .env.local.example .env.local
```

Fill in:

- `SUPABASE_URL` – your project URL.
- `SUPABASE_SECRET_KEY` – a secret key (`sb_secret_...`) from
  **Project Settings → API Keys**. This is server-only and bypasses RLS.
- `APP_USERNAME` / `APP_PASSWORD` – the shared login for the app.

### 3. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000. The browser will prompt for the username/password
you set above.

## Deploy

### Option A — Vercel + your Cloudflare domain (recommended)

1. Push this repo to GitHub.
2. In [Vercel](https://vercel.com), **Add New → Project** and import the repo.
3. Add the four environment variables (`SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
   `APP_USERNAME`, `APP_PASSWORD`) in **Settings → Environment Variables**.
4. Deploy. Vercel gives you a `*.vercel.app` URL.
5. Point your domain in Cloudflare: add a subdomain (e.g. `crm.n8npropfocus.com`)
   as a **CNAME** to your Vercel deployment (Vercel shows the exact target under
   **Settings → Domains** when you add the custom domain there). Set the
   Cloudflare record to **DNS only** (grey cloud) first to let Vercel verify,
   then you can re-enable the proxy if desired.

### Option B — fully on Cloudflare

Host a static build on Cloudflare Pages and move the upload/export logic into
Supabase Edge Functions (the secret key is auto-injected there). More setup;
only needed if you want everything under Cloudflare.

## Notes & assumptions

- Dates must be `dd/mm/yyyy`. Data is assumed to be cleaned before upload; rows
  with an unrecognised date are still stored, just without a filterable date.
- The date-range filter runs in the database (indexed); the optional
  column/value match is applied in the server after fetching the ranged rows,
  so arbitrary CSV header names (spaces, symbols) work reliably.
- Very large files: uploads run through a serverless function, so extremely
  large CSVs may hit platform body-size/timeout limits. For big datasets, move
  ingestion to a Supabase Edge Function reading from Supabase Storage.
- **Security**: keep `SUPABASE_SECRET_KEY` server-side only. If a secret key is
  ever exposed, rotate it in the Supabase dashboard.
