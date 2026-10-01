import { CONCEPT_CODES } from '../../config/constants.js';
import { getOptionalFact } from '../validation/accounting-equation.js';

export function calculatePurification({ facts, totalShares }) {
  const shares = typeof totalShares === 'bigint' ? Number(totalShares) : Number(totalShares);

  if (!shares || isNaN(shares) || shares <= 0) {
    throw new Error('Total shares outstanding must be greater than zero to compute Rule 3/4/6 purification per share.');
  }

  const interestIncome = getOptionalFact(facts, CONCEPT_CODES.INTEREST_INCOME);
  const otherProhibited = getOptionalFact(facts, CONCEPT_CODES.PROHIBITED_INCOME_OTHER);
  const totalProhibited = interestIncome + otherProhibited;

  const purificationPerShare = totalProhibited / shares;

  return {
    rule: '3/4/6',
    ruleName: 'Purification per Share',
    totalProhibitedIncome: totalProhibited,
    totalShares: shares,
    purificationPerShare,
    breakdown: {
      interestIncome,
      otherProhibited,
      totalProhibited,
      totalShares: shares,
    },
  };
}
