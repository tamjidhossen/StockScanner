import { describe, it, expect } from 'vitest';
import { deriveFiscalPeriodInfo } from '../../src/services/extraction.service.js';

describe('Bangladesh Corporate Fiscal Cycle Mapping Engine', () => {
  describe('June Fiscal Year-End Cycle (July 1 to June 30) - SQURPHARMA, BXPHARMA, WALTONHIL', () => {
    it('maps Q1 (Sept 30) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2025-09-30',
        fiscalYearEnd: 'June',
      });
      expect(info.periodType).toBe('Q1');
      expect(info.periodMonths).toBe(3);
      expect(info.fiscalYear).toBe('2025-2026');
      expect(info.periodStart.getUTCMonth()).toBe(6); // July 1
      expect(info.periodStart.getUTCDate()).toBe(1);
    });

    it('maps Q2 / Half-Yearly (Dec 31) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2025-12-31',
        fiscalYearEnd: 'June',
      });
      expect(info.periodType).toBe('Q2');
      expect(info.periodMonths).toBe(6);
      expect(info.fiscalYear).toBe('2025-2026');
      expect(info.periodStart.getUTCMonth()).toBe(6); // July 1
    });

    it('maps Q3 / Nine Months (March 31) correctly - e.g. SQURPHARMA Q3 Report', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-03-31',
        fiscalYearEnd: 'June',
      });
      expect(info.periodType).toBe('Q3');
      expect(info.periodMonths).toBe(9);
      expect(info.fiscalYear).toBe('2025-2026');
      expect(info.periodStart.getUTCMonth()).toBe(6); // July 1, 2025
      expect(info.periodStart.getUTCFullYear()).toBe(2025);
    });

    it('maps Annual (June 30) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-06-30',
        fiscalYearEnd: 'June',
      });
      expect(info.periodType).toBe('ANNUAL');
      expect(info.periodMonths).toBe(12);
      expect(info.fiscalYear).toBe('2025-2026');
      expect(info.periodStart.getUTCMonth()).toBe(6); // July 1, 2025
    });
  });

  describe('March Fiscal Year-End Cycle (April 1 to March 31) - MARICO, BERGERPBL', () => {
    it('maps Q1 (June 30) correctly - e.g. MARICO Q1 FY 2026-27', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-06-30',
        fiscalYearEnd: 'March',
      });
      expect(info.periodType).toBe('Q1');
      expect(info.periodMonths).toBe(3);
      expect(info.fiscalYear).toBe('2026-2027');
      expect(info.periodStart.getUTCMonth()).toBe(3); // April 1, 2026
      expect(info.periodStart.getUTCDate()).toBe(1);
    });

    it('maps Q2 / Half-Yearly (Sept 30) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-09-30',
        fiscalYearEnd: 'March',
      });
      expect(info.periodType).toBe('Q2');
      expect(info.periodMonths).toBe(6);
      expect(info.fiscalYear).toBe('2026-2027');
      expect(info.periodStart.getUTCMonth()).toBe(3); // April 1, 2026
    });

    it('maps Q3 (Dec 31) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-12-31',
        fiscalYearEnd: 'March',
      });
      expect(info.periodType).toBe('Q3');
      expect(info.periodMonths).toBe(9);
      expect(info.fiscalYear).toBe('2026-2027');
      expect(info.periodStart.getUTCMonth()).toBe(3); // April 1, 2026
    });

    it('maps Annual (March 31) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2027-03-31',
        fiscalYearEnd: 'March',
      });
      expect(info.periodType).toBe('ANNUAL');
      expect(info.periodMonths).toBe(12);
      expect(info.fiscalYear).toBe('2026-2027');
      expect(info.periodStart.getUTCMonth()).toBe(3); // April 1, 2026
    });
  });

  describe('December Fiscal Year-End Cycle (January 1 to December 31) - GP, ROBI, LHB', () => {
    it('maps Q1 (March 31) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-03-31',
        fiscalYearEnd: 'December',
      });
      expect(info.periodType).toBe('Q1');
      expect(info.periodMonths).toBe(3);
      expect(info.fiscalYear).toBe('2026');
      expect(info.periodStart.getUTCMonth()).toBe(0); // Jan 1, 2026
    });

    it('maps Q2 / Half-Yearly (June 30) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-06-30',
        fiscalYearEnd: 'December',
      });
      expect(info.periodType).toBe('Q2');
      expect(info.periodMonths).toBe(6);
      expect(info.fiscalYear).toBe('2026');
      expect(info.periodStart.getUTCMonth()).toBe(0); // Jan 1, 2026
    });

    it('maps Q3 (Sept 30) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-09-30',
        fiscalYearEnd: 'December',
      });
      expect(info.periodType).toBe('Q3');
      expect(info.periodMonths).toBe(9);
      expect(info.fiscalYear).toBe('2026');
      expect(info.periodStart.getUTCMonth()).toBe(0); // Jan 1, 2026
    });

    it('maps Annual (Dec 31) correctly', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-12-31',
        fiscalYearEnd: 'December',
      });
      expect(info.periodType).toBe('ANNUAL');
      expect(info.periodMonths).toBe(12);
      expect(info.fiscalYear).toBe('2026');
      expect(info.periodStart.getUTCMonth()).toBe(0); // Jan 1, 2026
    });
  });

  describe('Explicit Overrides & Precedence', () => {
    it('honors explicit user periodType and fiscalYear overrides', () => {
      const info = deriveFiscalPeriodInfo({
        reportingDate: '2026-03-31',
        fiscalYearEnd: 'June',
        explicitPeriodType: 'Q3',
        explicitFiscalYear: '2025-2026',
      });
      expect(info.periodType).toBe('Q3');
      expect(info.fiscalYear).toBe('2025-2026');
    });
  });
});
