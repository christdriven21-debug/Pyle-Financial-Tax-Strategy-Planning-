// ═══════════════════════════════════════════════════════════════════════════
// Pyle Plan Builder — extracted pure engine (step 1 of the monolith decomposition).
//
// These are pure, side-effect-free financial functions with NO DOM access, so
// they can be imported and unit-tested in isolation (see compute.test.js). They
// are the first extraction from the ~28k-line index.html.
//
// STATUS: index.html currently contains synchronized copies of these functions
// (waltonGratRemainder, the RMD-age rule, the money-parse used by
// clonePlanForNextYear). The NEXT incremental step is to have index.html import
// from here and delete its copies — that step changes runtime load order
// (classic inline scripts vs. deferred modules) and must be verified in a
// browser before shipping. Until then, keep the two copies in sync; the tests
// here pin the intended behavior for both.
// ═══════════════════════════════════════════════════════════════════════════

// Remainder passing to heirs from a zeroed-out (Walton) GRAT. Assets grow at the
// actual return r while the trust pays a §7520-priced annuity back to the
// grantor (annuity = funding / PV-annuity-factor at the hurdle h, so the gift is
// zeroed out). The old formula funding*((1+r)^n − (1+h)^n) is NOT the GRAT
// remainder and overstates the transfer by ~50%.
export function waltonGratRemainder(funding, r, h, n) {
  if (!(funding > 0) || !(n > 0)) return 0;
  const growth  = Math.pow(1 + r, n);
  const aPV     = h === 0 ? n : (1 - Math.pow(1 + h, -n)) / h;   // PV annuity factor at hurdle
  const annuity = funding / aPV;                                  // zeroed-out annuity payment
  const sFV     = r === 0 ? n : (Math.pow(1 + r, n) - 1) / r;     // FV annuity factor at growth
  return Math.max(0, funding * growth - annuity * sFV);
}

// SECURE 2.0 required-beginning-date age by birth year: 75 for those born 1960
// or later, otherwise 73. (Clients born 1950 or earlier are already past RMD age
// and 73 is a safe planning floor for them.)
export function rmdStartAgeForBirthYear(birthYear) {
  return birthYear >= 1960 ? 75 : 73;
}

// Convenience: derive the RMD age from the plan year and the client's current age.
export function rmdStartAge(planYear, currentAge) {
  return rmdStartAgeForBirthYear(planYear - currentAge);
}

// Parse a money-input string that may be comma-formatted ("15,000,000"). Plain
// parseFloat stops at the first comma and returns 15, which is how
// clonePlanForNextYear was collapsing the estate exemption to 0.
export function parseMoneyInput(v) {
  const n = parseFloat(String(v ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : NaN;
}

// The clone helper's inflation bump for a comma-formatted money value: parse
// safely, fall back when missing/zero, then inflate and round to the nearest
// $10k (matching the app's rounding).
export function inflateExemption(rawValue, fallback, rate = 0.025) {
  const n = parseMoneyInput(rawValue);
  const base = (Number.isFinite(n) && n !== 0) ? n : fallback;
  return Math.round(base * (1 + rate) / 10_000) * 10_000;
}

// Monte Carlo Social Security gate: SS income is credited only once the primary
// reaches the claim age. `year` is 1-based from the start of the projection.
export function ssActiveInYear(primaryAge, year, claimAge) {
  return (primaryAge + year) >= claimAge;
}
