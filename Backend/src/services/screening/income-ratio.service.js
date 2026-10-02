import { CONCEPT_CODES, AAOIFI_THRESHOLDS } from '../../config/constants.js';
import { getRequiredFact, getOptionalFact, AccountingValidationError } from '../validation/accounting-equation.js';

export function calculateIncomeRatio({ facts }) {
  const sourceFactIds = [];

  // Filter to income statement / non-cash-flow facts to avoid cash flow line items
  const nonCashFlowFacts = facts.filter((f) => f.statementType !== 'CASH_FLOW');

  // Numerator: Total Prohibited / Non-Permissible Income
  const interestIncome = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.INTEREST_INCOME, {
    sourceFactIds,
  });
  const otherProhibited = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.PROHIBITED_INCOME_OTHER, {
    sourceFactIds,
  });
  const totalProhibited = interestIncome + otherProhibited;

  // Denominator: Total Corporate Income (Operating Revenue + Other Income + Finance/Interest Income)
  const explicitTotalIncome = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.TOTAL_INCOME, {
    statementType: 'INCOME_STATEMENT',
  });

  let totalIncome = 0;
  let totalRevenue = 0;
  let otherIncome = 0;

  if (explicitTotalIncome > 0) {
    totalIncome = explicitTotalIncome;
    getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.TOTAL_INCOME, {
      statementType: 'INCOME_STATEMENT',
      sourceFactIds,
    });
  } else {
    // Total Revenue (Sales / Turnover)
    totalRevenue = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.TOTAL_REVENUE, {
      sourceFactIds,
    });
    otherIncome = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.OTHER_INCOME, {
      sourceFactIds,
    });

    if (totalRevenue <= 0) {
      throw new AccountingValidationError(
        'MISSING_REQUIRED_FACT',
        `Required accounting concept "${CONCEPT_CODES.TOTAL_REVENUE}" is missing from extracted statements. Cannot compute Rule 3/4/4 income ratio.`,
        { conceptCode: CONCEPT_CODES.TOTAL_REVENUE }
      );
    }

    // Under AAOIFI Rule 3/4/4, Total Corporate Income is Operating Revenue + Other Income + Finance/Interest Income
    totalIncome = totalRevenue + otherIncome + totalProhibited;
  }

  if (totalIncome <= 0 || isNaN(totalIncome)) {
    throw new AccountingValidationError(
      'MISSING_REQUIRED_FACT',
      'Total corporate income must be greater than zero to compute Rule 3/4/4 prohibited income ratio.',
      { totalIncome }
    );
  }

  const ratio = totalProhibited / totalIncome;
  const ratioPercent = ratio * 100;
  const threshold = AAOIFI_THRESHOLDS.PROHIBITED_INCOME_MAX_PERCENT; // 5.0%

  // Strict AAOIFI threshold: <= 5.000% is compliant
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
    sourceFactIds: [...new Set(sourceFactIds)],
    breakdown: {
      interestIncome,
      otherProhibited,
      totalProhibited,
      totalRevenue,
      otherIncome,
      explicitTotalIncome: explicitTotalIncome || null,
      totalIncome,
    },
  };
}
