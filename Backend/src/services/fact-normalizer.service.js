import { CONCEPT_CODES } from '../config/constants.js';

const BENGALI_DIGIT_MAP = {
  '০': '0',
  '১': '1',
  '২': '2',
  '৩': '3',
  '৪': '4',
  '৫': '5',
  '৬': '6',
  '৭': '7',
  '৮': '8',
  '৯': '9',
};

const UNIT_SCALE_MULTIPLIERS = {
  crores: 10_000_000,
  crore: 10_000_000,
  cr: 10_000_000,
  কোটি: 10_000_000,
  millions: 1_000_000,
  million: 1_000_000,
  mn: 1_000_000,
  m: 1_000_000,
  মিলিয়ন: 1_000_000,
  lakhs: 100_000,
  lakh: 100_000,
  lac: 100_000,
  লাখ: 100_000,
  thousands: 1_000,
  thousand: 1_000,
  k: 1_000,
  হাজার: 1_000,
  units: 1,
  unit: 1,
  base: 1,
};

/**
 * Converts Bengali digits in a string to standard ASCII digits
 */
export function convertBengaliDigits(str) {
  if (!str) return '';
  return str.replace(/[০-৯]/g, (digit) => BENGALI_DIGIT_MAP[digit] || digit);
}

/**
 * Parses raw printed text into a numeric value in base BDT units
 *
 * @param {string|number} rawValue - As printed, e.g. "(1,234.50)", "১২,৩৪৫", "150.25 mn", "-", "-."
 * @param {string|number} [unitScale='units'] - e.g. "millions", "thousands", or multiplier
 * @returns {number} Numeric value in base BDT
 */
export function parseAndScaleNumericValue(rawValue, unitScale = 'units') {
  if (rawValue === null || rawValue === undefined) {
    throw new Error('Cannot parse null or undefined raw value');
  }

  const rawTrimmed = String(rawValue).trim();
  if (rawTrimmed === '') {
    throw new Error('Cannot parse empty or whitespace-only raw value');
  }

  if (typeof rawValue === 'number') {
    const scaleFactor = typeof unitScale === 'number'
      ? unitScale
      : (UNIT_SCALE_MULTIPLIERS[String(unitScale).toLowerCase()] || 1);
    return rawValue * scaleFactor;
  }

  let text = rawTrimmed;
  text = convertBengaliDigits(text);

  // Check if enclosed in parentheses (accounting negative)
  const isParenthesesNegative = /^\s*\((.*)\)\s*$/.test(text);
  if (isParenthesesNegative) {
    text = text.replace(/^\s*\((.*)\)\s*$/, '$1').trim();
  }

  // Remove currency words, symbols, and commas
  text = text.replace(/(BDT|Tk|Taka|৳|\$|£|€|,)/gi, '').trim();

  // Handle accounting nil/zero notations: "-", "—", "–", "-.", "- -", "nil", "none", "n/a", etc.
  const hasDigits = /\d/.test(text);
  if (!hasDigits) {
    const isNilToken = /^[\s\-—–._]*(nil|none|n\/a|not applicable|—|–|-|\.-|\.-)?[\s\-—–._]*$/i.test(text);
    if (isNilToken && text.length > 0) {
      return 0;
    }
  }

  // If there's an explicit minus sign
  let isNegative = isParenthesesNegative;
  if (text.startsWith('-') || text.endsWith('-')) {
    isNegative = true;
    text = text.replace(/-/g, '').trim();
  }

  // Look for inline scale indicators in text (e.g. "12.5 mn")
  let inlineScale = 1;
  const inlineMatch = text.match(/(mn|million|cr|crore|thousand|lac|lakh)/i);
  if (inlineMatch) {
    const key = inlineMatch[1].toLowerCase();
    inlineScale = UNIT_SCALE_MULTIPLIERS[key] || 1;
    text = text.replace(/(mn|million|cr|crore|thousand|lac|lakh)/gi, '').trim();
  }

  // Parse float
  const numeric = parseFloat(text);
  if (isNaN(numeric)) {
    throw new Error(`Failed to parse numeric value from raw string: "${rawValue}"`);
  }

  // Resolve external unitScale
  let documentScale = 1;
  if (typeof unitScale === 'number') {
    documentScale = unitScale;
  } else if (unitScale && typeof unitScale === 'string') {
    const cleanScaleKey = unitScale.trim().toLowerCase();
    documentScale = UNIT_SCALE_MULTIPLIERS[cleanScaleKey] || 1;
  }

  let finalMultiplier = inlineScale !== 1 ? inlineScale : documentScale;

  // Catastrophic over-scaling safeguard:
  // If the number is already >= 1 Billion (10^9) with full integer digits,
  // applying a 'thousands' or 'millions' multiplier would yield tens of trillions (exceeding entire Bangladesh GDP).
  // Table was already printed in full unscaled Taka units.
  if (numeric >= 1_000_000_000 && finalMultiplier > 1) {
    console.warn(`[Scale Safeguard] Detected unscaled large figure (${numeric.toLocaleString()}) with scale multiplier ${finalMultiplier}. Overriding multiplier to 1 to prevent trillion-scale distortion.`);
    finalMultiplier = 1;
  }

  const baseValue = numeric * finalMultiplier;

  return isNegative ? -Math.abs(baseValue) : Math.abs(baseValue);
}

/**
 * Normalizes a raw fact item into a NormalizedFact structure
 */
export function normalizeFactItem({
  rawFactId,
  companyId,
  financialPeriodId,
  conceptCode,
  rawText,
  statementType,
  pageNumber,
  unitScale = 'units',
  confidenceScore = 1.0,
  mappingReason = 'Direct extraction',
}) {
  // 1. Concept code validation
  if (!CONCEPT_CODES[conceptCode]) {
    throw new Error(
      `Invalid concept code: "${conceptCode}". Must be one of: ${Object.keys(CONCEPT_CODES).join(', ')}`
    );
  }

  // 2. Parse numeric value
  const normalizedValue = parseAndScaleNumericValue(rawText, unitScale);

  // 3. Resolve unitScale int
  const unitScaleInt = typeof unitScale === 'number'
    ? unitScale
    : (UNIT_SCALE_MULTIPLIERS[String(unitScale).toLowerCase()] || 1);

  // 4. Flag for manual review if low confidence
  const isFlaggedForReview = confidenceScore < 0.80;
  const flagReason = isFlaggedForReview
    ? `Low extraction confidence (${(confidenceScore * 100).toFixed(1)}%). Requires administrative review.`
    : null;

  return {
    rawFactId,
    companyId,
    financialPeriodId,
    conceptCode,
    normalizedValue,
    currency: 'BDT',
    unitScale: unitScaleInt,
    statementType,
    pageNumber,
    confidenceScore,
    mappingReason,
    isManuallyVerified: false,
    isFlaggedForReview,
    flagReason,
  };
}
