import { describe, it, expect } from 'vitest';
import { classifyPageContent } from '../../src/services/pdf-inspector.service.js';
import { isPdfBuffer, computeSha256 } from '../../src/services/storage.service.js';

describe('PDF Storage & Inspector Utilities', () => {
  it('correctly validates PDF magic bytes', () => {
    const validPdf = Buffer.from('%PDF-1.7\n%some binary data');
    const invalidPdf = Buffer.from('NOT A PDF FILE');
    const tooShort = Buffer.from('%PDF');

    expect(isPdfBuffer(validPdf)).toBe(true);
    expect(isPdfBuffer(invalidPdf)).toBe(false);
    expect(isPdfBuffer(tooShort)).toBe(false);
  });

  it('computes consistent SHA-256 hashes', () => {
    const data = Buffer.from('Sample Bangladesh Financial Report 2026');
    const hash1 = computeSha256(data);
    const hash2 = computeSha256(data);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('classifies balance sheet and financial position pages', () => {
    expect(classifyPageContent('CONSOLIDATED STATEMENT OF FINANCIAL POSITION AS AT 30 JUNE 2025')).toBe('BALANCE_SHEET');
    expect(classifyPageContent('BALANCE SHEET AS OF DECEMBER 31, 2024')).toBe('BALANCE_SHEET');
    expect(classifyPageContent('কোম্পানির সংক্ষিপ্ত স্থিতিপত্র (Balance Sheet)')).toBe('BALANCE_SHEET');
  });

  it('classifies income statements and profit/loss accounts', () => {
    expect(classifyPageContent('STATEMENT OF PROFIT OR LOSS AND OTHER COMPREHENSIVE INCOME')).toBe('INCOME_STATEMENT');
    expect(classifyPageContent('CONSOLIDATED PROFIT AND LOSS ACCOUNT FOR THE YEAR ENDED')).toBe('INCOME_STATEMENT');
    expect(classifyPageContent('লাভ-ক্ষতি ও অন্যান্য সমন্বিত আয় বিবরণী')).toBe('INCOME_STATEMENT');
  });

  it('classifies cash flows and notes', () => {
    expect(classifyPageContent('CONSOLIDATED STATEMENT OF CASH FLOWS')).toBe('CASH_FLOW');
    expect(classifyPageContent('নগদ প্রবাহ বিবরণী')).toBe('CASH_FLOW');
    expect(classifyPageContent('NOTES TO THE FINANCIAL STATEMENTS')).toBe('NOTES');
    expect(classifyPageContent('DIRECTORS REPORT TO SHAREHOLDERS')).toBe('OTHER');
  });
});
