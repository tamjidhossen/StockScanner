import prisma from '../lib/prisma.js';
import { processPageExtraction } from '../services/extraction.service.js';
import { runAaoifiScreening } from '../services/screening/screening.service.js';

let isWorkerRunning = false;
let pollingTimer = null;

const SLEEP_MS_BETWEEN_PAGES = 1500;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Processes a single extraction job
 */
export async function processJob(jobId) {
  const job = await prisma.extractionJob.findUnique({
    where: { id: jobId },
    include: {
      document: {
        include: {
          company: true,
          pages: {
            orderBy: { pageNumber: 'asc' },
          },
        },
      },
    },
  });

  if (!job || job.status !== 'PENDING') return;

  // Mark PROCESSING
  await prisma.extractionJob.update({
    where: { id: jobId },
    data: {
      status: 'PROCESSING',
      startedAt: new Date(),
      attempts: { increment: 1 },
    },
  });

  await prisma.document.update({
    where: { id: job.documentId },
    data: { status: 'PROCESSING' },
  });

  try {
    const document = job.document;
    const targetPages = document.pages.filter((p) =>
      ['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'NOTES'].includes(p.contentType)
    );

    let totalFactsCount = 0;
    let pagesProcessed = 0;

    for (const page of targetPages) {
      const result = await processPageExtraction({
        documentId: document.id,
        pageNumber: page.pageNumber,
        companyId: document.companyId,
        financialPeriodId: document.financialPeriodId,
      });

      totalFactsCount += result.factsExtracted;
      pagesProcessed++;

      await prisma.extractionJob.update({
        where: { id: jobId },
        data: {
          pagesProcessed,
          factsExtracted: totalFactsCount,
        },
      });

      // Politeness sleep between page calls
      await sleep(SLEEP_MS_BETWEEN_PAGES);
    }

    // Mark COMPLETED
    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date(),
        pagesProcessed,
        factsExtracted: totalFactsCount,
      },
    });

    await prisma.document.update({
      where: { id: document.id },
      data: {
        status: 'EXTRACTED',
        processedAt: new Date(),
      },
    });

    console.log(
      `Job ${jobId} completed successfully: extracted ${totalFactsCount} facts across ${pagesProcessed} financial pages.`
    );

    // Automatically trigger AAOIFI Screening if financial period is resolved
    const freshDoc = await prisma.document.findUnique({
      where: { id: document.id },
    });
    if (freshDoc && freshDoc.financialPeriodId) {
      try {
        console.log(`Auto-running AAOIFI screening for company ${freshDoc.companyId} period ${freshDoc.financialPeriodId}...`);
        await runAaoifiScreening({
          companyId: freshDoc.companyId,
          financialPeriodId: freshDoc.financialPeriodId,
        });
        console.log(`Auto-screening succeeded for document ${document.id}`);
      } catch (screenErr) {
        console.warn(`Auto-screening deferred: ${screenErr.message}`);
      }
    }
  } catch (err) {
    console.error(`Job ${jobId} failed:`, err.message);

    await prisma.extractionJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        failureReason: err.message,
        completedAt: new Date(),
      },
    });

    await prisma.document.update({
      where: { id: job.documentId },
      data: {
        status: 'FAILED',
        failureReason: err.message,
      },
    });
  }
}

/**
 * Worker loop iteration
 */
async function workerTick() {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  try {
    const nextJob = await prisma.extractionJob.findFirst({
      where: { status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });

    if (nextJob) {
      await processJob(nextJob.id);
    }
  } catch (pollErr) {
    console.error('Extraction worker loop error:', pollErr.message);
  } finally {
    isWorkerRunning = false;
  }
}

/**
 * Starts the SQLite extraction background worker
 */
export function startExtractionWorker(pollIntervalMs = 3000) {
  if (pollingTimer) return;
  console.log(`Starting SQLite extraction worker (poll interval: ${pollIntervalMs}ms)...`);
  pollingTimer = setInterval(workerTick, pollIntervalMs);
  // Also run immediately
  workerTick();
}

/**
 * Stops the worker
 */
export function stopExtractionWorker() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    console.log('Extraction worker stopped.');
  }
}
