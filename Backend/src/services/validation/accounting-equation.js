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
 *
 * @param {Array<Object>} facts
 * @param {string} conceptCode
 * @param {Object} [options]
 * @param {string} [options.statementType] - Filter by statement type
 * @param {Array<string>} [options.sourceFactIds] - Array to collect used fact IDs for audit trail
 * @returns {number}
 */
export function getRequiredFact(facts, conceptCode, options = {}) {
  let matching = facts.filter((f) => f.conceptCode === conceptCode);

  if (options.statementType) {
    const filtered = matching.filter((f) => f.statementType === options.statementType);
    if (filtered.length > 0) matching = filtered;
  }

  if (matching.length === 0) {
    throw new AccountingValidationError(
      'MISSING_REQUIRED_FACT',
      `Required accounting concept "${conceptCode}" is missing from extracted statements. Cannot proceed with screening.`,
      { conceptCode }
    );
  }

  if (matching.length === 1) {
    if (options.sourceFactIds && matching[0].id) {
      options.sourceFactIds.push(matching[0].id);
    }
    return matching[0].normalizedValue;
  }

  // If multiple facts share the concept code, find the one explicitly representing the total line
  const explicitTotal = matching.find(
    (f) =>
      (f.rawLabel && /total/i.test(f.rawLabel)) ||
      (f.mappingReason && /total/i.test(f.mappingReason))
  );

  if (explicitTotal) {
    if (options.sourceFactIds && explicitTotal.id) {
      options.sourceFactIds.push(explicitTotal.id);
    }
    return explicitTotal.normalizedValue;
  }

  // For total concepts, the true total is the maximum of the components
  if (conceptCode.startsWith('TOTAL_')) {
    const maxFact = matching.reduce((prev, curr) =>
      curr.normalizedValue > prev.normalizedValue ? curr : prev
    );
    if (options.sourceFactIds && maxFact.id) {
      options.sourceFactIds.push(maxFact.id);
    }
    return maxFact.normalizedValue;
  }

  // For component line items with multiple occurrences, the true value is their sum
  for (const f of matching) {
    if (options.sourceFactIds && f.id) {
      options.sourceFactIds.push(f.id);
    }
  }
  return matching.reduce((sum, f) => sum + f.normalizedValue, 0);
}

/**
 * Helper to retrieve a normalized fact value, or return 0 if legitimately absent.
 * If multiple component line items exist without an explicit total, sums them.
 *
 * @param {Array<Object>} facts
 * @param {string} conceptCode
 * @param {Object} [options]
 * @param {string} [options.statementType] - Filter by statement type
 * @param {Array<string>} [options.sourceFactIds] - Array to collect used fact IDs for audit trail
 * @returns {number}
 */
export function getOptionalFact(facts, conceptCode, options = {}) {
  let matching = facts.filter((f) => f.conceptCode === conceptCode);

  if (options.statementType) {
    const filtered = matching.filter((f) => f.statementType === options.statementType);
    if (filtered.length > 0) matching = filtered;
  }

  if (matching.length === 0) return 0;

  if (matching.length === 1) {
    if (options.sourceFactIds && matching[0].id) {
      options.sourceFactIds.push(matching[0].id);
    }
    return matching[0].normalizedValue;
  }

  // If explicit total exists
  const explicitTotal = matching.find(
    (f) =>
      (f.rawLabel && /total/i.test(f.rawLabel)) ||
      (f.mappingReason && /total/i.test(f.mappingReason))
  );

  if (explicitTotal) {
    if (options.sourceFactIds && explicitTotal.id) {
      options.sourceFactIds.push(explicitTotal.id);
    }
    return explicitTotal.normalizedValue;
  }

  // For total concepts
  if (conceptCode.startsWith('TOTAL_')) {
    const maxFact = matching.reduce((prev, curr) =>
      curr.normalizedValue > prev.normalizedValue ? curr : prev
    );
    if (options.sourceFactIds && maxFact.id) {
      options.sourceFactIds.push(maxFact.id);
    }
    return maxFact.normalizedValue;
  }

  // For multiple component facts (e.g. current + non-current lease liabilities), sum them all!
  for (const f of matching) {
    if (options.sourceFactIds && f.id) {
      options.sourceFactIds.push(f.id);
    }
  }
  return matching.reduce((sum, f) => sum + f.normalizedValue, 0);
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
  const totalAssets = getRequiredFact(facts, CONCEPT_CODES.TOTAL_ASSETS, { statementType: 'BALANCE_SHEET' });
  const totalLiabilities = getRequiredFact(facts, CONCEPT_CODES.TOTAL_LIABILITIES, { statementType: 'BALANCE_SHEET' });
  const totalEquity = getRequiredFact(facts, CONCEPT_CODES.TOTAL_EQUITY, { statementType: 'BALANCE_SHEET' });

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
  const currentAssets = getOptionalFact(facts, CONCEPT_CODES.TOTAL_CURRENT_ASSETS, { statementType: 'BALANCE_SHEET' });
  const nonCurrentAssets = getOptionalFact(facts, CONCEPT_CODES.TOTAL_NON_CURRENT_ASSETS, { statementType: 'BALANCE_SHEET' });

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
  const currentLiabilities = getOptionalFact(facts, CONCEPT_CODES.TOTAL_CURRENT_LIABILITIES, { statementType: 'BALANCE_SHEET' });
  const nonCurrentLiabilities = getOptionalFact(facts, CONCEPT_CODES.TOTAL_NON_CURRENT_LIABILITIES, { statementType: 'BALANCE_SHEET' });

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
