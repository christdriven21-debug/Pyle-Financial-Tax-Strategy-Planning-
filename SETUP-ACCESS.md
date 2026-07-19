# Setup: giving Claude access to run the activation steps

## Read this first — the honest tradeoff

Right now this machine has **none** of the needed tools installed (no Homebrew,
Node, git CLI helpers, psql, Vercel, or Supabase CLI). So "let Claude do it"
isn't free — you'd install ~4 tools and generate ~3 secrets first.

For the specific Phase A steps, here's the real math:

| Step | Do it yourself | Set up so Claude does it |
|---|---|---|
| 2, 3, 8, 9, 11 (run SQL) | Paste 2 files into the Supabase **web** SQL editor — ~3 min | Install psql + share a DB connection string — ~15 min |
| 4 (Vercel env var) | One field in the Vercel dashboard — ~1 min | Install Vercel CLI + login |
| 10 (disable signup) | One toggle in the Supabase dashboard — ~30 sec | Management API token |
| 7 (merge & deploy) | `git merge` + push, or the GitHub web UI | `gh auth login` |

**My recommendation:** the SQL and dashboard steps (2–4, 8–11) are just a few
copy-pastes and clicks — doing them yourself is genuinely *faster and safer*
than handing me your production-database credentials. Where I add real leverage
is **code and merges**, not clicking your dashboards.

So the minimal, worthwhile setup is just **Section 1 (git push)** — then I can
manage the branch, merge, and deploy, while you do the ~5 minutes of
dashboard/SQL clicks. Sections 2–4 are here only if you'd rather delegate those
too.

Everything below must be run in an **interactive terminal** (`claude` in this
repo). Logins and OAuth cannot happen in a background/non-interactive session.

---

## Prerequisite: Homebrew (needed for any tool install)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
# then follow the "Next steps" it prints to add brew to your PATH
```

---

## Section 1 — git push access (recommended; lets me merge & deploy)

The repo already points at `origin`
(`github.com/christdriven21-debug/Pyle-Financial-Tax-Strategy-Planning-`).

```bash
brew install gh
gh auth login          # choose GitHub.com → HTTPS → login in browser
```

Once this is done I can, on your say-so: push the `phase-a-critical-fixes`
branch, open a PR, and after your browser test, merge to `main` (Vercel
auto-deploys). **I will confirm with you before merging or deploying** — I won't
push to production silently.

---

## Section 2 — Supabase SQL access (optional; only if you want me running the SQL)

1. Supabase Dashboard → your project → **Settings → Database → Connection
   string → URI**. Copy the **Session pooler** URI. Replace `[YOUR-PASSWORD]`
   with your database password.
2. Put it in a local, git-ignored file (`.env.local` is already gitignored):
   ```bash
   echo 'SUPABASE_DB_URL="postgresql://...paste the full URI..."' >> .env.local
   ```
3. Install the Postgres client:
   ```bash
   brew install libpq && brew link --force libpq   # provides psql
   ```

Then in an interactive session I can run, showing you each result:
```bash
set -a; source .env.local; set +a
psql "$SUPABASE_DB_URL" -f supabase/add_rate_limits.sql
psql "$SUPABASE_DB_URL" -f supabase/security_hardening.sql
psql "$SUPABASE_DB_URL" -c "select policyname from pg_policies where schemaname='public' and tablename='plans' and policyname like 'anon_%';"
```
(That last line is the safety check — it must return **zero rows**.)

⚠️ That connection string is a **production-database secret with client PII**.
Keep it only in `.env.local`. I'll use it solely to run the reviewed `.sql`
files above and will confirm before each write.

---

## Section 3 — Vercel access (optional; for the env var + deploy)

```bash
brew install vercel-cli      # or: npm i -g vercel
vercel login
vercel link                  # link this folder to the Pyle project
```
Then I can set the key (you paste the value when prompted):
```bash
vercel env add SUPABASE_SERVICE_ROLE_KEY production
```
Get the value from Supabase → Settings → API → `service_role` key.

---

## Section 4 — Node (optional; CI already runs the tests on push)

The GitHub Action I added runs `npm test` automatically on every push, so you
don't strictly need this. To also run tests locally:
```bash
brew install node@20
npm test
```

---

## How to hand it to me

1. Do **Section 1** (and optionally 2–4).
2. In this repo folder, run `claude` to start an interactive session.
3. Say: **"Run the Phase A activation from PHASE-A-CHECKLIST.md — do the steps
   you have access for, confirm before anything irreversible."**

I'll then execute what your access allows (merge/deploy, and the SQL/env if you
set those up), pausing for your OK before running production SQL or deploying,
and showing you every result. The browser test (step 6) and counsel sign-off
(step 12) stay with you.
