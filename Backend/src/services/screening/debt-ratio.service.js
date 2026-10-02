import { CONCEPT_CODES, AAOIFI_THRESHOLDS } from '../../config/constants.js';
import { getOptionalFact, AccountingValidationError } from '../validation/accounting-equation.js';

export function calculateDebtRatio({ facts, marketCap, viewType = 'STRICT_AAOIFI' }) {
  if (!marketCap || marketCap <= 0 || isNaN(marketCap)) {
    throw new AccountingValidationError(
      'MISSING_MARKET_CAP',
      'Market capitalization must be greater than zero to compute Rule 3/4/2 debt ratio. Zero fallbacks are prohibited.',
      { marketCap }
    );
  }

  const strictFactIds = [];
  const consFactIds = [];

  // Base interest-bearing debt
  const shortTermLoans = getOptionalFact(facts, CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });
  const longTermLoans = getOptionalFact(facts, CONCEPT_CODES.LONG_TERM_LOANS_ON_INTEREST, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });
  const bonds = getOptionalFact(facts, CONCEPT_CODES.BONDS_DEBENTURES, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });

  const strictNumerator = shortTermLoans + longTermLoans + bonds;

  // Lease liabilities for conservative view (IFRS 16)
  const leaseFactIds = [];
  const financeLeases = getOptionalFact(facts, CONCEPT_CODES.FINANCE_LEASE_LIABILITIES, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: leaseFactIds,
  });
  const operatingLeases = getOptionalFact(facts, CONCEPT_CODES.OPERATING_LEASE_LIABILITIES, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: leaseFactIds,
  });
  const conservativeNumerator = strictNumerator + financeLeases + operatingLeases;
  consFactIds.push(...strictFactIds, ...leaseFactIds);

  const isConservative = viewType === 'CONSERVATIVE';
  const numerator = isConservative ? conservativeNumerator : strictNumerator;
  const sourceFactIds = isConservative ? [...new Set(consFactIds)] : [...new Set(strictFactIds)];

  const ratio = numerator / marketCap;
  const ratioPercent = ratio * 100;
  const threshold = AAOIFI_THRESHOLDS.DEBT_MAX_PERCENT; // 30.0%

  // Strict AAOIFI threshold: <= 30.000% is compliant
  const passes = ratioPercent <= threshold;

  return {
    rule: '3/4/2',
    ruleName: 'Debt Ratio (Loans on Interest ÷ Market Cap)',
    viewType,
    numeratorValue: numerator,
    denominatorValue: marketCap,
    ratioValue: ratio,
    ratioPercent,
    threshold,
    passes,
    sourceFactIds,
    breakdown: {
      shortTermLoans,
      longTermLoans,
      bonds,
      strictNumerator,
      financeLeases,
      operatingLeases,
      conservativeNumerator,
    },
  };
}
