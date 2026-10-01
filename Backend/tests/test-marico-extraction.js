import dotenv from 'dotenv';
import path from 'path';

// Load .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import prisma from '../src/lib/prisma.js';
import { processPageExtraction } from '../src/services/extraction.service.js';
import { runAaoifiScreening } from '../src/services/screening/screening.service.js';

async function main() {
  console.log('Testing extraction with Gemini on Marico Q1 Audited report...');

  // Find Marico document
  const marico = await prisma.company.findUnique({
    where: { dseSymbol: 'MARICO' },
  });

  const doc = await prisma.document.findFirst({
    where: { companyId: marico.id },
    orderBy: { uploadedAt: 'desc' },
  });

  if (!doc) {
    console.error('No document found for MARICO');
    process.exit(1);
  }

  console.log(`Document ID: ${doc.id}`);

  // Find financial period
  const period = await prisma.financialPeriod.findFirst({
    where: { companyId: marico.id },
    orderBy: { periodEnd: 'desc' },
  });

  console.log(`Financial Period ID: ${period.id} (${period.fiscalYear} ${period.periodType})`);

  // Update Page 7 to BALANCE_SHEET and Page 8 to INCOME_STATEMENT
  await prisma.documentPage.update({
    where: {
      documentId_pageNumber: {
        documentId: doc.id,
        pageNumber: 7,
      },
    },
    data: { contentType: 'BALANCE_SHEET' },
  });

  await prisma.documentPage.update({
    where: {
      documentId_pageNumber: {
        documentId: doc.id,
        pageNumber: 8,
      },
    },
    data: { contentType: 'INCOME_STATEMENT' },
  });

  // Clean up prior test facts
  await prisma.normalizedFact.deleteMany({ where: { financialPeriodId: period.id } });
  await prisma.rawFact.deleteMany({ where: { documentId: doc.id } });
  await prisma.screeningRatioDetail.deleteMany({});
  await prisma.screeningResult.deleteMany({});

  // 1. Extract Page 7 (Balance Sheet)
  console.log('\n--- EXTRACTING PAGE 7 (STATEMENT OF FINANCIAL POSITION) ---');
  const resPage7 = await processPageExtraction({
    documentId: doc.id,
    pageNumber: 7,
    companyId: marico.id,
    financialPeriodId: period.id,
  });

  console.log(`Extracted ${resPage7.factsExtracted} facts from Page 7:`);
  for (const f of resPage7.facts) {
    console.log(
      `  • ${f.raw.rawLabel} -> ${f.normalized?.conceptCode || 'UNMAPPED'}: ${f.normalized?.normalizedValue?.toLocaleString() || f.raw.rawValue} BDT`
    );
  }

  // 2. Extract Page 8 (Income Statement)
  console.log('\n--- EXTRACTING PAGE 8 (STATEMENT OF PROFIT OR LOSS) ---');
  const resPage8 = await processPageExtraction({
    documentId: doc.id,
    pageNumber: 8,
    companyId: marico.id,
    financialPeriodId: period.id,
  });

  console.log(`Extracted ${resPage8.factsExtracted} facts from Page 8:`);
  for (const f of resPage8.facts) {
    console.log(
      `  • ${f.raw.rawLabel} -> ${f.normalized?.conceptCode || 'UNMAPPED'}: ${f.normalized?.normalizedValue?.toLocaleString() || f.raw.rawValue} BDT`
    );
  }

  // 3. Run Deterministic Screening Engine
  console.log('\n--- EXECUTING DETERMINISTIC AAOIFI SCREENING ---');
  // Marico market cap on DSE is approx 31,500,000 shares * ~2150 BDT = ~67,725 Million BDT
  const screening = await runAaoifiScreening({
    companyId: marico.id,
    financialPeriodId: period.id,
    customMarketData: {
      periodMarketCap: 67_725_000_000, // ~67.7 Billion BDT
      liveMarketCap: 68_000_000_000,
    },
  });

  console.log('\n================ SCREENING VERDICT ================');
  console.log(`Company: ${screening.company}`);
  console.log(`Overall Status: ${screening.overallStatus === 'COMPLIANT' ? '✅ COMPLIANT' : '❌ NON_COMPLIANT'}`);
  console.log(`Accounting Equation Check: ${screening.validation.allPassed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('\nRule 3/4/2 (Debt Ratio <= 30.0%):');
  console.log(`  Strict AAOIFI: ${screening.debt.strict.ratioPercent.toFixed(2)}% ${screening.debt.strict.passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Conservative (+leases): ${screening.debt.conservative.ratioPercent.toFixed(2)}% ${screening.debt.conservative.passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log('\nRule 3/4/3 (Deposits Ratio <= 30.0%):');
  console.log(`  Strict AAOIFI: ${screening.deposits.strict.ratioPercent.toFixed(2)}% ${screening.deposits.strict.passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  Conservative (+cash): ${screening.deposits.conservative.ratioPercent.toFixed(2)}% ${screening.deposits.conservative.passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log('\nRule 3/4/4 (Prohibited Income <= 5.0%):');
  console.log(`  Income Ratio: ${screening.income.ratioPercent.toFixed(2)}% ${screening.income.passes ? '✅ PASS' : '❌ FAIL'}`);
  console.log('\nRule 3/4/6 (Purification):');
  console.log(`  Purification per Share: ${screening.purification.purificationPerShare.toFixed(4)} BDT`);
  console.log('===================================================');
}

main()
  .catch((e) => {
    console.error('Extraction failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
