import { CONCEPT_CODES } from '../../config/constants.js';

export class AccountingValidationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AccountingValidationError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Helper to retrieve a normalized fact value, throwing if absent
 */
export function getRequiredFact(facts, conceptCode) {
  const matching = facts.filter((f) => f.conceptCode === conceptCode);
  if (matching.length === 0) {
    throw new AccountingValidationError(
      'MISSING_REQUIRED_FACT',
      `Required accounting concept "${conceptCode}" is missing from extracted statements. Cannot proceed with screening.`,
      { conceptCode }
    );
  }

  if (matching.length === 1) {
    return matching[0].normalizedValue;
  }

  // If multiple facts share the concept code, find the one explicitly representing the total line
  const explicitTotal = matching.find(
    (f) =>
      (f.rawLabel && /total/i.test(f.rawLabel)) ||
      (f.mappingReason && /total/i.test(f.mappingReason))
  );

  if (explicitTotal) {
    return explicitTotal.normalizedValue;
  }

  // For total concepts, the true total is the maximum of the components
  if (conceptCode.startsWith('TOTAL_')) {
    return Math.max(...matching.map((m) => m.normalizedValue));
  }

  return matching[0].normalizedValue;
}

/**
 * Helper to retrieve a normalized fact value, or return 0 if legitimately absent
 */
export function getOptionalFact(facts, conceptCode) {
  const fact = facts.find((f) => f.conceptCode === conceptCode);
  return fact ? fact.normalizedValue : 0;
}

/**
 * Runs rigorous balance sheet and income statement integrity checks
 *
 * @param {Array<Object>} facts - NormalizedFact records for the financial period
 * @param {number} [tolerance=1.0] - Allowed rounding tolerance in BDT
 * @returns {Object} Validation report summary
 */
export function validateAccountingIntegrity(facts, tolerance = 1.0) {
  const checks = [];

  // Check 1: Fundamental Accounting Equation: Assets = Liabilities + Equity
  const totalAssets = getRequiredFact(facts, CONCEPT_CODES.TOTAL_ASSETS);
  const totalLiabilities = getRequiredFact(facts, CONCEPT_CODES.TOTAL_LIABILITIES);
  const totalEquity = getRequiredFact(facts, CONCEPT_CODES.TOTAL_EQUITY);

  const diffEquation = Math.abs(totalAssets - (totalLiabilities + totalEquity));
  const equationPassed = diffEquation <= tolerance;

  checks.push({
    name: 'ACCOUNTING_EQUATION',
    description: 'Total Assets = Total Liabilities + Total Equity',
    passed: equationPassed,
    expected: totalAssets,
    actual: totalLiabilities + totalEquity,
    difference: diffEquation,
    tolerance,
  });

  if (!equationPassed) {
    throw new AccountingValidationError(
      'ACCOUNTING_EQUATION_MISMATCH',
      `Accounting Equation Mismatch: Total Assets (${totalAssets.toLocaleString()} BDT) does not equal Liabilities (${totalLiabilities.toLocaleString()}) + Equity (${totalEquity.toLocaleString()}). Difference: ${diffEquation.toFixed(2)} BDT.`,
      { totalAssets, totalLiabilities, totalEquity, diffEquation }
    );
  }

  // Check 2: Current Assets + Non-Current Assets = Total Assets (if both present)
  const currentAssets = getOptionalFact(facts, CONCEPT_CODES.TOTAL_CURRENT_ASSETS);
  const nonCurrentAssets = getOptionalFact(facts, CONCEPT_CODES.TOTAL_NON_CURRENT_ASSETS);

  if (currentAssets > 0 && nonCurrentAssets > 0) {
    const diffAssets = Math.abs(totalAssets - (currentAssets + nonCurrentAssets));
    const assetsSubtotalPassed = diffAssets <= tolerance;
    checks.push({
      name: 'ASSETS_SUBTOTAL_RECONCILIATION',
      description: 'Current Assets + Non-Current Assets = Total Assets',
      passed: assetsSubtotalPassed,
      expected: totalAssets,
      actual: currentAssets + nonCurrentAssets,
      difference: diffAssets,
      tolerance,
    });
    if (!assetsSubtotalPassed) {
      throw new AccountingValidationError(
        'ASSETS_SUBTOTAL_MISMATCH',
        `Current Assets (${currentAssets.toLocaleString()}) + Non-Current Assets (${nonCurrentAssets.toLocaleString()}) does not equal Total Assets (${totalAssets.toLocaleString()}). Difference: ${diffAssets.toFixed(2)} BDT.`
      );
    }
  }

  // Check 3: Current Liabilities + Non-Current Liabilities = Total Liabilities (if both present)
  const currentLiabilities = getOptionalFact(facts, CONCEPT_CODES.TOTAL_CURRENT_LIABILITIES);
  const nonCurrentLiabilities = getOptionalFact(facts, CONCEPT_CODES.TOTAL_NON_CURRENT_LIABILITIES);

  if (currentLiabilities > 0 && nonCurrentLiabilities > 0) {
    const diffLiab = Math.abs(totalLiabilities - (currentLiabilities + nonCurrentLiabilities));
    const liabSubtotalPassed = diffLiab <= tolerance;
    checks.push({
      name: 'LIABILITIES_SUBTOTAL_RECONCILIATION',
      description: 'Current Liabilities + Non-Current Liabilities = Total Liabilities',
      passed: liabSubtotalPassed,
      expected: totalLiabilities,
      actual: currentLiabilities + nonCurrentLiabilities,
      difference: diffLiab,
      tolerance,
    });
    if (!liabSubtotalPassed) {
      throw new AccountingValidationError(
        'LIABILITIES_SUBTOTAL_MISMATCH',
        `Current Liabilities (${currentLiabilities.toLocaleString()}) + Non-Current Liabilities (${nonCurrentLiabilities.toLocaleString()}) does not equal Total Liabilities (${totalLiabilities.toLocaleString()}). Difference: ${diffLiab.toFixed(2)} BDT.`
      );
    }
  }

  return {
    allPassed: true,
    totalAssets,
    totalLiabilities,
    totalEquity,
    checks,
  };
}
