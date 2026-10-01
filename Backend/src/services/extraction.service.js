import fs from 'fs';
import prisma from '../lib/prisma.js';
import { extractFinancialFactsWithGemini } from '../config/gemini.js';
import { normalizeFactItem } from './fact-normalizer.service.js';

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

  // If a financialPeriodId was not passed, see if one can be resolved or created
  let resolvedPeriodId = financialPeriodId;
  if (!resolvedPeriodId && extractionResult.reportingDate) {
    const reportDate = new Date(extractionResult.reportingDate);
    if (!isNaN(reportDate.getTime())) {
      const year = reportDate.getFullYear();
      const periodType = extractionResult.periodMonths === 3 ? 'Q1' : (extractionResult.periodMonths === 6 ? 'H1' : 'ANNUAL');
      
      const period = await prisma.financialPeriod.upsert({
        where: {
          companyId_periodType_periodEnd: {
            companyId,
            periodType,
            periodEnd: reportDate,
          },
        },
        update: {},
        create: {
          companyId,
          periodType,
          periodMonths: extractionResult.periodMonths || 12,
          isAudited: false,
          periodStart: new Date(year, 0, 1),
          periodEnd: reportDate,
          fiscalYear: `${year}`,
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
