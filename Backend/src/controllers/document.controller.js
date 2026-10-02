import fs from 'fs';
import prisma from '../lib/prisma.js';
import { storePdfDocument } from '../services/storage.service.js';
import { inspectAndRenderDocument } from '../services/pdf-inspector.service.js';

export async function uploadDocument(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file uploaded. Please provide a file in the "file" field.',
      });
    }

    const { companyId, financialPeriodId, reportType = 'ANNUAL', fiscalYear, periodType } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    // Clean fiscalYear override if supplied
    const cleanFiscalYear = fiscalYear && typeof fiscalYear === 'string' && fiscalYear.trim().length > 0
      ? fiscalYear.trim()
      : (periodType && periodType !== 'ANNUAL' ? `${new Date().getFullYear() - 1}-${new Date().getFullYear()}` : new Date().getFullYear().toString());

    // 1. Resolve or pre-create FinancialPeriod based on company cycle if not explicitly passed
    let targetPeriodId = financialPeriodId;
    if (!targetPeriodId) {
      const company = await prisma.company.findUnique({ where: { id: companyId } });
      if (company) {
        const effectivePeriodType = (periodType || (reportType === 'QUARTERLY' ? 'Q1' : 'ANNUAL')).toUpperCase();
        const currentYear = new Date().getFullYear();
        let endYear = currentYear;
        if (cleanFiscalYear && cleanFiscalYear.includes('-')) {
          const parts = cleanFiscalYear.split('-');
          endYear = parseInt(parts[1], 10) || currentYear;
        } else if (cleanFiscalYear) {
          endYear = parseInt(cleanFiscalYear, 10) || currentYear;
        }

        const endCycle = (company.fiscalYearEnd || 'June').toLowerCase();
        let month = 6;
        let day = 30;
        let monthsDuration = 12;

        if (endCycle.includes('june')) {
          if (effectivePeriodType === 'Q1') { month = 9; day = 30; endYear = endYear - 1; monthsDuration = 3; }
          else if (effectivePeriodType === 'Q2') { month = 12; day = 31; endYear = endYear - 1; monthsDuration = 6; }
          else if (effectivePeriodType === 'Q3') { month = 3; day = 31; monthsDuration = 9; }
          else { month = 6; day = 30; monthsDuration = 12; }
        } else if (endCycle.includes('march')) {
          if (effectivePeriodType === 'Q1') { month = 6; day = 30; endYear = endYear - 1; monthsDuration = 3; }
          else if (effectivePeriodType === 'Q2') { month = 9; day = 30; endYear = endYear - 1; monthsDuration = 6; }
          else if (effectivePeriodType === 'Q3') { month = 12; day = 31; endYear = endYear - 1; monthsDuration = 9; }
          else { month = 3; day = 31; monthsDuration = 12; }
        } else {
          // December
          if (effectivePeriodType === 'Q1') { month = 3; day = 31; monthsDuration = 3; }
          else if (effectivePeriodType === 'Q2') { month = 6; day = 30; monthsDuration = 6; }
          else if (effectivePeriodType === 'Q3') { month = 9; day = 30; monthsDuration = 9; }
          else { month = 12; day = 31; monthsDuration = 12; }
        }

        const periodEnd = new Date(Date.UTC(endYear, month - 1, day));
        const periodStart = new Date(periodEnd);
        periodStart.setUTCMonth(periodStart.getUTCMonth() - monthsDuration);
        periodStart.setUTCDate(1);

        const period = await prisma.financialPeriod.upsert({
          where: {
            companyId_periodType_periodEnd: {
              companyId,
              periodType: effectivePeriodType,
              periodEnd,
            },
          },
          update: {
            fiscalYear: cleanFiscalYear,
            periodMonths: monthsDuration,
          },
          create: {
            companyId,
            periodType: effectivePeriodType,
            periodMonths: monthsDuration,
            isAudited: effectivePeriodType === 'ANNUAL',
            periodStart,
            periodEnd,
            fiscalYear: cleanFiscalYear,
          },
        });
        targetPeriodId = period.id;
      }
    }

    // 2. Store PDF immutably
    const document = await storePdfDocument({
      fileBuffer: req.file.buffer,
      originalFilename: req.file.originalname,
      companyId,
      financialPeriodId: targetPeriodId || null,
      reportType: periodType || reportType,
      fiscalYear: cleanFiscalYear,
    });

    // 2. Run page inspection and rendering
    const inspectionResult = await inspectAndRenderDocument(document.id);

    res.status(201).json({
      success: true,
      message: 'PDF successfully uploaded, verified, and inspected.',
      data: {
        document,
        inspection: inspectionResult,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocuments(req, res, next) {
  try {
    const { companyId, status } = req.query;

    const where = {};
    if (companyId) where.companyId = companyId;
    if (status) where.status = status;

    const documents = await prisma.document.findMany({
      where,
      include: {
        company: {
          select: {
            dseSymbol: true,
            name: true,
            sector: true,
          },
        },
        financialPeriod: true,
        extractionJobs: {
          take: 1,
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            pages: true,
            rawFacts: true,
          },
        },
      },
      orderBy: { uploadedAt: 'desc' },
    });

    res.json({
      success: true,
      data: documents,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocumentById(req, res, next) {
  try {
    const { id } = req.params;

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        company: true,
        financialPeriod: true,
        pages: {
          orderBy: { pageNumber: 'asc' },
        },
        extractionJobs: {
          orderBy: { createdAt: 'desc' },
        },
        _count: {
          select: {
            rawFacts: true,
          },
        },
      },
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: `Document with ID "${id}" not found`,
      });
    }

    res.json({
      success: true,
      data: document,
    });
  } catch (error) {
    next(error);
  }
}

export async function getDocumentPageImage(req, res, next) {
  try {
    const { id, pageNum } = req.params;

    const page = await prisma.documentPage.findUnique({
      where: {
        documentId_pageNumber: {
          documentId: id,
          pageNumber: parseInt(pageNum, 10),
        },
      },
    });

    if (!page || !page.imagePath || !fs.existsSync(page.imagePath)) {
      return res.status(404).json({
        success: false,
        message: `Page image for document ${id} page ${pageNum} not found`,
      });
    }

    res.setHeader('Content-Type', 'image/png');
    fs.createReadStream(page.imagePath).pipe(res);
  } catch (error) {
    next(error);
  }
}
