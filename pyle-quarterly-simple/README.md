# Pyle Quarterly Simple

A reusable, single-file HTML template for client Quarterly Investment Reviews.
Each quarter is a self-contained HTML file driven by an inline `QIR_DATA`
object — edit the data, charts and tables auto-render.

## Folder layout

```
pyle-quarterly-simple/
├── qir-template.html        ← the master template (don't edit; copy it)
├── README.md                ← this file
└── clients/                 ← LOCAL ONLY (gitignored — never pushed to GitHub/Vercel)
    └── <Client Name>/
        ├── qir-<slug>-q1-2026.html
        ├── qir-<slug>-q2-2026.html
        └── …                ← one file per quarter, kept indefinitely
```

Quarter-over-quarter history = the list of files in each client's folder.

> **Privacy note:** the `clients/` directory is excluded from git. Real client
> quarterly reviews stay on your local machine and are NOT deployed to Vercel.
> Only the empty template ships publicly.

## Creating a new quarterly review

1. **Copy the template** into the client's folder:
   ```
   cp qir-template.html clients/<ClientName>/qir-<slug>-q2-2026.html
   ```
2. **Open the new file** in a text editor.
3. **Find the `QIR_DATA` block** near the top of the `<script>` (look for the
   row of `▼▼▼` arrows). Edit the values inline.
4. **Save → open in a browser.** Charts, tables, KPIs all render from the
   data object.
5. **Print to PDF** (Cmd-P → "Save as PDF") for the client deliverable. Print
   styles are tuned for letter portrait.

## Data object — what each field controls

### Top-level
| field | purpose |
|---|---|
| `client` | Client name shown in header |
| `quarter` | e.g. `"Q2 2026"` |
| `asOfDate` | e.g. `"June 30, 2026"` |
| `currency` | Display string only (`"USD"`) |
| `firmFooter` | Header sub-line + footer text |

### `investments[]` — one entry per holding (1–8 typical)
| field | required | purpose |
|---|---|---|
| `name` | ✅ | Investment name |
| `icon` | | Emoji shown next to name |
| `subtitle` | | Smaller descriptor under name |
| `assetClass` | ✅ | One of: `"Private"`, `"Public Equities"`, `"Public"`, `"Alternatives"` — drives badge color and chart color |
| `costBasis` | ✅ | Dollars |
| `currentValue` | ✅ | Dollars |
| `entryDate` / `inceptionDate` | | Display only |
| `shares` / `entryPrice` / `currentPrice` | | Public-equity style metrics |
| `tvpi` / `irr` | | Private-investment metrics |
| `annualizedIRR` | | Used for cash-balance / DB plans |
| `distributions` / `pendingDistributions` / `pendingDate` | | Alternatives — adds a third bar to cost-vs-value chart |
| `taxAdjustedReturnPct` / `annualizedReturnPct` | | Override return display (e.g. for tax-advantaged alternatives) |
| `currentPriceFootnote` | | Adds a `*` and footnote under the card |
| `footer` | | Free-text footnote at bottom of card |
| `benchmark` | | `"above"` / `"inline"` / `"below"` — auto-derived from return if omitted |

### `taxCallout` (opt-in)
Generic callout box. Set `enabled: true` to show. `items[]` is a list of
`{ label, value, color }` chips concatenated with `·` separators.

### `performance` (opt-in)
- `showReturnChart: true` — horizontal bar of return-by-investment.
- `economicBenefit: { enabled, title, slices[] }` — donut with custom slices
  (e.g. for an alternative investment, splitting distributions / tax benefit /
  net cost remaining).

### `lifeInsurance` (opt-in)
Set `enabled: true` to show the Cash Balance Life Insurance section. Add
one entry per insured to `policies[]`.

## Sections inherited from QIR_Dashboard_Q1_2026.html

✅ Header + total portfolio badge
✅ KPIs (Portfolio at a Glance)
✅ Allocation donut + Cost-vs-Value bar
✅ Investment detail cards (variable count)
✅ Tax-benefit callout (now opt-in)
✅ Portfolio Summary table
✅ Return-by-investment chart (now opt-in)
✅ Economic Benefit donut (now opt-in)
✅ Cash Balance Life Insurance (now opt-in)
❌ ~~Distribution-routing entity section~~ — removed from this generic template
   (the original Q1 2026 dashboard had a section for distributions routed
   through a specific LLC; that's a per-client detail, not a template feature)

## Tips

- **Variable holdings:** charts and tables scale to however many investments
  you list. Tested at 1–8.
- **Auto totals:** total portfolio value, total cost, gain, return %, and
  "above benchmark" count are all computed — don't enter them manually.
- **Asset class colors:** Private = gold, Public Equities = blue,
  Alternatives = purple, Public = red. Color the donut & summary table.
- **Want to track a new metric?** Add it to the `investments[]` schema and
  update `renderInvestmentCard()` in the template.
