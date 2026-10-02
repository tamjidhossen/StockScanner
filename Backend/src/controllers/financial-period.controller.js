import prisma from '../lib/prisma.js';
import { deleteDocumentStorageFiles } from '../services/storage.service.js';

export async function getFinancialPeriods(req, res, next) {
  try {
    const { companyId } = req.query;

    const where = {};
    if (companyId) where.companyId = companyId;

    const periods = await prisma.financialPeriod.findMany({
      where,
      include: {
        company: {
          select: {
            dseSymbol: true,
            name: true,
          },
        },
        _count: {
          select: {
            documents: true,
            facts: true,
            screenings: true,
          },
        },
      },
      orderBy: { periodEnd: 'desc' },
    });

    res.json({
      success: true,
      data: periods,
    });
  } catch (error) {
    next(error);
  }
}

export async function createFinancialPeriod(req, res, next) {
  try {
    const {
      companyId,
      periodType, // "ANNUAL", "Q1", "Q2", "Q3", "H1"
      periodMonths = 12,
      isAudited = false,
      periodStart,
      periodEnd,
      fiscalYear,
    } = req.body;

    if (!companyId || !periodType || !periodStart || !periodEnd || !fiscalYear) {
      return res.status(400).json({
        success: false,
        message: 'companyId, periodType, periodStart, periodEnd, and fiscalYear are required',
      });
    }

    const period = await prisma.financialPeriod.create({
      data: {
        companyId,
        periodType,
        periodMonths: parseInt(periodMonths, 10),
        isAudited: Boolean(isAudited),
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        fiscalYear,
      },
    });

    res.status(201).json({
      success: true,
      data: period,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteFinancialPeriod(req, res, next) {
  try {
    const { id } = req.params;

    const period = await prisma.financialPeriod.findUnique({
      where: { id },
      include: {
        documents: true,
        company: true,
      },
    });

    if (!period) {
      return res.status(404).json({
        success: false,
        message: `FinancialPeriod with ID "${id}" not found`,
      });
    }

    // 1. Delete document files from disk
    for (const doc of period.documents) {
      deleteDocumentStorageFiles(doc.id, doc.storedFilePath);
    }

    // 2. Delete period (Prisma schema cascades facts and screenings)
    await prisma.financialPeriod.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: `Financial period "${period.fiscalYear} ${period.periodType}" and all its extracted facts and screening results have been deleted.`,
      data: {
        id: period.id,
        fiscalYear: period.fiscalYear,
        periodType: period.periodType,
      },
    });
  } catch (error) {
    next(error);
  }
}

