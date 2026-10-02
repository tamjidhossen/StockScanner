import prisma from '../lib/prisma.js';
import { deleteCompanyStorageFiles } from '../services/storage.service.js';

/**
 * Helper to safely serialize BigInts to string in JSON responses
 */
function serializeBigInt(obj) {
  return JSON.parse(
    JSON.stringify(obj, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    )
  );
}

export async function getCompanies(req, res, next) {
  try {
    const companies = await prisma.company.findMany({
      include: {
        _count: {
          select: {
            documents: true,
            periods: true,
            screenings: true,
          },
        },
        screenings: {
          take: 1,
          orderBy: { screeningDate: 'desc' },
          select: {
            overallStatus: true,
            screeningDate: true,
            purificationPerShare: true,
          },
        },
      },
      orderBy: { dseSymbol: 'asc' },
    });

    res.json({
      success: true,
      data: serializeBigInt(companies),
    });
  } catch (error) {
    next(error);
  }
}

export async function getCompanyBySymbol(req, res, next) {
  try {
    const { symbol } = req.params;
    const company = await prisma.company.findUnique({
      where: { dseSymbol: symbol.toUpperCase() },
      include: {
        periods: {
          orderBy: { periodEnd: 'desc' },
          include: {
            screenings: {
              take: 1,
              orderBy: { screeningDate: 'desc' },
              include: { ratioDetails: true },
            },
          },
        },
        documents: {
          orderBy: { uploadedAt: 'desc' },
          include: {
            pages: {
              select: {
                pageNumber: true,
                pageType: true,
                contentType: true,
                isRotated: true,
              },
            },
            extractionJobs: {
              take: 1,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        marketData: {
          take: 10,
          orderBy: { priceDate: 'desc' },
        },
        screenings: {
          take: 5,
          orderBy: { screeningDate: 'desc' },
          include: { ratioDetails: true },
        },
      },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company with symbol "${symbol}" not found`,
      });
    }

    res.json({
      success: true,
      data: serializeBigInt(company),
    });
  } catch (error) {
    next(error);
  }
}

export async function createCompany(req, res, next) {
  try {
    const {
      dseSymbol,
      name,
      sector,
      fiscalYearEnd = 'June',
      listingYear,
      faceValue = 10.0,
      totalShares,
      paidUpCapMn,
      authorizedCapMn,
    } = req.body;

    if (!dseSymbol || !name || !sector) {
      return res.status(400).json({
        success: false,
        message: 'dseSymbol, name, and sector are required fields',
      });
    }

    const company = await prisma.company.create({
      data: {
        dseSymbol: dseSymbol.toUpperCase().trim(),
        name: name.trim(),
        sector: sector.trim(),
        fiscalYearEnd,
        listingYear: listingYear ? parseInt(listingYear, 10) : null,
        faceValue: faceValue ? parseFloat(faceValue) : 10.0,
        totalShares: totalShares ? BigInt(totalShares) : null,
        paidUpCapMn: paidUpCapMn ? parseFloat(paidUpCapMn) : null,
        authorizedCapMn: authorizedCapMn ? parseFloat(authorizedCapMn) : null,
      },
    });

    res.status(201).json({
      success: true,
      data: serializeBigInt(company),
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteCompany(req, res, next) {
  try {
    const { id } = req.params;

    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { id },
          { dseSymbol: id.toUpperCase() },
        ],
      },
      include: {
        documents: true,
      },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company "${id}" not found`,
      });
    }

    // 1. Clean up physical files from disk
    deleteCompanyStorageFiles(company.dseSymbol, company.documents);

    // 2. Delete company (Prisma schema cascades all related records)
    await prisma.company.delete({
      where: { id: company.id },
    });

    res.json({
      success: true,
      message: `Company "${company.name} (${company.dseSymbol})" and all associated reports, facts, screenings, and files have been permanently deleted`,
      data: {
        id: company.id,
        dseSymbol: company.dseSymbol,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function purgeCompanyData(req, res, next) {
  try {
    const { id } = req.params;

    const company = await prisma.company.findFirst({
      where: {
        OR: [
          { id },
          { dseSymbol: id.toUpperCase() },
        ],
      },
      include: {
        documents: true,
      },
    });

    if (!company) {
      return res.status(404).json({
        success: false,
        message: `Company "${id}" not found`,
      });
    }

    // 1. Clean up physical files from disk
    deleteCompanyStorageFiles(company.dseSymbol, company.documents);

    // 2. Cascade delete all company child data while retaining the Company entity
    await prisma.$transaction([
      prisma.screeningRatioDetail.deleteMany({
        where: {
          screeningResult: { companyId: company.id },
        },
      }),
      prisma.screeningResult.deleteMany({
        where: { companyId: company.id },
      }),
      prisma.normalizedFact.deleteMany({
        where: { companyId: company.id },
      }),
      prisma.rawFact.deleteMany({
        where: {
          document: { companyId: company.id },
        },
      }),
      prisma.documentPage.deleteMany({
        where: {
          document: { companyId: company.id },
        },
      }),
      prisma.extractionJob.deleteMany({
        where: {
          document: { companyId: company.id },
        },
      }),
      prisma.document.deleteMany({
        where: { companyId: company.id },
      }),
      prisma.financialPeriod.deleteMany({
        where: { companyId: company.id },
      }),
      prisma.marketData.deleteMany({
        where: { companyId: company.id },
      }),
    ]);

    res.json({
      success: true,
      message: `All reports, facts, screenings, and market data for "${company.dseSymbol}" have been purged. Company reset to initial state.`,
      data: {
        id: company.id,
        dseSymbol: company.dseSymbol,
      },
    });
  } catch (error) {
    next(error);
  }
}

