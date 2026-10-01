import prisma from '../lib/prisma.js';

export async function getFactsByPeriod(req, res, next) {
  try {
    const { periodId } = req.params;

    const facts = await prisma.normalizedFact.findMany({
      where: { financialPeriodId: periodId },
      include: {
        rawFact: true,
      },
      orderBy: [
        { pageNumber: 'asc' },
        { conceptCode: 'asc' },
      ],
    });

    res.json({
      success: true,
      count: facts.length,
      data: facts,
    });
  } catch (error) {
    next(error);
  }
}

export async function getRawFactsByDocument(req, res, next) {
  try {
    const { documentId } = req.params;

    const rawFacts = await prisma.rawFact.findMany({
      where: { documentId },
      include: {
        normalizedFact: true,
      },
      orderBy: { pageNumber: 'asc' },
    });

    res.json({
      success: true,
      count: rawFacts.length,
      data: rawFacts,
    });
  } catch (error) {
    next(error);
  }
}
