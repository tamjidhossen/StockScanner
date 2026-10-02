import { describe, it, expect } from 'vitest';
import {
  convertBengaliDigits,
  parseAndScaleNumericValue,
  normalizeFactItem,
} from '../../src/services/fact-normalizer.service.js';
import { CONCEPT_CODES } from '../../src/config/constants.js';

describe('Fact Normalizer Service', () => {
  describe('convertBengaliDigits', () => {
    it('correctly converts all Bengali digits to ASCII', () => {
      expect(convertBengaliDigits('০১২৩৪৫৬৭৮৯')).toBe('0123456789');
      expect(convertBengaliDigits('টাকা ১২,৩৪৫.৫০')).toBe('টাকা 12,345.50');
    });
  });

  describe('parseAndScaleNumericValue', () => {
    it('parses standard numbers', () => {
      expect(parseAndScaleNumericValue('1234.56')).toBe(1234.56);
      expect(parseAndScaleNumericValue('1,234.56')).toBe(1234.56);
      expect(parseAndScaleNumericValue('BDT 50,000')).toBe(50000);
    });

    it('parses accounting parentheses as negative numbers', () => {
      expect(parseAndScaleNumericValue('(1,234.50)')).toBe(-1234.50);
      expect(parseAndScaleNumericValue('(৫,৬৭৮)')).toBe(-5678);
    });

    it('parses explicit minus signs', () => {
      expect(parseAndScaleNumericValue('-987.65')).toBe(-987.65);
    });

    it('parses accounting nil and dash notations as zero', () => {
      expect(parseAndScaleNumericValue('-')).toBe(0);
      expect(parseAndScaleNumericValue('-.')).toBe(0);
      expect(parseAndScaleNumericValue('-.-')).toBe(0);
      expect(parseAndScaleNumericValue('- -')).toBe(0);
      expect(parseAndScaleNumericValue('—')).toBe(0);
      expect(parseAndScaleNumericValue('–')).toBe(0);
      expect(parseAndScaleNumericValue('nil')).toBe(0);
      expect(parseAndScaleNumericValue('NIL')).toBe(0);
      expect(parseAndScaleNumericValue('None')).toBe(0);
      expect(parseAndScaleNumericValue('N/A')).toBe(0);
      expect(parseAndScaleNumericValue('not applicable')).toBe(0);
    });

    it('throws error on empty or whitespace-only inputs (zero fallback prohibited)', () => {
      expect(() => parseAndScaleNumericValue('')).toThrow('Cannot parse empty or whitespace-only');
      expect(() => parseAndScaleNumericValue('   ')).toThrow('Cannot parse empty or whitespace-only');
    });

    it('protects against catastrophic over-scaling when numbers are already in full unscaled units', () => {
      // 49.89 Billion printed in full Taka with commas should not be multiplied into 49 Trillion
      expect(parseAndScaleNumericValue('49,891,967,210', 'thousands')).toBe(49_891_967_210);
      expect(parseAndScaleNumericValue('1,743,186,382', 'millions')).toBe(1_743_186_382);
    });

    it('applies unit scaling correctly for truncated values', () => {
      // millions
      expect(parseAndScaleNumericValue('10.5', 'millions')).toBe(10_500_000);
      expect(parseAndScaleNumericValue('(2.5)', 'millions')).toBe(-2_500_000);

      // thousands
      expect(parseAndScaleNumericValue('100', 'thousands')).toBe(100_000);

      // crores
      expect(parseAndScaleNumericValue('5', 'crores')).toBe(50_000_000);
    });

    it('parses Bengali digits with unit scaling', () => {
      // ১২.৫ million -> 12.5 million = 12,500,000
      expect(parseAndScaleNumericValue('১২.৫', 'millions')).toBe(12_500_000);
    });

    it('throws error on unparseable inputs', () => {
      expect(() => parseAndScaleNumericValue('abc')).toThrow('Failed to parse numeric value');
      expect(() => parseAndScaleNumericValue(null)).toThrow('Cannot parse null or undefined');
    });
  });

  describe('normalizeFactItem', () => {
    it('normalizes a valid fact item and flags low confidence', () => {
      const fact = normalizeFactItem({
        rawFactId: 'rf-1',
        companyId: 'comp-1',
        financialPeriodId: 'fp-1',
        conceptCode: CONCEPT_CODES.SHORT_TERM_LOANS_ON_INTEREST,
        rawText: '4,567.89',
        statementType: 'BALANCE_SHEET',
        pageNumber: 5,
        unitScale: 'thousands',
        confidenceScore: 0.75, // Below 0.80 -> should flag
      });

      expect(fact.conceptCode).toBe('SHORT_TERM_LOANS_ON_INTEREST');
      expect(fact.normalizedValue).toBe(4_567_890);
      expect(fact.isFlaggedForReview).toBe(true);
      expect(fact.flagReason).toContain('Low extraction confidence');
    });

    it('throws on invalid concept code', () => {
      expect(() =>
        normalizeFactItem({
          rawFactId: 'rf-2',
          companyId: 'comp-1',
          financialPeriodId: 'fp-1',
          conceptCode: 'INVALID_CODE_XYZ',
          rawText: '100',
          statementType: 'BALANCE_SHEET',
          pageNumber: 1,
        })
      ).toThrow('Invalid concept code');
    });
  });
});
