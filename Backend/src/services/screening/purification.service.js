import { CONCEPT_CODES } from '../../config/constants.js';
import { getOptionalFact, AccountingValidationError } from '../validation/accounting-equation.js';

export function calculatePurification({ facts, totalShares }) {
  const shares = typeof totalShares === 'bigint' ? Number(totalShares) : Number(totalShares);

  if (!shares || isNaN(shares) || shares <= 0) {
    throw new AccountingValidationError(
      'MISSING_REQUIRED_FACT',
      'Total shares outstanding must be greater than zero to compute Rule 3/4/6 purification per share. Zero fallbacks are prohibited.',
      { totalShares }
    );
  }

  const sourceFactIds = [];
  const nonCashFlowFacts = facts.filter((f) => f.statementType !== 'CASH_FLOW');

  const interestIncome = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.INTEREST_INCOME, {
    sourceFactIds,
  });
  const otherProhibited = getOptionalFact(nonCashFlowFacts, CONCEPT_CODES.PROHIBITED_INCOME_OTHER, {
    sourceFactIds,
  });
  const totalProhibited = interestIncome + otherProhibited;

  const purificationPerShare = totalProhibited / shares;

  return {
    rule: '3/4/6',
    ruleName: 'Purification per Share',
    totalProhibitedIncome: totalProhibited,
    totalShares: shares,
    purificationPerShare,
    sourceFactIds: [...new Set(sourceFactIds)],
    breakdown: {
      interestIncome,
      otherProhibited,
      totalProhibited,
      totalShares: shares,
    },
  };
}
