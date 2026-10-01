import { CONCEPT_CODES, AAOIFI_THRESHOLDS } from '../../config/constants.js';
import { getOptionalFact } from '../validation/accounting-equation.js';

export function calculateDepositsRatio({ facts, marketCap, viewType = 'STRICT_AAOIFI' }) {
  if (!marketCap || marketCap <= 0) {
    throw new Error('Market capitalization must be greater than zero to compute Rule 3/4/3 deposits ratio.');
  }

  // Interest-earning deposits and instruments
  const fixedDeposits = getOptionalFact(facts, CONCEPT_CODES.FIXED_DEPOSITS_INTEREST_BEARING);
  const treasuryBills = getOptionalFact(facts, CONCEPT_CODES.TREASURY_BILLS);
  const govSecurities = getOptionalFact(facts, CONCEPT_CODES.GOVERNMENT_SECURITIES);
  const otherIB = getOptionalFact(facts, CONCEPT_CODES.OTHER_INTEREST_BEARING_INVESTMENTS);

  const strictNumerator = fixedDeposits + treasuryBills + govSecurities + otherIB;

  // Cash and cash equivalents for conservative view
  const cashAndEquivalents = getOptionalFact(facts, CONCEPT_CODES.CASH_AND_EQUIVALENTS);
  const conservativeNumerator = strictNumerator + cashAndEquivalents;

  const numerator = viewType === 'CONSERVATIVE' ? conservativeNumerator : strictNumerator;
  const ratio = numerator / marketCap;
  const ratioPercent = ratio * 100;
  const threshold = AAOIFI_THRESHOLDS.DEPOSITS_MAX_PERCENT; // 30.0%

  const passes = ratioPercent <= threshold;

  return {
    rule: '3/4/3',
    ruleName: 'Interest-Taking Deposits Ratio (Deposits ÷ Market Cap)',
    viewType,
    numeratorValue: numerator,
    denominatorValue: marketCap,
    ratioValue: ratio,
    ratioPercent,
    threshold,
    passes,
    breakdown: {
      fixedDeposits,
      treasuryBills,
      govSecurities,
      otherIB,
      strictNumerator,
      cashAndEquivalents,
      conservativeNumerator,
    },
  };
}
