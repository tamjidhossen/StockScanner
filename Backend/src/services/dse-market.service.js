import prisma from '../lib/prisma.js';

const DSE_BASE_URL = 'https://www.dse.com.bd';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetches live ticker price from DSE live prices API
 *
 * @param {string} symbol - e.g. "GP", "MARICO", "SQURPHARMA"
 * @returns {Promise<Object>} Live price details
 */
export async function fetchLivePriceFromDse(symbol) {
  const cleanSymbol = symbol.trim().toUpperCase();
  const url = `${DSE_BASE_URL}/api/live/prices`;
  const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, Accept: 'application/json' } });

  if (!res.ok) {
    throw new Error(`DSE Live Prices API responded with HTTP ${res.status}`);
  }

  const data = await res.json();
  const cols = data.cols;
  const row = data.rows.find((r) => r[0] === cleanSymbol);

  if (!row) {
    throw new Error(`Symbol "${cleanSymbol}" not found in DSE live prices`);
  }

  const result = {};
  cols.forEach((col, idx) => {
    result[col] = row[idx];
  });

  return result;
}

/**
 * Fetches fundamental company profile and official market cap from DSE company page
 *
 * @param {string} symbol
 * @returns {Promise<Object>}
 */
export async function fetchCompanyFundamentalsFromDse(symbol) {
  const cleanSymbol = symbol.trim().toUpperCase();
  const url = `${DSE_BASE_URL}/company/${cleanSymbol}`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });

  if (!res.ok) {
    throw new Error(`Failed to fetch DSE company page for "${cleanSymbol}": HTTP ${res.status}`);
  }

  const html = await res.text();

  // Extract dt/dd definition list
  const dtDdPairs = {};
  const dtDdRegex = /<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gs;
  let match;
  while ((match = dtDdRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').trim();
    const val = match[2].replace(/<[^>]+>/g, '').trim();
    dtDdPairs[key] = val;
  }

  // Extract Stat Cards
  const cards = {};
  const cardRegex = /<div[^>]*class="[^"]*text-\[10\.5px\][^"]*"[^>]*>(.*?)<\/div>\s*<div[^>]*class="[^"]*text-\[15px\][^"]*"[^>]*>(.*?)<\/div>/gs;
  while ((match = cardRegex.exec(html)) !== null) {
    const label = match[1].replace(/<[^>]+>/g, '').trim();
    const value = match[2].replace(/<[^>]+>/g, '').trim();
    cards[label] = value;
  }

  const parseNumber = (str) => {
    if (!str) return 0;
    const cleaned = str.replace(/[^\d.-]/g, '');
    return parseFloat(cleaned) || 0;
  };

  const totalShares = parseInt(
    (dtDdPairs['Total outstanding securities'] || '0').replace(/,/g, ''),
    10
  );

  const marketCapMillionBDT = parseNumber(cards['Market cap']);
  const marketCapBaseBDT = marketCapMillionBDT * 1_000_000;
  const navPerShare = parseNumber(cards['NAV per share']);
  const peAudited = parseNumber(cards['P/E (audited)']);
  const paidUpCapitalMillionBDT = parseNumber(dtDdPairs['Paid-up capital']);
  const faceValue = parseNumber(dtDdPairs['Face value']) || 10;
  const listingYear = parseInt(dtDdPairs['Listing year'] || '0', 10);
  const yearEndMonth = dtDdPairs['Year-end'] || null;

  return {
    symbol: cleanSymbol,
    totalShares,
    marketCapMillionBDT,
    marketCapBaseBDT,
    navPerShare,
    peAudited,
    paidUpCapitalMillionBDT,
    faceValue,
    listingYear,
    yearEndMonth,
    rawCards: cards,
    rawDtDd: dtDdPairs,
  };
}

/**
 * Syncs DSE market data and company fundamentals into the SQLite database
 *
 * @param {string} symbol - e.g. "MARICO", "GP"
 * @returns {Promise<Object>} Synced MarketData record
 */
export async function syncDseMarketData(symbol) {
  const cleanSymbol = symbol.trim().toUpperCase();

  const company = await prisma.company.findUnique({
    where: { dseSymbol: cleanSymbol },
  });

  if (!company) {
    throw new Error(`Company "${cleanSymbol}" is not registered in StockScanner`);
  }

  // 1. Fetch live price
  const livePriceData = await fetchLivePriceFromDse(cleanSymbol);

  // 2. Fetch fundamentals (shares, market cap)
  const fundamentals = await fetchCompanyFundamentalsFromDse(cleanSymbol);

  const totalShares = fundamentals.totalShares > 0
    ? BigInt(fundamentals.totalShares)
    : company.totalShares;

  const closingPrice = livePriceData.ltp || livePriceData.close || 0;
  const marketCap = fundamentals.marketCapBaseBDT > 0
    ? fundamentals.marketCapBaseBDT
    : Number(totalShares) * closingPrice;

  // 3. Update Company model with latest shares and metrics
  await prisma.company.update({
    where: { id: company.id },
    data: {
      totalShares,
      paidUpCapMn: fundamentals.paidUpCapitalMillionBDT || company.paidUpCapMn,
      listingYear: fundamentals.listingYear || company.listingYear,
      fiscalYearEnd: fundamentals.yearEndMonth || company.fiscalYearEnd,
    },
  });

  // 4. Record MarketData snapshot
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const marketData = await prisma.marketData.create({
    data: {
      companyId: company.id,
      priceDate: today,
      closingPrice,
      sharesOutstanding: totalShares,
      marketCap,
      marketCap12mAvg: marketCap, // Can be refined when full history exists
      source: 'DSE_LIVE',
    },
  });

  return {
    company: company.dseSymbol,
    closingPrice,
    totalShares: totalShares.toString(),
    marketCap,
    marketCapMillionBDT: (marketCap / 1_000_000).toFixed(2),
    navPerShare: fundamentals.navPerShare,
    peAudited: fundamentals.peAudited,
    marketDataRecordId: marketData.id,
  };
}
