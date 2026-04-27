// Vercel serverless: extract structured fields from a Form 1040 tax return
// or a Schedule K-1 partnership statement using Claude vision.
//
// Input  (JSON body):
//   { docType: '1040' | 'k1', fileBase64: '<base64>', fileMediaType: 'application/pdf' | 'image/png' | 'image/jpeg' }
// Output (JSON):
//   { ok: true, docType, extracted: {...field map...}, usage }
//
// Privacy:
//   - Claude is instructed NOT to return SSN, EIN beyond last-4, or addresses.
//   - The endpoint never logs file contents. Only field counts + token usage.
//   - Requires authenticated Supabase session via the standard requireUser
//     helper, so unauthenticated callers cannot burn API credits.

import { requireUser } from './_lib/auth.js';

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 2048;

// Vercel default body limit is 1mb; tax docs (especially scanned PDFs) are
// often 2-8MB. Bump to 10MB. Anything larger should be compressed first.
export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } },
};

const FORM_1040_PROMPT = `You extract financial fields from a US Form 1040 tax return. Read the attached document and return a SINGLE JSON object with the schema below. If a field isn't visible, return null. Do NOT invent values. Do NOT include the taxpayer's SSN, address, phone, or any other personally-identifying information beyond their full name and filing status.

Schema (return JSON only, no commentary, no markdown fences):

{
  "plan_year": <integer, e.g. 2024>,
  "taxpayer_name": "<primary taxpayer full name from page 1, OR null>",
  "spouse_name": "<spouse full name if MFJ, else null>",
  "filing_status": "<single | mfj | mfs | hoh | qw>",
  "income": {
    "wages": <Form 1040 Line 1z, total wages>,
    "interest_taxable": <Line 2b>,
    "interest_tax_exempt": <Line 2a>,
    "ordinary_dividends": <Line 3b>,
    "qualified_dividends": <Line 3a>,
    "ira_distributions_taxable": <Line 4b>,
    "pensions_taxable": <Line 5b>,
    "social_security_taxable": <Line 6b>,
    "capital_gain_loss": <Line 7>,
    "schedule_1_additional": <Line 8 — additional income from Sch 1>,
    "total_income": <Line 9>
  },
  "adjustments": <Line 10 — adjustments to income>,
  "agi": <Line 11>,
  "standard_deduction": <Line 12>,
  "qbi_deduction": <Line 13 — §199A QBI deduction>,
  "taxable_income": <Line 15>,
  "tax_before_credits": <Line 16>,
  "credits": <Line 21>,
  "other_taxes": <Line 23>,
  "total_tax": <Line 24>,
  "total_payments": <Line 33>,
  "schedule_a_charitable": <Schedule A — gifts to charity, if visible>,
  "schedule_a_state_local_tax": <Schedule A — SALT, if visible>,
  "estimated_payments": <if visible>,
  "notes": ["<any anomalies or things you couldn't read>"]
}

Numeric fields must be plain integers (no commas, no currency symbols, no quotes). Negative numbers as -1234. Missing fields as null.`;

const K1_PROMPT = `You extract financial fields from a Schedule K-1 (Form 1065 partnership, Form 1120-S S-corp, or Form 1041 trust). Read the attached K-1 and return a SINGLE JSON object with the schema below. If a field isn't visible, return null. Do NOT invent values. Do NOT include the partner's SSN, full address, or any other personally-identifying information. Mask the partnership EIN to last-4 only.

Schema (return JSON only, no commentary):

{
  "k1_year": <tax year>,
  "k1_form_type": "<1065 | 1120S | 1041>",
  "partnership_name": "<name>",
  "partnership_ein_last4": "<XX-XXX-####, last 4 digits only>",
  "partner_name": "<partner name from Part II>",
  "ownership_pct_profit": <Part II Line J — profit %>,
  "ownership_pct_loss": <Part II Line J — loss %>,
  "ownership_pct_capital": <Part II Line J — capital %>,
  "boxes": {
    "1_ordinary_business_income": <Box 1>,
    "2_net_rental_real_estate_income": <Box 2>,
    "3_other_net_rental_income": <Box 3>,
    "4_guaranteed_payments_services": <Box 4a>,
    "4_guaranteed_payments_capital": <Box 4b>,
    "5_interest_income": <Box 5>,
    "6a_ordinary_dividends": <Box 6a>,
    "6b_qualified_dividends": <Box 6b>,
    "6c_dividend_equivalents": <Box 6c>,
    "7_royalties": <Box 7>,
    "8_net_short_term_capital_gain": <Box 8>,
    "9a_net_long_term_capital_gain": <Box 9a>,
    "9b_collectibles_28pct_gain": <Box 9b>,
    "9c_unrecaptured_1250_gain": <Box 9c>,
    "10_net_section_1231_gain": <Box 10>,
    "11_other_income_loss": <Box 11>,
    "12_section_179_deduction": <Box 12>,
    "13_other_deductions": <Box 13>,
    "14_self_employment_earnings": <Box 14 line A>,
    "15_credits": <Box 15>,
    "16_foreign_transactions": <Box 16, if any>,
    "17_amt_items": <Box 17>,
    "18_tax_exempt_income": <Box 18>,
    "19_distributions": <Box 19>,
    "20_other_information": <Box 20, if any>
  },
  "section_199A_qbi": {
    "qbi": <STMT — qualified business income for §199A>,
    "w2_wages": <STMT — W-2 wages of the trade or business>,
    "ubia_qualified_property": <STMT — unadjusted basis of qualified property>
  },
  "capital_account": {
    "beginning": <Item L — beginning capital account>,
    "contributions": <Item L — capital contributed>,
    "current_year_increase_decrease": <Item L — current year>,
    "withdrawals_distributions": <Item L — withdrawals/distributions>,
    "ending": <Item L — ending capital account>
  },
  "notes": ["<any flags or things you couldn't read>"]
}

Numeric fields as plain integers (no commas, no $, no quotes). Negative as -1234. Missing as null.`;

const CLIENT_DOC_PROMPT = `You are a financial-planning assistant extracting client-profile data from any of these document types: Net Worth Statement, balance sheet, fact-finder, prior advisor's plan summary, account statement summary, hand-drafted client profile.

Read the attached document and return a SINGLE JSON object with the schema below. If a field isn't visible, return null. Do NOT invent values. Do NOT include the client's SSN, full street address, phone, email, or full account numbers (last-4 only, if relevant).

Schema (return JSON only, no commentary, no markdown fences):

{
  "as_of_date": "<date the statement was prepared, YYYY-MM-DD>",
  "client_primary_name": "<full name of primary client>",
  "client_spouse_name": "<full name of spouse, or null>",
  "client_location": "<City, State only — no full address>",
  "client_state": "<2-letter state abbreviation>",
  "client_primary_age": <integer>,
  "client_spouse_age": <integer>,

  "net_worth": {
    "total_assets": <total of all assets>,
    "total_liabilities": <total of all liabilities>,
    "net_worth": <total assets - total liabilities>
  },

  "assets": {
    "cash_and_equivalents": <bank accounts + money market>,
    "investment_accounts": <taxable brokerage + non-retirement>,
    "retirement_traditional": <IRA + 401(k) traditional>,
    "retirement_roth": <Roth IRA + Roth 401(k)>,
    "retirement_hsa": <HSA balance>,
    "real_estate_primary": <primary residence FMV>,
    "real_estate_other": <vacation + investment properties>,
    "business_interests": <closely-held business equity value>,
    "personal_property": <art + jewelry + vehicles + collectibles>,
    "life_insurance_cash_value": <cash value, NOT death benefit>,
    "other_assets": <anything not above>
  },

  "liabilities": {
    "mortgage_primary": <primary residence mortgage>,
    "mortgage_other": <other property mortgages>,
    "margin_loans": <brokerage margin balance>,
    "other_debt": <credit cards, lines of credit, personal loans>
  },

  "income": {
    "annual_salary_wages": <gross W-2 wages>,
    "business_income": <K-1 / S-corp distributions>,
    "investment_income": <dividends + interest annual>,
    "rental_income": <annual gross from rentals>,
    "social_security": <annual SS benefit>,
    "pension": <annual pension>,
    "agi": <if visible>
  },

  "insurance": {
    "life_insurance_death_benefit_total": <combined DB across all policies>,
    "long_term_care": <true if covered>
  },

  "business": {
    "business_name": "<entity name if mentioned>",
    "entity_type": "<S-Corp | C-Corp | LLC | Partnership | Sole Prop | null>",
    "ownership_pct": <percent ownership>,
    "annual_revenue": <if mentioned>,
    "ebitda": <if mentioned>,
    "expected_sale_price": <if mentioned>,
    "tax_basis": <if mentioned>
  },

  "family": [
    {"name": "<full name>", "year": <birth year>, "relationship": "<son|daughter|grandson|granddaughter|spouse|other>"}
  ],

  "goals": [
    {"name": "<goal description>", "amount": <dollar amount>, "year": <target year>, "priority": "<must|important|aspirational>", "category": "<retirement|education|legacy|lifestyle|philanthropy|major_purchase>"}
  ],

  "notes": ["<anything flagged or unclear>"]
}

Numeric fields as plain integers (no commas, no $, no quotes). Missing as null. For arrays (family, goals, notes): empty array [] if nothing extractable.`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await requireUser(req, res);
  if (!user) return;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: 'Tax extraction requires ANTHROPIC_API_KEY on this Vercel deployment.',
      code: 'no_api_key',
    });
  }

  const { docType, fileBase64, fileMediaType } = req.body || {};
  if (!fileBase64 || !docType) {
    return res.status(400).json({ error: 'Missing docType or fileBase64' });
  }
  if (!['1040', 'k1', 'client'].includes(docType)) {
    return res.status(400).json({ error: 'docType must be "1040", "k1", or "client"' });
  }
  // Validate base64 size — base64 is ~33% larger than raw bytes
  if (fileBase64.length > 14_000_000) {
    return res.status(413).json({
      error: 'File too large. PDFs must be under ~10MB. Compress with Preview > Export, or split multi-year docs.',
    });
  }

  const systemPrompt = docType === '1040' ? FORM_1040_PROMPT
                     : docType === 'k1'   ? K1_PROMPT
                     : CLIENT_DOC_PROMPT;
  const userInstr   = docType === '1040' ? 'Extract the financial fields from this Form 1040 tax return. Return ONLY the JSON object — no markdown fences, no commentary.'
                    : docType === 'k1'   ? 'Extract the financial fields from this Schedule K-1. Return ONLY the JSON object — no markdown fences, no commentary.'
                    : 'Extract the client-profile fields from this document (Net Worth Statement, fact-finder, balance sheet, or similar). Return ONLY the JSON object — no markdown fences, no commentary.';

  const mediaType = fileMediaType || 'application/pdf';
  const isPdf = mediaType === 'application/pdf';
  const allowedMedia = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  if (!allowedMedia.includes(mediaType)) {
    return res.status(400).json({ error: 'Unsupported media type. Use PDF, PNG, JPEG, WebP, or GIF.' });
  }

  // Anthropic accepts PDFs via "document" content type, images via "image".
  const userContent = [
    {
      type: isPdf ? 'document' : 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: fileBase64,
      },
    },
    { type: 'text', text: userInstr },
  ];

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({
        error: 'Anthropic API error',
        detail: errText.slice(0, 500),
      });
    }

    const data = await resp.json();
    const text = data?.content?.[0]?.text?.trim() || '';
    if (!text) {
      return res.status(500).json({ error: 'Empty response from Claude' });
    }

    // Claude usually returns clean JSON when instructed, but tolerate ```json
    // fences or surrounding prose.
    const jsonMatch = text.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/) || text.match(/(\{[\s\S]*\})/);
    if (!jsonMatch) {
      return res.status(500).json({
        error: 'Could not find JSON in extraction result',
        rawPreview: text.slice(0, 600),
      });
    }
    let extracted;
    try {
      extracted = JSON.parse(jsonMatch[1]);
    } catch (e) {
      return res.status(500).json({
        error: 'JSON parse failed: ' + e.message,
        rawPreview: jsonMatch[1].slice(0, 600),
      });
    }

    return res.status(200).json({
      ok: true,
      docType,
      extracted,
      generatedAt: new Date().toISOString(),
      usage: data.usage || null,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }
}
