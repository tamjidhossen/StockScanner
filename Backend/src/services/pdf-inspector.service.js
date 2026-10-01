import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { createCanvas } from '@napi-rs/canvas';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import prisma from '../lib/prisma.js';

const RENDERED_ROOT = path.resolve(process.cwd(), 'uploads', 'rendered');

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Classifies page content type based on keywords
 */
export function classifyPageContent(text) {
  const lower = text.toLowerCase();

  // Balance sheet / Statement of Financial Position
  if (
    lower.includes('statement of financial position') ||
    lower.includes('balance sheet') ||
    lower.includes('financial position') ||
    lower.includes('স্থিতিপত্র')
  ) {
    return 'BALANCE_SHEET';
  }

  // Income statement / Profit & Loss
  if (
    lower.includes('statement of profit or loss') ||
    lower.includes('profit or loss and other comprehensive') ||
    lower.includes('income statement') ||
    lower.includes('profit and loss account') ||
    lower.includes('লাভ-ক্ষতি') ||
    lower.includes('আয় বিবরণী')
  ) {
    return 'INCOME_STATEMENT';
  }

  // Cash flow
  if (
    lower.includes('statement of cash flows') ||
    lower.includes('cash flow statement') ||
    lower.includes('নগদ প্রবাহ')
  ) {
    return 'CASH_FLOW';
  }

  // Notes
  if (
    lower.includes('notes to the financial statements') ||
    lower.includes('notes to the interim') ||
    lower.includes('notes forming part of the financial') ||
    lower.includes('হিসাব সংক্রান্ত টীকা')
  ) {
    return 'NOTES';
  }

  return 'OTHER';
}

/**
 * Custom Canvas Factory for pdfjs-dist in Node.js
 */
class NodeCanvasFactory {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas,
      context,
    };
  }

  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }

  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * Analyzes and renders a document page-by-page
 *
 * @param {string} documentId - ID of Document record in database
 * @returns {Promise<Object>} Inspection summary
 */
export async function inspectAndRenderDocument(documentId) {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: { company: true },
  });

  if (!document) {
    throw new Error(`Document with ID "${documentId}" not found`);
  }

  const filePath = document.storedFilePath;
  if (!fs.existsSync(filePath)) {
    throw new Error(`PDF file not found at path: ${filePath}`);
  }

  // 1. Load PDF bytes
  const fileBytes = fs.readFileSync(filePath);
  const standardFontsPath = fs.existsSync(path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts'))
    ? path.join(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/'
    : path.join(process.cwd(), '..', 'node_modules', 'pdfjs-dist', 'standard_fonts') + '/';

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(fileBytes),
    canvasFactory: new NodeCanvasFactory(),
    standardFontDataUrl: standardFontsPath,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const totalPages = pdfDoc.numPages;

  // Update totalPages on Document
  await prisma.document.update({
    where: { id: documentId },
    data: { totalPages },
  });

  const docRenderDir = path.join(RENDERED_ROOT, documentId);
  ensureDir(docRenderDir);

  const pageRecords = [];
  let financialPagesCount = 0;

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const rawText = textContent.items.map((item) => item.str).join(' ').trim();
    const rotationAngle = page.rotate || 0;
    const isRotated = rotationAngle !== 0;

    // Determine page type
    let pageType = 'TEXT';
    if (rawText.length < 15) {
      pageType = 'SCANNED';
    } else if (rawText.length < 80) {
      pageType = 'MIXED';
    }

    // Determine content type
    const contentType = classifyPageContent(rawText);
    if (['BALANCE_SHEET', 'INCOME_STATEMENT', 'CASH_FLOW', 'NOTES'].includes(contentType)) {
      financialPagesCount++;
    }

    // Render page to PNG buffer
    let imagePath = null;
    try {
      // 1.5x scale provides crisp OCR and visual accuracy for Gemini Vision
      const viewport = page.getViewport({ scale: 1.5 });
      const canvasFactory = new NodeCanvasFactory();
      const canvasObj = canvasFactory.create(viewport.width, viewport.height);

      const renderContext = {
        canvasContext: canvasObj.context,
        viewport,
        canvasFactory,
      };

      await page.render(renderContext).promise;
      let imgBuffer = canvasObj.canvas.toBuffer('image/png');

      // Note: pdfjs-dist getViewport already applies page.rotate automatically to produce upright dimensions
      const outFileName = `page_${pageNum}.png`;
      const outPath = path.join(docRenderDir, outFileName);
      fs.writeFileSync(outPath, imgBuffer);
      imagePath = outPath;
    } catch (renderErr) {
      console.warn(`Could not render image for page ${pageNum} of ${documentId}:`, renderErr.message);
    }

    // Save DocumentPage record
    const pageRecord = await prisma.documentPage.upsert({
      where: {
        documentId_pageNumber: {
          documentId,
          pageNumber: pageNum,
        },
      },
      update: {
        pageType,
        contentType,
        isRotated,
        rotationAngle,
        imagePath,
        hasExtractedText: rawText.length > 0,
        rawTextPreview: rawText.slice(0, 250),
      },
      create: {
        documentId,
        pageNumber: pageNum,
        pageType,
        contentType,
        isRotated,
        rotationAngle,
        imagePath,
        hasExtractedText: rawText.length > 0,
        rawTextPreview: rawText.slice(0, 250),
      },
    });

    pageRecords.push(pageRecord);
  }

  // Create an ExtractionJob if financial pages were detected
  let job = null;
  if (financialPagesCount > 0) {
    job = await prisma.extractionJob.create({
      data: {
        documentId,
        status: 'PENDING',
        totalPages,
      },
    });

    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'QUEUED' },
    });
  }

  return {
    documentId,
    totalPages,
    financialPagesCount,
    jobId: job ? job.id : null,
    pages: pageRecords,
  };
}
