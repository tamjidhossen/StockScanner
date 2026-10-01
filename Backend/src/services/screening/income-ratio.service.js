import { CONCEPT_CODES, AAOIFI_THRESHOLDS } from '../../config/constants.js';
import { getRequiredFact, getOptionalFact } from '../validation/accounting-equation.js';

export function calculateIncomeRatio({ facts }) {
  const totalRevenue = getRequiredFact(facts, CONCEPT_CODES.TOTAL_REVENUE);
  const otherIncome = getOptionalFact(facts, CONCEPT_CODES.OTHER_INCOME);
  const totalIncome = totalRevenue + otherIncome;

  if (totalIncome <= 0) {
    throw new Error('Total income must be greater than zero to compute Rule 3/4/4 prohibited income ratio.');
  }

  const interestIncome = getOptionalFact(facts, CONCEPT_CODES.INTEREST_INCOME);
  const otherProhibited = getOptionalFact(facts, CONCEPT_CODES.PROHIBITED_INCOME_OTHER);
  const totalProhibited = interestIncome + otherProhibited;

  const ratio = totalProhibited / totalIncome;
  const ratioPercent = ratio * 100;
  const threshold = AAOIFI_THRESHOLDS.PROHIBITED_INCOME_MAX_PERCENT; // 5.0%

  const passes = ratioPercent <= threshold;

  return {
    rule: '3/4/4',
    ruleName: 'Prohibited Income Ratio (Prohibited Income ÷ Total Income)',
    numeratorValue: totalProhibited,
    denominatorValue: totalIncome,
    ratioValue: ratio,
    ratioPercent,
    threshold,
    passes,
    breakdown: {
      interestIncome,
      otherProhibited,
      totalProhibited,
      totalRevenue,
      otherIncome,
      totalIncome,
    },
  };
}
