# Pyle Plan Builder

A static single-page app for building and sharing comprehensive financial plans.
Originally a single HTML file — now wired up to **Supabase** (save / load / share
plans via URL) and deployable on **Vercel** from a **GitHub** repo.

> **No auth yet.** Anyone with the site URL can read/write plans. See
> [Security next steps](#security-next-steps) before storing real client data.

---

## Stack

- **Frontend:** vanilla HTML / CSS / JS + Chart.js (CDN)
- **Database:** Supabase (Postgres + PostgREST) — stores plan JSON
- **Hosting:** Vercel static site
- **Source:** GitHub

No build step. No framework. Edit the HTML, push, Vercel deploys.

---

## Project layout

```
Pyle-Plan-builder/
├── index.html            # the app (builder + plan view + all logic)
├── config.js             # <-- edit: Supabase URL + anon key
├── vercel.json           # static-site headers + clean URLs
├── supabase/
│   └── schema.sql        # run once in Supabase SQL editor
├── .gitignore
└── README.md
```

---

## 1. Set up Supabase

1. Create a free project at <https://supabase.com>.
2. Open **SQL Editor**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and run it.
   This creates a `plans` table with permissive RLS policies (anon read/write).
3. Go to **Project Settings → API** and copy:
   - **Project URL** (`https://xxxxx.supabase.co`)
   - **anon / public** key

4. Open [`config.js`](config.js) and paste those values in:

   ```js
   window.__PYLE_CONFIG__ = {
     SUPABASE_URL: 'https://xxxxx.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...',
     TABLE_NAME: 'plans'
   };
   ```

   The anon key is safe to commit — it only has the permissions the RLS
   policies grant it. (Right now that's everything; see
   [Security next steps](#security-next-steps).)

---

## 2. Run locally

Any static file server works. Two easy options:

```bash
# Python
python3 -m http.server 5173

# Node
npx serve .
```

Open <http://localhost:5173>. You should see "Connected" in the green status
indicator at the top of the builder. If you see "Cloud disabled", re-check
`config.js`.

---

## 3. Push to GitHub

```bash
cd Pyle-Plan-builder
git init
git add .
git commit -m "Initial commit: Pyle Plan Builder"
gh repo create Pyle-Plan-builder --public --source=. --push
# or use the GitHub web UI
```

---

## 4. Deploy to Vercel

**Option A — Vercel dashboard (easiest):**

1. Go to <https://vercel.com/new>, import the GitHub repo.
2. Framework preset: **Other** (it's static).
3. Build command: leave empty. Output directory: leave empty.
4. Deploy.

**Option B — CLI:**

```bash
npm i -g vercel
vercel
vercel --prod
```

Vercel will serve `index.html` at the root. The Supabase URL + anon key are
baked into `config.js` and shipped to the browser (which is fine — they're
public by design).

---

## How save / load / share works

Three buttons at the top of the builder:

- **Save to Cloud** — writes the current form state (all inputs +
  checkboxes + uploaded firm logo as data URI) as a single JSON blob in
  the `plans` table, and stamps `?id=...` onto the URL.
- **Load** — pick a saved plan from the dropdown.
- **Copy Share Link** — copies `…/?id=...&view=plan` to the clipboard.
  Opening that URL auto-loads the plan and jumps straight to the
  generated plan view (skipping the builder).

The "Copy Share Link" button on the plan view does the same thing.

---

## Security next steps

Before putting real client PII in here, at minimum:

1. **Add auth.** Turn on Supabase Auth (magic link or Google SSO is easy).
   Add an `owner_id uuid references auth.users` column on `plans` and
   scope the RLS policies to `owner_id = auth.uid()`.
2. **Replace the anon policies.** The SQL in `supabase/schema.sql` grants
   every anon visitor full CRUD — that's an MVP convenience, not a
   production posture.
3. **Consider a separate share-token mechanism** — a `share_token uuid`
   column per plan so a "share link" grants read-only access to one plan
   without exposing the whole table.
4. **Disclaimer copy** is legal/compliance boilerplate — have your firm's
   counsel review it before external distribution.

---

## Extending

- **More strategies:** add form fields in `index.html` (section 3), then
  extend `readForm()`, `computePlan()`, and the relevant `render*()`
  function. The snapshot logic in the cloud script picks up new IDs
  automatically if you add them to the `ids` / `checks` arrays in the
  `snapshotForm()` function.
- **Firm branding:** change the CSS variables at the top of the `<style>`
  block (cream/gold/crimson palette). Logo upload is already wired.
- **PDF export:** the Print button uses `window.print()`. For
  server-rendered PDFs, add a Vercel serverless function that uses
  Puppeteer to render `/?id=...&view=plan&print=1`.
