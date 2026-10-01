import prisma from '../lib/prisma.js';
import { syncDseMarketData, fetchLivePriceFromDse, fetchCompanyFundamentalsFromDse } from '../services/dse-market.service.js';

export async function syncCompanyMarketData(req, res, next) {
  try {
    const { symbol } = req.params;
    const result = await syncDseMarketData(symbol);

    res.json({
      success: true,
      message: `Market data for ${symbol.toUpperCase()} successfully synced from DSE`,
      data: result,
    });
  } catch (error) {
    next(error);
  }
}

export async function getLiveQuote(req, res, next) {
  try {
    const { symbol } = req.params;
    const quote = await fetchLivePriceFromDse(symbol);

    res.json({
      success: true,
      data: quote,
    });
  } catch (error) {
    next(error);
  }
}

export async function getCompanyMarketDataHistory(req, res, next) {
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

    const records = await prisma.marketData.findMany({
      where: { companyId: company.id },
      orderBy: { priceDate: 'desc' },
      take: 30,
    });

    res.json({
      success: true,
      data: JSON.parse(
        JSON.stringify(records, (key, value) =>
          typeof value === 'bigint' ? value.toString() : value
        )
      ),
    });
  } catch (error) {
    next(error);
  }
}
