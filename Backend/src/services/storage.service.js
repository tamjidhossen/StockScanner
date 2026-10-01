import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads', 'reports');

/**
 * Ensures a directory exists synchronously
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Validates PDF magic bytes (%PDF)
 */
export function isPdfBuffer(buffer) {
  if (!buffer || buffer.length < 5) return false;
  const magic = buffer.subarray(0, 5).toString('ascii');
  return magic.startsWith('%PDF-');
}

/**
 * Computes SHA-256 checksum of a buffer
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Stores an uploaded PDF file immutably and creates a Document record
 *
 * @param {Object} params
 * @param {Buffer} params.fileBuffer - Raw uploaded PDF buffer
 * @param {string} params.originalFilename - Original filename
 * @param {string} params.companyId - ID of the target company
 * @param {string} [params.financialPeriodId] - ID of financial period if pre-associated
 * @param {string} params.reportType - "ANNUAL" or "QUARTERLY"
 * @param {string} [params.fiscalYear] - e.g. "2024" or "2024-2025"
 * @returns {Promise<Object>} Created Document record
 */
export async function storePdfDocument({
  fileBuffer,
  originalFilename,
  companyId,
  financialPeriodId = null,
  reportType,
  fiscalYear = new Date().getFullYear().toString(),
}) {
  // 1. Verify PDF magic bytes
  if (!isPdfBuffer(fileBuffer)) {
    throw new Error('Invalid file format: file does not match PDF specification (%PDF header missing)');
  }

  // 2. Compute SHA-256 hash
  const fileHash = computeSha256(fileBuffer);

  // 3. Duplicate check
  const existing = await prisma.document.findUnique({
    where: { fileHash },
    include: { company: true },
  });

  if (existing) {
    throw new Error(
      `Duplicate document detected: This exact PDF file has already been uploaded for company ${existing.company.dseSymbol} (Document ID: ${existing.id})`
    );
  }

  // 4. Verify company exists
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error(`Company with ID "${companyId}" not found`);
  }

  // 5. Build storage directory: uploads/reports/{dseSymbol}/{fiscalYear}/
  const targetDir = path.join(UPLOADS_ROOT, company.dseSymbol.toUpperCase(), fiscalYear);
  ensureDir(targetDir);

  const targetFilePath = path.join(targetDir, `${fileHash}.pdf`);

  // 6. Write file immutably to disk (fail if already exists)
  fs.writeFileSync(targetFilePath, fileBuffer, { flag: 'wx' });

  // 7. Create Document record in DB
  const document = await prisma.document.create({
    data: {
      companyId: company.id,
      financialPeriodId,
      reportType,
      originalFilename,
      storedFilePath: targetFilePath,
      fileHash,
      totalPages: 0, // Will be updated by pdf inspector
      status: 'UPLOADED',
    },
  });

  return document;
}
