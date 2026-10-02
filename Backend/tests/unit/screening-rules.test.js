import { describe, it, expect } from 'vitest';
import { calculateDebtRatio } from '../../src/services/screening/debt-ratio.service.js';
import { calculateDepositsRatio } from '../../src/services/screening/deposits-ratio.service.js';
import { calculateIncomeRatio } from '../../src/services/screening/income-ratio.service.js';
import { calculatePurification } from '../../src/services/screening/purification.service.js';
import { validateAccountingIntegrity } from '../../src/services/validation/accounting-equation.js';
import { CONCEPT_CODES } from '../../src/config/constants.js';

function makeFacts(map) {
  return Object.entries(map).map(([conceptCode, normalizedValue]) => ({
    conceptCode,
    normalizedValue,
  }));
}

describe('Accounting Integrity Engine', () => {
  it('passes when Assets = Liabilities + Equity', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.TOTAL_ASSETS]: 1000,
      [CONCEPT_CODES.TOTAL_LIABILITIES]: 600,
      [CONCEPT_CODES.TOTAL_EQUITY]: 400,
    });
    const result = validateAccountingIntegrity(facts);
    expect(result.allPassed).toBe(true);
  });

  it('throws when Assets != Liabilities + Equity exceeds tolerance', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.TOTAL_ASSETS]: 1000,
      [CONCEPT_CODES.TOTAL_LIABILITIES]: 600,
      [CONCEPT_CODES.TOTAL_EQUITY]: 395, // 5 BDT discrepancy
    });
    expect(() => validateAccountingIntegrity(facts)).toThrow('Accounting Equation Mismatch');
  });

  it('throws when required concept is missing', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.TOTAL_ASSETS]: 1000,
      // Total liabilities missing
      [CONCEPT_CODES.TOTAL_EQUITY]: 400,
    });
    expect(() => validateAccountingIntegrity(facts)).toThrow('Required accounting concept');
  });
});

describe('Rule 3/4/2: Debt Ratio (Loans on Interest ÷ Market Cap)', () => {
  it('passes at exactly 30.00%', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST]: 200,
      [CONCEPT_CODES.LONG_TERM_LOANS_ON_INTEREST]: 100,
    });
    const res = calculateDebtRatio({ facts, marketCap: 1000, viewType: 'STRICT_AAOIFI' });
    expect(res.ratioPercent).toBe(30.0);
    expect(res.passes).toBe(true);
  });

  it('fails at 30.01% (strict upper bound)', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST]: 200.1,
      [CONCEPT_CODES.LONG_TERM_LOANS_ON_INTEREST]: 100,
    });
    const res = calculateDebtRatio({ facts, marketCap: 1000, viewType: 'STRICT_AAOIFI' });
    expect(res.ratioPercent).toBeCloseTo(30.01);
    expect(res.passes).toBe(false);
  });

  it('conservative view includes lease liabilities', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST]: 100,
      [CONCEPT_CODES.LONG_TERM_LOANS_ON_INTEREST]: 100,
      [CONCEPT_CODES.FINANCE_LEASE_LIABILITIES]: 50,
      [CONCEPT_CODES.OPERATING_LEASE_LIABILITIES]: 25,
    });
    const strictRes = calculateDebtRatio({ facts, marketCap: 1000, viewType: 'STRICT_AAOIFI' });
    const consRes = calculateDebtRatio({ facts, marketCap: 1000, viewType: 'CONSERVATIVE' });

    expect(strictRes.numeratorValue).toBe(200);
    expect(consRes.numeratorValue).toBe(275);
    expect(consRes.ratioPercent).toBeCloseTo(27.5, 4);
  });

  it('throws on zero or negative market cap', () => {
    const facts = makeFacts({ [CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST]: 50 });
    expect(() => calculateDebtRatio({ facts, marketCap: 0 })).toThrow('greater than zero');
  });
});

describe('Rule 3/4/3: Interest-Taking Deposits (Deposits ÷ Market Cap)', () => {
  it('strict view excludes cash and equivalents', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.FIXED_DEPOSITS_INTEREST_BEARING]: 150,
      [CONCEPT_CODES.CASH_AND_EQUIVALENTS]: 300,
    });
    const strictRes = calculateDepositsRatio({ facts, marketCap: 1000, viewType: 'STRICT_AAOIFI' });
    const consRes = calculateDepositsRatio({ facts, marketCap: 1000, viewType: 'CONSERVATIVE' });

    expect(strictRes.numeratorValue).toBe(150);
    expect(strictRes.ratioPercent).toBe(15.0);
    expect(consRes.numeratorValue).toBe(450);
    expect(consRes.ratioPercent).toBe(45.0);
    expect(consRes.passes).toBe(false);
  });
});

describe('Rule 3/4/4: Prohibited Income Ratio (Prohibited ÷ Total Income)', () => {
  it('passes at exactly 5.00% when explicit Total Income is provided', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.INTEREST_INCOME]: 50,
      [CONCEPT_CODES.TOTAL_INCOME]: 1000,
    });
    const res = calculateIncomeRatio({ facts });
    expect(res.ratioPercent).toBe(5.0);
    expect(res.passes).toBe(true);
    expect(res.denominatorValue).toBe(1000);
  });

  it('passes at exactly 5.00% when Total Income is computed from components (Revenue + Other + Prohibited)', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.INTEREST_INCOME]: 50,
      [CONCEPT_CODES.TOTAL_REVENUE]: 900,
      [CONCEPT_CODES.OTHER_INCOME]: 50, // Total income = 900 + 50 + 50 = 1000
    });
    const res = calculateIncomeRatio({ facts });
    expect(res.ratioPercent).toBe(5.0);
    expect(res.passes).toBe(true);
    expect(res.denominatorValue).toBe(1000);
  });

  it('fails at 5.01% (strict upper bound)', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.INTEREST_INCOME]: 50.1,
      [CONCEPT_CODES.TOTAL_INCOME]: 1000,
    });
    const res = calculateIncomeRatio({ facts });
    expect(res.ratioPercent).toBeCloseTo(5.01);
    expect(res.passes).toBe(false);
  });

  it('throws MISSING_REQUIRED_FACT when both TOTAL_REVENUE and TOTAL_INCOME are missing', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.INTEREST_INCOME]: 50,
    });
    expect(() => calculateIncomeRatio({ facts })).toThrow('Required accounting concept');
  });
});

describe('Rule 3/4/6: Purification Calculation', () => {
  it('calculates purification per share correctly', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.INTEREST_INCOME]: 52_165_315, // Marico actual Q1 interest income
    });
    const res = calculatePurification({ facts, totalShares: 31_500_000n });
    expect(res.purificationPerShare).toBeCloseTo(1.65604, 4);
    expect(res.totalShares).toBe(31_500_000);
  });

  it('throws MISSING_REQUIRED_FACT when totalShares is zero or null (zero fallback)', () => {
    const facts = makeFacts({
      [CONCEPT_CODES.INTEREST_INCOME]: 1000,
    });
    expect(() => calculatePurification({ facts, totalShares: 0 })).toThrow('Total shares outstanding must be greater than zero');
    expect(() => calculatePurification({ facts, totalShares: null })).toThrow('Total shares outstanding must be greater than zero');
  });
});

describe('Multi-Fact Component Summation (e.g. Current + Non-Current Lease Liabilities)', () => {
  it('sums multiple component facts of the same concept code correctly', () => {
    const facts = [
      { id: 'f1', conceptCode: CONCEPT_CODES.FINANCE_LEASE_LIABILITIES, normalizedValue: 79_623_499, statementType: 'BALANCE_SHEET' },
      { id: 'f2', conceptCode: CONCEPT_CODES.FINANCE_LEASE_LIABILITIES, normalizedValue: 54_630_001, statementType: 'BALANCE_SHEET' },
    ];
    const res = calculateDebtRatio({ facts, marketCap: 100_000_000_000, viewType: 'CONSERVATIVE' });
    // Total leases = 79,623,499 + 54,630,001 = 134,253,500 BDT
    expect(res.numeratorValue).toBe(134_253_500);
    expect(res.sourceFactIds).toContain('f1');
    expect(res.sourceFactIds).toContain('f2');
  });
});
