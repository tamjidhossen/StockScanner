# Dhaka Stock Exchange (DSE) API & Data Extraction Reference

This document provides a comprehensive technical reference for integrating real-time market data, company metrics, historical financials, and PDF filings directly from Dhaka Stock Exchange (`https://www.dse.com.bd`).

The new DSE platform runs on **Next.js (App Router)** with server-rendered React Server Components (RSC) and dedicated JSON API micro-routes.

---

## 1. Executive Summary of Available Endpoints

| Category | Endpoint / Pattern | Method | Type | Key Information |
|---|---|---|---|---|
| **Live Ticker Prices** | `/api/live/prices` | GET | Pure JSON | All 634+ instruments: `ltp`, `close`, `ycp`, `high`, `low`, `volume`, `trades`, `category`, `sector` |
| **Market Summary** | `/api/live/market` | GET | Pure JSON | Indices (`DSEX`, `DS30`, `DSES`), market breadth, total market cap, market turnover, session status |
| **Company Quotes** | `/api/live/companies/quotes` | GET | Pure JSON | Tickers with company names, current prices, and percentage changes |
| **Company Deep Profile** | `/company/{SYMBOL}` | GET | SSR / RSC Payload | **Market Cap**, **Total Outstanding Shares**, **Paid-up Capital**, **NAV**, **52-week High/Low**, **Loan Status**, **Year-end Month**, multi-year financials |
| **Corporate Disclosures** | `/api/live/company-disclosures` | GET | Pure JSON | Real-time regulatory price sensitive info (PSI) and corporate announcements |
| **Filings / Documents** | `/api/auditorfilings/file/{id}`<br/>`/api/pdf-stream?url=...` | GET | Stream / PDF | Official audited annual reports, quarterly filings, and PSI PDF documents |

---

## 2. Endpoint Specifications

### 2.1 Live Prices Endpoint (`/api/live/prices`)

Returns real-time trading quotes for all listed instruments on the Dhaka Stock Exchange.

- **URL**: `https://www.dse.com.bd/api/live/prices`
- **Method**: `GET`
- **Headers**:
  ```http
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  Accept: application/json
  ```
- **Response Structure**:
  ```json
  {
    "cols": [
      "code",
      "ltp",
      "ycp",
      "open",
      "high",
      "low",
      "close",
      "volume",
      "value",
      "trades",
      "percent",
      "category",
      "board",
      "sector",
      "assetType"
    ],
    "rows": [
      [
        "GP",
        241.1,
        241.6,
        242.0,
        242.0,
        241.0,
        241.1,
        58099,
        14.025,
        719,
        -0.20695364,
        "A",
        "PUBLIC",
        "Telecom",
        "EQ"
      ],
      [
        "SQURPHARMA",
        218.3,
        218.0,
        218.4,
        218.8,
        218.0,
        218.3,
        278295,
        60.759,
        1280,
        0.13761468,
        "A",
        "PUBLIC",
        "PharmaChem",
        "EQ"
      ]
    ],
    "session": {
      "isOpen": false,
      "phase": "closed",
      "date": "2026-10-01"
    }
  }
  ```

#### Field Dictionary:
- `code` *(string)*: Trading symbol/scrip (e.g. `GP`, `SQURPHARMA`, `BATBC`).
- `ltp` *(number)*: Last Traded Price in BDT.
- `ycp` *(number)*: Yesterday's Closing Price in BDT.
- `open` / `high` / `low` / `close` *(number)*: Day's price points.
- `volume` *(number)*: Total number of shares traded today.
- `value` *(number)*: Turnover value in **Million BDT**.
- `trades` *(number)*: Total number of transactions executed.
- `percent` *(number)*: Percentage change relative to `ycp`.
- `category` *(string)*: Settlement category (`A` = regular dividend payers, `B`, `N` = new, `Z` = poor performance/defaulters).
- `board` *(string)*: `PUBLIC` (Main Board), `SME` (Small & Medium Enterprise), or `ATB` (Alternative Trading Board).
- `sector` *(string)*: Industry sector (e.g., `Telecom`, `PharmaChem`, `Bank`, `FoodAllied`).
- `assetType` *(string)*: `EQ` (Equity), `MF` (Mutual Fund), `TB` (Treasury Bond), `DB` (Debenture).

---

### 2.2 Market Overview Endpoint (`/api/live/market`)

Returns index levels, overall exchange statistics, and top market movers.

- **URL**: `https://www.dse.com.bd/api/live/market`
- **Method**: `GET`
- **Response Highlights**:
  ```json
  {
    "indices": [
      { "key": "DSEX", "value": 5531.65, "change": -18.79, "percent": -0.34, "prev": 5550.44 },
      { "key": "DS30", "value": 2103.55, "change": -4.90, "percent": -0.23, "prev": 2108.45 },
      { "key": "DSES", "value": 1100.26, "change": -2.24, "percent": -0.20, "prev": 1102.49 }
    ],
    "totals": {
      "trades": 184783,
      "volume": 229693572,
      "turnover": 7231.11,
      "marketCap": 6859357558647,
      "tradeTime": "Oct 01, 2026 at 2:40 PM"
    },
    "breadth": { "advanced": 85, "declined": 242, "unchanged": 58, "traded": 385 },
    "session": {
      "isOpen": false,
      "phase": "closed",
      "tradingDay": true,
      "opening": "10:00",
      "closing": "14:00",
      "date": "2026-10-01"
    },
    "movers": {
      "gainers": [...],
      "losers": [...]
    }
  }
  ```

---

### 2.3 Company Details & Profile Extraction (`/company/{SYMBOL}`)

The company profile URL (e.g., `https://www.dse.com.bd/company/GP`) contains complete fundamental data. Because the page is built with Next.js App Router, the data exists in two easily accessible formats:

#### Format A: HTML DOM Elements (Quick & Resilient)

1. **Definition List Key-Value Pairs (`<dt>` and `<dd>`)**:
   - `Listing year`: `2009`
   - `Authorized Capital (mn)`: `BDT 40,000`
   - `Paid-up capital`: `BDT 13,503.00 mn`
   - `Face value`: `BDT 10.00`
   - `Total outstanding securities`: `1,350,300,022`
   - `Market Lot`: `1`
   - `Present Operational Status`: `Active`
   - `Loan status`: `Short-term: BDT 7,000.00 mn · Long-term: —`
   - `Year-end`: `December` (or `June`)
   - `Head Office / Registered Office`: Address string
   - `Contact Phone`, `E-mail`, `Company Secretary Name`, `Website`

2. **Stat Cards (CSS classes: `text-[10.5px]` label + `text-[15px]` value)**:
   - `Market cap`: `BDT 325,557.34 mn`
   - `Free float market cap`: `BDT 32,578.75 mn`
   - `NAV per share`: `BDT 41.49`
   - `P/E (audited)`: `11.01x`
   - `Day's value`: `BDT 14 mn`
   - `Day's volume`: `58,099`
   - `Day's trades`: `719`
   - `Opening price`: `BDT 242.00`
   - `Adjusted Opening Price`: `BDT 241.60`
   - `Last Update`: `02:09:41 PM`

#### Format B: Next.js React Server Component (RSC) Payload

In the raw HTML source, Next.js hydration chunks are pushed via:
```javascript
self.__next_f.push([1, "chunk_content_here"])
```

Chunk 9 (or whichever chunk contains `"multiYearFinancials"`) contains a rich unescaped JSON object containing:
- `marketCap`: `325557.34` (in million BDT)
- `freeFloatMarketCap`: `32578.75`
- `paidUpCapital`: `13503.0`
- `faceValue`: `10.0`
- `listingYear`: `2009`
- `weekHigh52` / `weekLow52`: 52-week price range
- `pe`: Audited price to earnings ratio
- `nav`: Net asset value per share
- `loanStatus`: `{ shortTerm: 7000.0, longTerm: 0 }`
- `interimFinancials`: Quarterly EPS and NAV progression
- `multiYearFinancials`: Historical multi-year audited figures (2018–2025)
- `dividendHistory`: Historical cash and stock dividends with yields
- `sharePattern`: Historical sponsor/director, institutional, foreign, and public holdings percentages

---

## 3. Market Capitalization Arithmetic Verification

The Market Capitalization on DSE is deterministically calculated as:
$$\text{Market Capitalization} = \text{Last Traded Price (LTP)} \times \text{Total Outstanding Securities}$$

**Example for GP (Grameenphone)**:
- $\text{LTP} = 241.10\text{ BDT}$
- $\text{Total Outstanding Securities} = 1,350,300,022\text{ shares}$
- $\text{Calculated Market Cap} = 241.10 \times 1,350,300,022 = 325,557,335,304.2\text{ BDT} = \mathbf{325,557.34\text{ mn BDT}}$
- Matches the official DSE stat card `BDT 325,557.34 mn` down to the last decimal!

---

## 4. Production Node.js Integration Module

Here is the production-ready Node.js service for StockScanner to fetch DSE market data without external dependencies (pure `fetch` + regex):

```javascript
/**
 * dse-market-data.service.js
 * High-performance, zero-dependency DSE data client for Node.js
 */

const DSE_BASE_URL = 'https://www.dse.com.bd';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

/**
 * Fetch live trading prices for all instruments
 * @returns {Promise<Map<string, Object>>} Map of symbol -> price details
 */
export async function fetchLivePrices() {
  const url = `${DSE_BASE_URL}/api/live/prices`;
  const res = await fetch(url, { headers: { ...DEFAULT_HEADERS, Accept: 'application/json' } });
  
  if (!res.ok) {
    throw new Error(`DSE Live Prices API failed with HTTP ${res.status}`);
  }
  
  const data = await res.json();
  const cols = data.cols;
  const priceMap = new Map();

  for (const row of data.rows) {
    const item = {};
    cols.forEach((colName, index) => {
      item[colName] = row[index];
    });
    priceMap.set(item.code, item);
  }

  return priceMap;
}

/**
 * Fetch detailed company fundamentals and market cap directly from DSE company page
 * @param {string} symbol - e.g. 'GP', 'SQURPHARMA'
 * @returns {Promise<Object>} Comprehensive company metrics
 */
export async function fetchCompanyDetails(symbol) {
  const cleanSymbol = symbol.trim().toUpperCase();
  const url = `${DSE_BASE_URL}/company/${cleanSymbol}`;
  const res = await fetch(url, { headers: DEFAULT_HEADERS });

  if (!res.ok) {
    throw new Error(`Failed to fetch DSE company page for ${cleanSymbol}: HTTP ${res.status}`);
  }

  const html = await res.text();

  // 1. Extract dt/dd definition list items
  const dtDdPairs = {};
  const dtDdRegex = /<dt[^>]*>(.*?)<\/dt>\s*<dd[^>]*>(.*?)<\/dd>/gs;
  let match;
  while ((match = dtDdRegex.exec(html)) !== null) {
    const key = match[1].replace(/<[^>]+>/g, '').trim();
    const val = match[2].replace(/<[^>]+>/g, '').trim();
    dtDdPairs[key] = val;
  }

  // 2. Extract Stat Cards
  const cards = {};
  const cardRegex = /<div[^>]*class="[^"]*text-\[10\.5px\][^"]*"[^>]*>(.*?)<\/div>\s*<div[^>]*class="[^"]*text-\[15px\][^"]*"[^>]*>(.*?)<\/div>/gs;
  while ((match = cardRegex.exec(html)) !== null) {
    const label = match[1].replace(/<[^>]+>/g, '').trim();
    const value = match[2].replace(/<[^>]+>/g, '').trim();
    cards[label] = value;
  }

  // 3. Extract Embedded RSC JSON values (52-week high/low, loan status, etc.)
  const rscMatches = html.matchAll(/self\.__next_f\.push\(\[1,\s*"([\s\S]*?)"\]\)/g);
  let weekHigh52 = null;
  let weekLow52 = null;
  let loanStatus = null;

  for (const rscMatch of rscMatches) {
    const chunk = rscMatch[1];
    if (chunk.includes('weekHigh52') || chunk.includes('loanStatus')) {
      const highM = chunk.match(/"weekHigh52":\s*([0-9.]+)/);
      const lowM = chunk.match(/"weekLow52":\s*([0-9.]+)/);
      if (highM) weekHigh52 = parseFloat(highM[1]);
      if (lowM) weekLow52 = parseFloat(lowM[1]);
      
      const loanM = chunk.match(/"loanStatus":\s*(\{[^}]+\})/);
      if (loanM) {
        try {
          loanStatus = JSON.parse(loanM[1].replace(/\\"/g, '"'));
        } catch (_) {}
      }
    }
  }

  // Parse numeric values
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
    weekHigh52,
    weekLow52,
    loanStatusSummary: dtDdPairs['Loan status'] || null,
    loanStatusRaw: loanStatus,
    operationalStatus: dtDdPairs['Present Operational Status'] || 'Active',
    registeredOffice: dtDdPairs['Head Office / Registered Office'] || null,
    fetchedAt: new Date().toISOString(),
  };
}
```

---

## 5. Handling Inactive Market Hours & Caching Strategy

- **DSE Market Hours**: Sunday through Thursday, 10:00 AM to 02:00 PM (BST / UTC+6).
- **Post-Closing / Off-Hours**: Outside trading hours, `/api/live/prices` retains the day's final closing prices (`close` / `ltp`).
- **Caching in SQLite**:
  - Live prices: cache for 60 seconds during market hours; 1 hour off-market.
  - Company fundamentals (shares outstanding, listing year, paid-up capital): cache for 24 hours (shares change only on corporate actions / dividends).
  - When running an AAOIFI screening, if the user requests "Current Live Market Cap", query DSE directly; if the user selects "Report Date Market Cap", use the closing price as of the balance sheet date stored in the local `MarketData` table.
