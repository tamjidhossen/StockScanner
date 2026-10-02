import { GoogleGenAI } from '@google/genai';
import { CONCEPT_CODES } from './constants.js';

let aiClientInstance = null;

export function getGeminiClient() {
  if (!aiClientInstance) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_API;
    if (!apiKey) {
      throw new Error(
        'GEMINI_API_KEY is not defined in environment variables. Please set GEMINI_API_KEY or GEMINI_API in Backend/.env'
      );
    }
    aiClientInstance = new GoogleGenAI({ apiKey });
  }
  return aiClientInstance;
}

/**
 * Strict JSON response schema for structured financial item extraction
 */
export const FINANCIAL_EXTRACTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    pageClassification: {
      type: 'STRING',
      enum: ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'NOTES', 'OTHER'],
    },
    reportingDate: {
      type: 'STRING',
      description: 'The balance sheet date or period-end date formatted as YYYY-MM-DD, e.g. 2024-06-30',
    },
    currency: {
      type: 'STRING',
      description: 'Reporting currency, e.g. BDT or Taka',
    },
    unitScale: {
      type: 'STRING',
      enum: ['units', 'thousands', 'millions', 'crores', 'lakhs'],
      description: 'The unit scale used in the table headers, e.g. in thousand Taka or in million BDT',
    },
    isConsolidated: {
      type: 'BOOLEAN',
      description: 'True if figures represent consolidated financial statements',
    },
    periodMonths: {
      type: 'INTEGER',
      description: 'Number of months in period: 3 for Q1/Q2/Q3, 6 for H1, 12 for annual',
    },
    extractedItems: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          rawLabel: {
            type: 'STRING',
            description: 'The verbatim line item label as printed on the page',
          },
          rawText: {
            type: 'STRING',
            description: 'The exact value as printed for current period, e.g. "4,567.89", "(1,200)", or "৪৫৬৭"',
          },
          suggestedConceptCode: {
            type: 'STRING',
            enum: Object.keys(CONCEPT_CODES),
            description: 'The mapped AAOIFI standardized concept code',
          },
          isInterestBearing: {
            type: 'BOOLEAN',
            description: 'True if this debt or deposit item explicitly or implicitly incurs/earns interest',
          },
          isSubtotal: {
            type: 'BOOLEAN',
            description: 'True if this line item is a calculated total or subtotal row',
          },
          confidenceScore: {
            type: 'NUMBER',
            description: 'Model extraction and mapping confidence between 0.0 and 1.0',
          },
          mappingReason: {
            type: 'STRING',
            description: 'Brief reason why this printed line maps to this concept code',
          },
          boundingBox: {
            type: 'OBJECT',
            properties: {
              x: { type: 'NUMBER' },
              y: { type: 'NUMBER' },
              w: { type: 'NUMBER' },
              h: { type: 'NUMBER' },
            },
            description: 'Approximate bounding box on page image (percentage or pixels)',
          },
        },
        required: ['rawLabel', 'rawText', 'suggestedConceptCode', 'confidenceScore'],
      },
    },
  },
  required: ['pageClassification', 'currency', 'unitScale', 'extractedItems'],
};

/**
 * Executes multimodal extraction on a financial statement page
 *
 * @param {Object} params
 * @param {Buffer} params.imageBuffer - Rendered page image buffer (PNG)
 * @param {string} [params.pageText] - Extracted text tokens from pdfjs-dist
 * @param {string} params.statementType - Expected type: BALANCE_SHEET, INCOME_STATEMENT, etc.
 * @param {string} [params.modelName='gemini-2.5-flash'] - Gemini model name
 * @returns {Promise<Object>} Structured JSON output adhering to FINANCIAL_EXTRACTION_SCHEMA
 */
export async function extractFinancialFactsWithGemini({
  imageBuffer,
  pageText = '',
  statementType,
  modelName = 'gemini-3.5-flash-lite',
}) {
  const ai = getGeminiClient();

  const prompt = `You are an expert forensic financial auditor and AAOIFI Shariah screening analyst specialized in Bangladesh financial statements (BSEC/DSE listed companies).

Carefully analyze the attached financial statement page image and text.
Expected Statement Type: ${statementType}

CRITICAL TABLE EXTRACTION DIRECTIVES:
1. ROW-BY-ROW HORIZONTAL ALIGNMENT:
   - You MUST read the table row by row from top to bottom.
   - For each row, trace horizontally from the row label on the left to the FIRST data column (Current Period, e.g. "30 June 2026").
   - Take extreme care not to shift rows up or down:
     * "Other income/(Expense)" is 10,353,100 (NOT General and admin expenses 396,490,144).
     * "Finance income" is 52,165,315 (NOT Finance costs 9,832,584).
     * "Total Equity" is 4,603,495,228 (NOT Retained earnings 4,036,495,228).
     * "Total Liabilities" is 4,843,330,274 (NOT Total Current Liabilities 4,703,262,556).

2. COLUMNS DISAMBIGUATION:
   - Bangladesh reports almost always have TWO or MORE columns: e.g. "30 June 2026" (CURRENT PERIOD) and "31 March 2026" or "30 June 2025" (COMPARATIVE PRIOR PERIOD).
   - You MUST extract values STRICTLY from the CURRENT PERIOD column (the first column of numbers immediately next to the Notes column).
   - NEVER extract numbers from the comparative/prior year column.

3. MANDATORY BALANCE SHEET ARITHMETIC VERIFICATION:
   - Total Assets MUST equal Total Liabilities + Total Equity.
   - Total Current Assets + Total Non Current Assets MUST equal Total Assets.
   - Total Non Current Liabilities + Total Current Liabilities MUST equal Total Liabilities.
   - If your extracted Total Equity + Total Liabilities does not equal Total Assets, re-read the page carefully to locate the exact "Total Equity" and "Total Liabilities" rows!

4. CONCEPT CODE MAPPING RULES:
   - "Revenue" or "Turnover" -> TOTAL_REVENUE
   - "Other income" -> OTHER_INCOME
   - "Finance income" or "Interest income" -> INTEREST_INCOME (isInterestBearing: true)
   - "Finance costs" or "Interest expense" -> INTEREST_EXPENSE
   - "Cash and cash equivalents" -> CASH_AND_EQUIVALENTS
   - "Lease liabilities" -> FINANCE_LEASE_LIABILITIES
   - "Short-term bank borrowings/loans" -> SHORT_TERM_LOANS_ON_INTEREST
   - "Long-term borrowings/loans" -> LONG_TERM_LOANS_ON_INTEREST
   - "Total Assets" -> TOTAL_ASSETS
   - "Total Liabilities" -> TOTAL_LIABILITIES
   - "Total Equity" -> TOTAL_EQUITY
   - "Profit for the period" -> NET_PROFIT
   - "Profit before tax" -> PROFIT_BEFORE_TAX
   - "Income tax expenses" -> TAX_EXPENSE
   - "Share capital" -> SHARE_CAPITAL
   - "Retained earnings" -> RETAINED_EARNINGS

5. TABLE UNIT SCALE DETERMINATION:
   - Look carefully at the printed numbers: if figures contain 8 or more digits with full comma separation (e.g. "49,891,967,210" or "1,743,186,382"), the unit scale is STRICTLY "units", NEVER "thousands" or "millions".
   - Only report "thousands" or "millions" if the table header explicitly specifies "Taka in thousands" or "in million BDT" AND the printed numbers are truncated.

Extracted page text tokens (for auxiliary context):
"""
${pageText.slice(0, 4000)}
"""`;

  const contents = [{ text: prompt }];

  if (imageBuffer) {
    contents.push({
      inlineData: {
        mimeType: 'image/png',
        data: imageBuffer.toString('base64'),
      },
    });
  }

  const maxRetries = 3;
  let attempt = 0;
  let lastError = null;

  while (attempt < maxRetries) {
    attempt++;
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: FINANCIAL_EXTRACTION_SCHEMA,
          temperature: 0.1,
        },
      });

      const responseText = response.text;
      return JSON.parse(responseText);
    } catch (err) {
      lastError = err;
      const isTransient = err.status === 503 || err.status === 429 || (err.message && err.message.includes('high demand'));
      if (isTransient && attempt < maxRetries) {
        const delay = attempt * 2500;
        console.warn(`Gemini API busy (status ${err.status}). Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        throw err;
      }
    }
  }

  throw lastError;
}
