import prisma from '../lib/prisma.js';
import logger from '../utils/logger.js';

export const getStocks = async (req, res, next) => {
  try {
    const { halalOnly, sector } = req.query;
    const where = {};

    if (halalOnly === 'true') {
      where.isHalal = true;
    }

    if (sector) {
      where.sector = sector;
    }

    const stocks = await prisma.stock.findMany({
      where,
      orderBy: { symbol: 'asc' },
    });

    res.json({
      success: true,
      count: stocks.length,
      data: stocks,
    });
  } catch (error) {
    next(error);
  }
};

export const getStockBySymbol = async (req, res, next) => {
  try {
    const { symbol } = req.params;
    const stock = await prisma.stock.findUnique({
      where: { symbol: symbol.toUpperCase() },
    });

    if (!stock) {
      return res.status(404).json({
        success: false,
        message: `Stock with symbol '${symbol}' not found`,
      });
    }

    res.json({
      success: true,
      data: stock,
    });
  } catch (error) {
    next(error);
  }
};
