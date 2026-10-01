import prisma from '../lib/prisma.js';
import { runAaoifiScreening } from '../services/screening/screening.service.js';

export async function triggerScreening(req, res, next) {
  try {
    const { companyId, periodId } = req.params;

    const result = await runAaoifiScreening({
      companyId,
      financialPeriodId: periodId,
    });

    res.status(201).json({
      success: true,
      message: 'AAOIFI Screening executed successfully',
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getLatestScreeningResult(req, res, next) {
  try {
    const { symbol } = req.params;

    const company = await prisma.company.findUnique({
      where: { dseSymbol: symbol.toUpperCase() },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company "${symbol}" not found`,
      });
    }

    const latestScreening = await prisma.screeningResult.findFirst({
      where: { companyId: company.id },
      orderBy: { screeningDate: 'desc' },
      include: {
        financialPeriod: true,
        ratioDetails: true,
      },
    });

    if (!latestScreening) {
      return res.status(404).json({
        success: false,
        message: `No screening results found for "${symbol}" yet. Please run screening first.`,
      });
    }

    // Parse ratio details JSON breakdowns
    const formattedDetails = latestScreening.ratioDetails.map((detail) => ({
      ...detail,
      numeratorBreakdown: JSON.parse(detail.numeratorBreakdown || '{}'),
      sourceFactIds: JSON.parse(detail.sourceFactIds || '[]'),
    }));

    res.json({
      success: true,
      data: {
        ...latestScreening,
        methodologyNotes: JSON.parse(latestScreening.methodologyNotes || '{}'),
        ratioDetails: formattedDetails,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getScreeningHistory(req, res, next) {
  try {
    const { symbol } = req.params;

    const company = await prisma.company.findUnique({
      where: { dseSymbol: symbol.toUpperCase() },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company "${symbol}" not found`,
      });
    }

    const history = await prisma.screeningResult.findMany({
      where: { companyId: company.id },
      orderBy: { screeningDate: 'desc' },
      include: {
        financialPeriod: true,
        ratioDetails: true,
      },
    });

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    next(error);
  }
}
