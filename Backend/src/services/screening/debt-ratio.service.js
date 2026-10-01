import { CONCEPT_CODES, AAOIFI_THRESHOLDS } from '../../config/constants.js';
import { getOptionalFact } from '../validation/accounting-equation.js';

export function calculateDebtRatio({ facts, marketCap, viewType = 'STRICT_AAOIFI' }) {
  if (!marketCap || marketCap <= 0) {
    throw new Error('Market capitalization must be greater than zero to compute Rule 3/4/2 debt ratio.');
  }

  // Base interest-bearing debt
  const shortTermLoans = getOptionalFact(facts, CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST);
  const longTermLoans = getOptionalFact(facts, CONCEPT_CODES.LONG_TERM_LOANS_ON_INTEREST);
  const bonds = getOptionalFact(facts, CONCEPT_CODES.BONDS_DEBENTURES);

  const strictNumerator = shortTermLoans + longTermLoans + bonds;

  // Lease liabilities for conservative view
  const financeLeases = getOptionalFact(facts, CONCEPT_CODES.FINANCE_LEASE_LIABILITIES);
  const operatingLeases = getOptionalFact(facts, CONCEPT_CODES.OPERATING_LEASE_LIABILITIES);
  const conservativeNumerator = strictNumerator + financeLeases + operatingLeases;

  const numerator = viewType === 'CONSERVATIVE' ? conservativeNumerator : strictNumerator;
  const ratio = numerator / marketCap;
  const ratioPercent = ratio * 100;
  const threshold = AAOIFI_THRESHOLDS.DEBT_MAX_PERCENT; // 30.0%

  // Strict AAOIFI threshold: <= 30.00% is compliant
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
