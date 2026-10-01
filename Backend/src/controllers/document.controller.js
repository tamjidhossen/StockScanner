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

    const { companyId, financialPeriodId, reportType = 'ANNUAL', fiscalYear } = req.body;

    if (!companyId) {
      return res.status(400).json({
        success: false,
        message: 'companyId is required',
      });
    }

    // 1. Store PDF immutably
    const document = await storePdfDocument({
      fileBuffer: req.file.buffer,
      originalFilename: req.file.originalname,
      companyId,
      financialPeriodId: financialPeriodId || null,
      reportType,
      fiscalYear: fiscalYear || new Date().getFullYear().toString(),
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
