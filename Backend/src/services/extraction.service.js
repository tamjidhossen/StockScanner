import fs from 'fs';
import prisma from '../lib/prisma.js';
import { extractFinancialFactsWithGemini } from '../config/gemini.js';
import { normalizeFactItem } from './fact-normalizer.service.js';

/**
/**
 * Derives accurate periodType, fiscalYear string, and period dates from reporting date and company cycle.
 * Mapped accurately across Bangladesh's three corporate cycles: June, March, and December year-ends.
 *
 * @param {Object} params
 * @param {string|Date} params.reportingDate - e.g. "2026-03-31" or "2026-06-30"
 * @param {number} [params.periodMonths] - e.g. 3, 6, 9, 12
 * @param {string} [params.fiscalYearEnd='June'] - "June", "March", or "December"
 * @param {string} [params.explicitPeriodType] - e.g. "Q1", "Q2", "Q3", "ANNUAL"
 * @param {string} [params.explicitFiscalYear] - e.g. "2025-2026"
 * @returns {Object} Accurate period descriptor
 */
export function deriveFiscalPeriodInfo({
  reportingDate,
  periodMonths = null,
  fiscalYearEnd = 'June',
  explicitPeriodType = null,
  explicitFiscalYear = null,
}) {
  const date = new Date(reportingDate);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-12

  const endCycle = String(fiscalYearEnd).trim().toLowerCase();

  let derivedPeriodType = 'ANNUAL';
  let derivedMonths = periodMonths || 12;
  let derivedFiscalYear = `${year}`;
  let periodStart = new Date(date);

  if (endCycle.includes('june')) {
    // June Year-End Cycle (July 1 to June 30) - SQURPHARMA, BXPHARMA, WALTONHIL, RENATA, UPGDCL
    if (month >= 7 && month <= 9) {
      // Q1 (ends Sept 30)
      derivedPeriodType = 'Q1';
      derivedMonths = periodMonths || 3;
      derivedFiscalYear = `${year}-${year + 1}`;
      periodStart = new Date(Date.UTC(year, 6, 1)); // July 1, year
    } else if (month >= 10 && month <= 12) {
      // Q2 / Half-Yearly (ends Dec 31)
      derivedPeriodType = 'Q2';
      derivedMonths = periodMonths || (derivedMonths === 3 ? 3 : 6);
      derivedFiscalYear = `${year}-${year + 1}`;
      periodStart = derivedMonths === 3 ? new Date(Date.UTC(year, 9, 1)) : new Date(Date.UTC(year, 6, 1));
    } else if (month >= 1 && month <= 3) {
      // Q3 (ends March 31)
      derivedPeriodType = 'Q3';
      derivedMonths = periodMonths || (derivedMonths === 3 ? 3 : 9);
      derivedFiscalYear = `${year - 1}-${year}`;
      periodStart = derivedMonths === 3 ? new Date(Date.UTC(year, 0, 1)) : new Date(Date.UTC(year - 1, 6, 1));
    } else {
      // Annual (ends June 30)
      derivedPeriodType = 'ANNUAL';
      derivedMonths = 12;
      derivedFiscalYear = `${year - 1}-${year}`;
      periodStart = new Date(Date.UTC(year - 1, 6, 1));
    }
  } else if (endCycle.includes('march')) {
    // March Year-End Cycle (April 1 to March 31) - MARICO, BERGERPBL
    if (month >= 4 && month <= 6) {
      // Q1 (ends June 30)
      derivedPeriodType = 'Q1';
      derivedMonths = periodMonths || 3;
      derivedFiscalYear = `${year}-${year + 1}`;
      periodStart = new Date(Date.UTC(year, 3, 1)); // April 1, year
    } else if (month >= 7 && month <= 9) {
      // Q2 / Half-Yearly (ends Sept 30)
      derivedPeriodType = 'Q2';
      derivedMonths = periodMonths || (derivedMonths === 3 ? 3 : 6);
      derivedFiscalYear = `${year}-${year + 1}`;
      periodStart = derivedMonths === 3 ? new Date(Date.UTC(year, 6, 1)) : new Date(Date.UTC(year, 3, 1));
    } else if (month >= 10 && month <= 12) {
      // Q3 (ends Dec 31)
      derivedPeriodType = 'Q3';
      derivedMonths = periodMonths || (derivedMonths === 3 ? 3 : 9);
      derivedFiscalYear = `${year}-${year + 1}`;
      periodStart = derivedMonths === 3 ? new Date(Date.UTC(year, 9, 1)) : new Date(Date.UTC(year, 3, 1));
    } else {
      // Annual (ends March 31)
      derivedPeriodType = 'ANNUAL';
      derivedMonths = 12;
      derivedFiscalYear = `${year - 1}-${year}`;
      periodStart = new Date(Date.UTC(year - 1, 3, 1));
    }
  } else {
    // December Year-End Cycle (January 1 to December 31) - GP, ROBI, LHB
    if (month >= 1 && month <= 3) {
      // Q1 (ends March 31)
      derivedPeriodType = 'Q1';
      derivedMonths = periodMonths || 3;
      derivedFiscalYear = `${year}`;
      periodStart = new Date(Date.UTC(year, 0, 1)); // Jan 1, year
    } else if (month >= 4 && month <= 6) {
      // Q2 / Half-Yearly (ends June 30)
      derivedPeriodType = 'Q2';
      derivedMonths = periodMonths || (derivedMonths === 3 ? 3 : 6);
      derivedFiscalYear = `${year}`;
      periodStart = derivedMonths === 3 ? new Date(Date.UTC(year, 3, 1)) : new Date(Date.UTC(year, 0, 1));
    } else if (month >= 7 && month <= 9) {
      // Q3 (ends Sept 30)
      derivedPeriodType = 'Q3';
      derivedMonths = periodMonths || (derivedMonths === 3 ? 3 : 9);
      derivedFiscalYear = `${year}`;
      periodStart = derivedMonths === 3 ? new Date(Date.UTC(year, 6, 1)) : new Date(Date.UTC(year, 0, 1));
    } else {
      // Annual (ends Dec 31)
      derivedPeriodType = 'ANNUAL';
      derivedMonths = 12;
      derivedFiscalYear = `${year}`;
      periodStart = new Date(Date.UTC(year, 0, 1));
    }
  }

  // User/Document explicit overrides take highest precedence if valid
  const finalPeriodType = (explicitPeriodType && ['Q1', 'Q2', 'Q3', 'H1', 'ANNUAL'].includes(explicitPeriodType.toUpperCase()))
    ? explicitPeriodType.toUpperCase()
    : derivedPeriodType;

  const finalFiscalYear = (explicitFiscalYear && explicitFiscalYear.trim().length >= 4)
    ? explicitFiscalYear.trim()
    : derivedFiscalYear;

  return {
    periodType: finalPeriodType,
    periodMonths: derivedMonths,
    periodStart,
    periodEnd: date,
    fiscalYear: finalFiscalYear,
  };
}

/**
 * Extracts facts from a single document page and persists both RawFact and NormalizedFact
 *
 * @param {Object} params
 * @param {string} params.documentId
 * @param {number} params.pageNumber
 * @param {string} params.companyId
 * @param {string} [params.financialPeriodId]
 * @returns {Promise<Object>} Summary of facts extracted from this page
 */
export async function processPageExtraction({
  documentId,
  pageNumber,
  companyId,
  financialPeriodId,
}) {
  const page = await prisma.documentPage.findUnique({
    where: {
      documentId_pageNumber: {
        documentId,
        pageNumber,
      },
    },
  });

  if (!page) {
    throw new Error(`Page ${pageNumber} of document ${documentId} not found`);
  }

  const document = await prisma.document.findUnique({
    where: { id: documentId },
  });

  // Read rendered image buffer if present
  let imageBuffer = null;
  if (page.imagePath && fs.existsSync(page.imagePath)) {
    imageBuffer = fs.readFileSync(page.imagePath);
  }

  // Call Gemini multimodal vision with strict schema
  const extractionResult = await extractFinancialFactsWithGemini({
    imageBuffer,
    pageText: page.rawTextPreview || '',
    statementType: page.contentType,
  });

  const { unitScale = 'units', currency = 'BDT', extractedItems = [] } = extractionResult;

  // If a financialPeriodId was not passed, resolve or create one dynamically
  let resolvedPeriodId = financialPeriodId || document?.financialPeriodId;
  if (!resolvedPeriodId && extractionResult.reportingDate) {
    const reportDate = new Date(extractionResult.reportingDate);
    if (!isNaN(reportDate.getTime())) {
      const company = await prisma.company.findUnique({
        where: { id: companyId },
        select: { fiscalYearEnd: true },
      });

      // Detect explicit quarter or fiscal year from document metadata or filename
      let explicitPeriodType = document?.reportType;
      if (document?.originalFilename) {
        const fn = document.originalFilename.toLowerCase();
        if (fn.includes('3rd') || fn.includes('q3')) explicitPeriodType = 'Q3';
        else if (fn.includes('2nd') || fn.includes('q2') || fn.includes('half')) explicitPeriodType = 'Q2';
        else if (fn.includes('1st') || fn.includes('q1')) explicitPeriodType = 'Q1';
        else if (fn.includes('annual') || fn.includes('audited')) explicitPeriodType = 'ANNUAL';
      }

      const fiscalInfo = deriveFiscalPeriodInfo({
        reportingDate: extractionResult.reportingDate,
        periodMonths: extractionResult.periodMonths || null,
        fiscalYearEnd: company?.fiscalYearEnd || 'June',
        explicitPeriodType,
      });

      const period = await prisma.financialPeriod.upsert({
        where: {
          companyId_periodType_periodEnd: {
            companyId,
            periodType: fiscalInfo.periodType,
            periodEnd: reportDate,
          },
        },
        update: {
          periodMonths: fiscalInfo.periodMonths,
          fiscalYear: fiscalInfo.fiscalYear,
        },
        create: {
          companyId,
          periodType: fiscalInfo.periodType,
          periodMonths: fiscalInfo.periodMonths,
          isAudited: fiscalInfo.periodType === 'ANNUAL',
          periodStart: fiscalInfo.periodStart,
          periodEnd: reportDate,
          fiscalYear: fiscalInfo.fiscalYear,
        },
      });
      resolvedPeriodId = period.id;

      // Associate with document if missing
      await prisma.document.update({
        where: { id: documentId },
        data: { financialPeriodId: resolvedPeriodId },
      });
    }
  }

  const savedFacts = [];

  for (const item of extractedItems) {
    // 1. Create RawFact record
    const rawFact = await prisma.rawFact.create({
      data: {
        documentId,
        pageNumber,
        statementType: page.contentType,
        rawLabel: item.rawLabel,
        rawValue: String(item.rawText),
        currencyRaw: currency,
        unitScaleRaw: unitScale,
        boundingBox: item.boundingBox ? JSON.stringify(item.boundingBox) : null,
        extractionMethod: 'VISION_JSON_SCHEMA',
        confidenceScore: item.confidenceScore || 1.0,
      },
    });

    // 2. Normalize and create NormalizedFact record (if financialPeriod is available)
    if (resolvedPeriodId) {
      try {
        const normalizedData = normalizeFactItem({
          rawFactId: rawFact.id,
          companyId,
          financialPeriodId: resolvedPeriodId,
          conceptCode: item.suggestedConceptCode,
          rawText: item.rawText,
          statementType: page.contentType,
          pageNumber,
          unitScale,
          confidenceScore: item.confidenceScore || 1.0,
          mappingReason: item.mappingReason || 'Gemini semantic mapping',
        });

        const normalizedFact = await prisma.normalizedFact.create({
          data: normalizedData,
        });

        savedFacts.push({ raw: rawFact, normalized: normalizedFact });
      } catch (normErr) {
        console.warn(`Could not normalize fact "${item.rawLabel}":`, normErr.message);
        savedFacts.push({ raw: rawFact, normalized: null, error: normErr.message });
      }
    } else {
      savedFacts.push({ raw: rawFact, normalized: null });
    }
  }

  return {
    pageNumber,
    classification: extractionResult.pageClassification,
    reportingDate: extractionResult.reportingDate,
    unitScale,
    currency,
    factsExtracted: savedFacts.length,
    facts: savedFacts,
  };
}
