import { CONCEPT_CODES, AAOIFI_THRESHOLDS } from '../../config/constants.js';
import { getOptionalFact, AccountingValidationError } from '../validation/accounting-equation.js';

export function calculateDepositsRatio({ facts, marketCap, viewType = 'STRICT_AAOIFI' }) {
  if (!marketCap || marketCap <= 0 || isNaN(marketCap)) {
    throw new AccountingValidationError(
      'MISSING_MARKET_CAP',
      'Market capitalization must be greater than zero to compute Rule 3/4/3 deposits ratio. Zero fallbacks are prohibited.',
      { marketCap }
    );
  }

  const strictFactIds = [];
  const consFactIds = [];

  // Interest-earning deposits and instruments
  const fixedDeposits = getOptionalFact(facts, CONCEPT_CODES.FIXED_DEPOSITS_INTEREST_BEARING, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });
  const treasuryBills = getOptionalFact(facts, CONCEPT_CODES.TREASURY_BILLS, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });
  const govSecurities = getOptionalFact(facts, CONCEPT_CODES.GOVERNMENT_SECURITIES, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });
  const otherIB = getOptionalFact(facts, CONCEPT_CODES.OTHER_INTEREST_BEARING_INVESTMENTS, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: strictFactIds,
  });

  const strictNumerator = fixedDeposits + treasuryBills + govSecurities + otherIB;

  // Cash and cash equivalents for conservative view
  const cashFactIds = [];
  const cashAndEquivalents = getOptionalFact(facts, CONCEPT_CODES.CASH_AND_EQUIVALENTS, {
    statementType: 'BALANCE_SHEET',
    sourceFactIds: cashFactIds,
  });
  const conservativeNumerator = strictNumerator + cashAndEquivalents;
  consFactIds.push(...strictFactIds, ...cashFactIds);

  const isConservative = viewType === 'CONSERVATIVE';
  const numerator = isConservative ? conservativeNumerator : strictNumerator;
  const sourceFactIds = isConservative ? [...new Set(consFactIds)] : [...new Set(strictFactIds)];

  const ratio = numerator / marketCap;
  const ratioPercent = ratio * 100;
  const threshold = AAOIFI_THRESHOLDS.DEPOSITS_MAX_PERCENT; // 30.0%

  // Strict AAOIFI threshold: <= 30.000% is compliant
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
    sourceFactIds,
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
