import fs from 'fs';
import path from 'path';
import prisma from '../src/lib/prisma.js';
import { storePdfDocument } from '../src/services/storage.service.js';
import { inspectAndRenderDocument } from '../src/services/pdf-inspector.service.js';

async function main() {
  const pdfPath = path.resolve('../MARICO_Audited_Financial_Statements_Q1_FY_2026_27.pdf');
  if (!fs.existsSync(pdfPath)) {
    console.error('Marico PDF not found at:', pdfPath);
    process.exit(1);
  }

  console.log('Reading Marico PDF from:', pdfPath);
  const fileBuffer = fs.readFileSync(pdfPath);
  console.log(`Read ${fileBuffer.length} bytes.`);

  // Find MARICO company
  const marico = await prisma.company.findUnique({
    where: { dseSymbol: 'MARICO' },
  });

  if (!marico) {
    console.error('MARICO company not found in DB!');
    process.exit(1);
  }

  console.log(`Found MARICO in database: ID=${marico.id}, name=${marico.name}`);

  // Create or find Q1 financial period
  const q1Period = await prisma.financialPeriod.upsert({
    where: {
      companyId_periodType_periodEnd: {
        companyId: marico.id,
        periodType: 'Q1',
        periodEnd: new Date('2026-06-30'),
      },
    },
    update: {},
    create: {
      companyId: marico.id,
      periodType: 'Q1',
      periodMonths: 3,
      isAudited: true, // Marked as audited by user
      periodStart: new Date('2026-04-01'),
      periodEnd: new Date('2026-06-30'),
      fiscalYear: '2026-2027',
    },
  });

  console.log(`Resolved Financial Period: ID=${q1Period.id}, type=${q1Period.periodType}`);

  // Store document immutably
  console.log('Storing PDF document immutably...');
  let document;
  try {
    document = await storePdfDocument({
      fileBuffer,
      originalFilename: 'MARICO_Audited_Financial_Statements_Q1_FY_2026_27.pdf',
      companyId: marico.id,
      financialPeriodId: q1Period.id,
      reportType: 'QUARTERLY',
      fiscalYear: '2026-2027',
    });
    console.log(`Document created: ID=${document.id}, SHA-256=${document.fileHash}`);
  } catch (err) {
    if (err.message.includes('Duplicate document detected')) {
      console.log('Document already stored. Finding existing...');
      const hash = (await import('crypto')).default.createHash('sha256').update(fileBuffer).digest('hex');
      document = await prisma.document.findUnique({ where: { fileHash: hash } });
      console.log(`Using existing Document ID: ${document.id}`);
    } else {
      throw err;
    }
  }

  // Inspect and render pages
  console.log('Inspecting and rendering pages with pdfjs-dist + sharp...');
  const inspection = await inspectAndRenderDocument(document.id);

  console.log('\n--- INSPECTION SUMMARY ---');
  console.log(`Total Pages: ${inspection.totalPages}`);
  console.log(`Financial Statement Pages Detected: ${inspection.financialPagesCount}`);
  console.log(`Extraction Job Queued: ${inspection.jobId}`);
  console.log('\nPage details:');
  for (const p of inspection.pages) {
    console.log(
      `  Page ${p.pageNumber}: type=${p.pageType}, content=${p.contentType}, rotated=${p.isRotated} (${p.rotationAngle}°), preview="${(p.rawTextPreview || '').slice(0, 60)}..."`
    );
  }
}

main()
  .catch((e) => {
    console.error('Verification failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
