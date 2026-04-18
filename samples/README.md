# Sample Plans

Three pre-built sample plans demonstrating different client scenarios across the
full strategy library. Each is a JSON snapshot compatible with the
**Upload JSON** button on https://pyle-planning.vercel.app/.

## How to load a sample

1. Open https://pyle-planning.vercel.app/ and sign in as Team.
2. Click the **Upload JSON** button in the Cloud Plans bar.
3. Pick one of the JSON files in this folder.
4. The builder auto-fills. Click **Generate Plan** to view the rendered plan.

Alternatively, each file is served statically by Vercel:
- https://pyle-planning.vercel.app/samples/01-harrison-grand-tour.json
- https://pyle-planning.vercel.app/samples/02-chen-real-estate.json
- https://pyle-planning.vercel.app/samples/03-okonkwo-service-sstb.json

## The three samples

### 1. Harrison Family — Grand Tour (all 13 strategies)
**Mark & Sarah Harrison · Austin, TX · 2026**

A full-liquidity-event scenario exercising every strategy in the library.
- $75M C-Corp sale (8 years held → **QSBS eligible**)
- Pre-sale NW: $90M · Other assets: $15M
- Annual business income: $3.5M
- Texas resident (no state tax)
- Every strategy enabled: Dynasty, CRAT, DAF, QOZ, ILIT, Roth, GRAT, QSBS, 1031, QBI, SLAT, IDGT, QPRT

**Expected plan output (hand-verified):**

| Line item | Amount |
|---|---:|
| Gross capital gain | $74.8M |
| No-planning CG tax | $17.80M |
| Full-stack residual gain | $34.80M |
| Full-stack CG tax | $8.28M |
| CG tax savings | $9.52M |
| Income tax savings (charitable) | $3.40M |
| Dynasty estate save | $10.00M |
| ILIT estate save | $6.00M |
| SLAT estate save | $4.00M |
| IDGT estate save | $2.05M |
| QPRT estate save (mortality-weighted) | $0.99M |
| §1202 QSBS exclusion | $2.38M |
| §1031 tax deferred | $0.60M |
| §199A QBI savings | $0.19M |
| **TOTAL IMMEDIATE TAX BENEFIT** | **~$45.53M** |
| AMT liability | $0 (no exposure) |
| Budget verdict | ✓ Sustainable at 1.16% required dist |

### 2. Chen Family — Real Estate Repositioning
**David & Mei Chen · San Diego, CA · 2026**

No business sale. Focus on multi-property real estate repositioning and
intergenerational transfer for a California HNW family.
- $50M NW, mostly rental/commercial RE
- 1031 exchange ($10M property → $10M replacement, $1M basis)
- QPRT on secondary/vacation home ($5M, 12-year term, age 60)
- SLAT funded at $8M
- DAF $3M for bunching charitable deductions
- California state (13.3%, does NOT conform to §1202 — doesn't matter here since no business sale)

Strategies: **1031, QPRT, SLAT, DAF**

### 3. Okonkwo Family — Dual-Professional Household
**Dr. Kenechi & Dr. Adaeze Okonkwo · Boston, MA · 2026**

Annual planning for a cardiologist + tax attorney — both operating
Specified Service Trades or Businesses. Demonstrates SSTB QBI phase-out
and annual income tax optimization without a liquidity event.
- $12M NW
- $1.8M household income
- SSTB flagged → **QBI benefit expected to be zero** (phased out above upper threshold)
- Roth conversion $500K (locking in today's high marginal rate before TCJA sunset)
- $5M term-life ILIT
- DAF $200K for bunching
- Massachusetts state (9%, $50K AMT preference items → likely AMT exposure)

Strategies: **QBI (SSTB), Roth, ILIT, DAF**

## Regenerating these samples

The samples are produced by a local Python script (not committed — it's a
build-time artifact). To regenerate or create new samples, edit any existing
file directly or copy it as a starting point. The JSON shape must match what
`snapshotForm()` produces in `index.html`:

```json
{
  "exportedAt": "2026-04-18T00:00:00Z",
  "appVersion": "pyle-plan-builder-v1",
  "plan": {
    "values": { "client-primary": "Mark Harrison", /* all form IDs as strings */ },
    "checkboxes": { "use-dynasty": true, /* all use-* flags */ },
    "firmLogo": null,
    "schemaVersion": 1
  }
}
```
