import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchLivePriceFromDse,
  fetchCompanyFundamentalsFromDse,
  syncDseMarketData,
} from '../../src/services/dse-market.service.js';
import prisma from '../../src/lib/prisma.js';

// Mock prisma
vi.mock('../../src/lib/prisma.js', () => {
  return {
    default: {
      company: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      marketData: {
        create: vi.fn(),
      },
    },
  };
});

describe('DSE Market Service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchLivePriceFromDse', () => {
    it('fetches and maps live price columns for a valid symbol', async () => {
      const mockLiveResponse = {
        cols: ['tradingCode', 'ltp', 'high', 'low', 'close', 'ycp', 'change', 'trade', 'value', 'volume'],
        rows: [
          ['MARICO', '2165.40', '2180.00', '2150.00', '2165.40', '2160.00', '5.40', '210', '15.42', '7120'],
          ['GP', '280.50', '285.00', '279.00', '280.50', '281.00', '-0.50', '850', '45.10', '160500'],
        ],
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockLiveResponse,
      });

      const price = await fetchLivePriceFromDse('MARICO');
      expect(price.tradingCode).toBe('MARICO');
      expect(price.ltp).toBe('2165.40');
      expect(price.close).toBe('2165.40');
      expect(price.ycp).toBe('2160.00');
    });

    it('throws error when symbol is not in DSE live feed', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ cols: ['tradingCode'], rows: [] }),
      });

      await expect(fetchLivePriceFromDse('NONEXISTENT')).rejects.toThrow('Symbol "NONEXISTENT" not found');
    });

    it('throws error on non-ok HTTP response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
      });

      await expect(fetchLivePriceFromDse('MARICO')).rejects.toThrow('HTTP 502');
    });
  });

  describe('fetchCompanyFundamentalsFromDse', () => {
    it('parses DSE HTML definition list and stat cards accurately', async () => {
      const sampleHtml = `
        <html>
          <body>
            <div class="text-[10.5px]">Market cap</div>
            <div class="text-[15px]">68,210.10</div>
            <div class="text-[10.5px]">NAV per share</div>
            <div class="text-[15px]">275.40</div>
            <div class="text-[10.5px]">P/E (audited)</div>
            <div class="text-[15px]">38.25</div>

            <dl>
              <dt>Total outstanding securities</dt>
              <dd>31,500,000</dd>
              <dt>Paid-up capital</dt>
              <dd>315.00</dd>
              <dt>Face value</dt>
              <dd>10.0</dd>
              <dt>Listing year</dt>
              <dd>2009</dd>
              <dt>Year-end</dt>
              <dd>March</dd>
            </dl>
          </body>
        </html>
      `;

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => sampleHtml,
      });

      const fundamentals = await fetchCompanyFundamentalsFromDse('MARICO');
      expect(fundamentals.symbol).toBe('MARICO');
      expect(fundamentals.totalShares).toBe(31500000);
      expect(fundamentals.marketCapMillionBDT).toBe(68210.10);
      expect(fundamentals.marketCapBaseBDT).toBe(68210100000);
      expect(fundamentals.navPerShare).toBe(275.40);
      expect(fundamentals.peAudited).toBe(38.25);
      expect(fundamentals.paidUpCapitalMillionBDT).toBe(315.00);
      expect(fundamentals.faceValue).toBe(10.0);
      expect(fundamentals.listingYear).toBe(2009);
      expect(fundamentals.yearEndMonth).toBe('March');
    });
  });

  describe('syncDseMarketData & Zero-Fallback Enforcement', () => {
    it('syncs live quotes and calculates exact unrounded market cap without face value fallbacks', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'c1',
        dseSymbol: 'MARICO',
        totalShares: 31500000n,
      });

      // Mock live price
      const mockLiveResponse = {
        cols: ['tradingCode', 'ltp', 'close', 'ycp'],
        rows: [['MARICO', '2165.40', '2165.40', '2160.00']],
      };

      const sampleHtml = `
        <div class="text-[10.5px]">Market cap</div><div class="text-[15px]">68,210.10</div>
        <dt>Total outstanding securities</dt><dd>31,500,000</dd>
      `;

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockLiveResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => sampleHtml,
        });

      prisma.company.update.mockResolvedValue({});
      prisma.marketData.create.mockResolvedValue({ id: 'md1' });

      const result = await syncDseMarketData('MARICO');

      // Math verification: 31,500,000 * 2165.40 = 68,210,100,000 BDT
      expect(result.closingPrice).toBe(2165.40);
      expect(result.totalShares).toBe('31500000');
      expect(result.marketCap).toBe(68210100000);
      expect(result.marketCapMillionBDT).toBe('68210.10');

      expect(prisma.marketData.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          companyId: 'c1',
          closingPrice: 2165.40,
          sharesOutstanding: 31500000n,
          marketCap: 68210100000,
          source: 'DSE_LIVE',
        }),
      });
    });

    it('throws MISSING_REQUIRED_FACT when totalShares cannot be retrieved (zero fallback rejected)', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'c1',
        dseSymbol: 'TESTCO',
        totalShares: null,
      });

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cols: ['tradingCode', 'ltp'], rows: [['TESTCO', '100.0']] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<html><body>No shares here</body></html>',
        });

      await expect(syncDseMarketData('TESTCO')).rejects.toThrow('MISSING_REQUIRED_FACT');
    });

    it('throws MISSING_MARKET_CAP when price and market cap are zero (zero fallback rejected)', async () => {
      prisma.company.findUnique.mockResolvedValue({
        id: 'c1',
        dseSymbol: 'TESTCO',
        totalShares: 1000000n,
      });

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ cols: ['tradingCode', 'ltp', 'close', 'ycp'], rows: [['TESTCO', '0', '0', '0']] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => '<dt>Total outstanding securities</dt><dd>1,000,000</dd>',
        });

      await expect(syncDseMarketData('TESTCO')).rejects.toThrow('MISSING_MARKET_CAP');
    });
  });
});
