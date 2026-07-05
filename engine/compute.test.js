// Pins for the Pass-1 correctness fixes. Run with: npm test  (node --test)
//
// These are the first automated tests in the system's history. Each encodes a
// confirmed Pass-1 finding so the fix can't silently regress.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  waltonGratRemainder,
  rmdStartAgeForBirthYear,
  rmdStartAge,
  parseMoneyInput,
  inflateExemption,
  ssActiveInYear,
} from './compute.js';

// ── F8: Walton GRAT remainder ────────────────────────────────────────────────
test('Walton GRAT remainder matches the zeroed-out annuity result, not the old formula', () => {
  // $1M, 10% growth, 4.5% §7520 hurdle, 3-yr term. Reference remainder ≈ $126.9k.
  const r = waltonGratRemainder(1_000_000, 0.10, 0.045, 3);
  assert.ok(Math.abs(r - 126_911) < 200, `expected ~126,911, got ${r}`);
  // The old, wrong formula produced ~$189,834 — guard against reverting to it.
  const oldWrong = 1_000_000 * (Math.pow(1.10, 3) - Math.pow(1.045, 3));
  assert.ok(r < oldWrong * 0.8, 'remainder must be well below the old overstated value');
});

test('Walton GRAT remainder handles zero-rate and degenerate inputs', () => {
  assert.equal(waltonGratRemainder(1_000_000, 0, 0, 3), 0);
  assert.equal(waltonGratRemainder(1_000_000, 0.10, 0.045, 0), 0);
  assert.equal(waltonGratRemainder(0, 0.10, 0.045, 3), 0);
});

// ── F16: RMD start age by birth year ─────────────────────────────────────────
test('RMD start age is 75 for clients born 1960 or later, else 73', () => {
  assert.equal(rmdStartAgeForBirthYear(1965), 75);
  assert.equal(rmdStartAgeForBirthYear(1960), 75);
  assert.equal(rmdStartAgeForBirthYear(1959), 73);
  assert.equal(rmdStartAgeForBirthYear(1951), 73);
  // A 61-year-old in plan year 2026 was born 1965 → age 75.
  assert.equal(rmdStartAge(2026, 61), 75);
});

// ── F0c: comma-formatted money parse in clonePlanForNextYear ─────────────────
test('parseMoneyInput reads comma-formatted values (not just the first group)', () => {
  assert.equal(parseMoneyInput('15,000,000'), 15_000_000);
  assert.equal(parseMoneyInput('13,990,000'), 13_990_000);
  assert.equal(parseMoneyInput('0'), 0);
  assert.ok(Number.isNaN(parseMoneyInput('')));
});

test('clone exemption inflation does not collapse to zero', () => {
  const next = inflateExemption('15,000,000', 15_000_000);
  assert.ok(next > 15_000_000 && next < 15_500_000, `expected ~15.37M, got ${next}`);
  // Blank/zero fall back to the default rather than producing 0.
  assert.ok(inflateExemption('', 15_000_000) > 15_000_000);
  assert.ok(inflateExemption('0', 15_000_000) > 15_000_000);
});

// ── F7: Monte Carlo Social Security gating ───────────────────────────────────
test('Social Security is credited only from the claim age onward', () => {
  // 55-year-old claiming at 67: no SS in year 1, SS by year 12 (age 67).
  assert.equal(ssActiveInYear(55, 1, 67), false);
  assert.equal(ssActiveInYear(55, 11, 67), false); // age 66
  assert.equal(ssActiveInYear(55, 12, 67), true);  // age 67
  // Already past claim age: SS from year 1.
  assert.equal(ssActiveInYear(68, 1, 67), true);
});
