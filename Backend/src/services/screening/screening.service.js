import prisma from '../../lib/prisma.js';
import { validateAccountingIntegrity, AccountingValidationError } from '../validation/accounting-equation.js';
import { calculateDebtRatio } from './debt-ratio.service.js';
import { calculateDepositsRatio } from './deposits-ratio.service.js';
import { calculateIncomeRatio } from './income-ratio.service.js';
import { calculatePurification } from './purification.service.js';
import { syncDseMarketData } from '../dse-market.service.js';

/**
 * Executes complete AAOIFI screening for a given company and financial period
 *
 * @param {Object} params
 * @param {string} params.companyId
 * @param {string} params.financialPeriodId
 * @param {Object} [params.customMarketData] - Optional explicit market cap values
 * @returns {Promise<Object>} ScreeningResult and breakdown
 */
export async function runAaoifiScreening({
  companyId,
  financialPeriodId,
  customMarketData = null,
}) {
  let company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new AccountingValidationError('MISSING_REQUIRED_FACT', `Company with ID "${companyId}" not found`);
  }

  const period = await prisma.financialPeriod.findUnique({
    where: { id: financialPeriodId },
    include: {
      facts: true,
    },
  });

  if (!period) {
    throw new AccountingValidationError('MISSING_REQUIRED_FACT', `FinancialPeriod with ID "${financialPeriodId}" not found`);
  }

  const facts = period.facts;
  if (!facts || facts.length === 0) {
    throw new AccountingValidationError(
      'MISSING_REQUIRED_FACT',
      `No extracted facts found for period "${period.fiscalYear} ${period.periodType}". Please run extraction first.`
    );
  }

  // 1. Accounting Equation & Subtotal Integrity Validation (Throws ACCOUNTING_EQUATION_MISMATCH on failure)
  const validationResult = validateAccountingIntegrity(facts);

  // 2. Resolve Market Capitalization with Zero-Fallback Discipline
  let periodMarketCap = customMarketData?.periodMarketCap;
  let liveMarketCap = customMarketData?.liveMarketCap;
  let avg12mMarketCap = customMarketData?.avg12mMarketCap;

  if (!periodMarketCap || !liveMarketCap) {
    let marketRecords = await prisma.marketData.findMany({
      where: { companyId },
      orderBy: { priceDate: 'desc' },
      take: 10,
    });

    // If no market records exist, automatically attempt to sync from DSE
    if (marketRecords.length === 0 && company.dseSymbol) {
      try {
        console.log(`Auto-syncing real-time DSE market data for ${company.dseSymbol} before screening...`);
        await syncDseMarketData(company.dseSymbol);
        marketRecords = await prisma.marketData.findMany({
          where: { companyId },
          orderBy: { priceDate: 'desc' },
          take: 10,
        });
        // Re-fetch company in case totalShares updated
        company = await prisma.company.findUnique({ where: { id: companyId } });
      } catch (syncErr) {
        console.warn(`DSE auto-sync during screening attempt failed: ${syncErr.message}`);
      }
    }

    if (marketRecords.length > 0) {
      if (!liveMarketCap) {
        liveMarketCap = marketRecords[0].marketCap;
      }

      if (!periodMarketCap) {
        // Find market data record on or closest before periodEnd
        const periodEndTs = new Date(period.periodEnd).getTime();
        const pastRecords = marketRecords.filter((m) => new Date(m.priceDate).getTime() <= periodEndTs);
        if (pastRecords.length > 0) {
          periodMarketCap = pastRecords[0].marketCap;
        } else {
          // If filing date is newer than all records or no historical record exists, use oldest available verified record
          periodMarketCap = marketRecords[marketRecords.length - 1].marketCap;
        }
      }

      if (!avg12mMarketCap) {
        avg12mMarketCap = marketRecords[0].marketCap12mAvg || liveMarketCap;
      }
    }

    // Zero-fallback rule: NEVER estimate from nominal face value or paid-up capital
    if (!periodMarketCap || periodMarketCap <= 0 || !liveMarketCap || liveMarketCap <= 0) {
      throw new AccountingValidationError(
        'MISSING_MARKET_CAP',
        `MISSING_MARKET_CAP: Market capitalization is required to screen company ${company.dseSymbol}. Zero fallbacks are prohibited. Denominators will never be estimated from nominal face value. Please sync DSE market data.`,
        { company: company.dseSymbol, periodMarketCap, liveMarketCap }
      );
    }
  }

  // 3. Compute Rule 3/4/2 (Debt Ratio)
  const debtStrictPeriod = calculateDebtRatio({ facts, marketCap: periodMarketCap, viewType: 'STRICT_AAOIFI' });
  const debtConsPeriod = calculateDebtRatio({ facts, marketCap: periodMarketCap, viewType: 'CONSERVATIVE' });
  const debtStrictLive = calculateDebtRatio({ facts, marketCap: liveMarketCap, viewType: 'STRICT_AAOIFI' });
  const debtConsLive = calculateDebtRatio({ facts, marketCap: liveMarketCap, viewType: 'CONSERVATIVE' });

  // 4. Compute Rule 3/4/3 (Deposits Ratio)
  const depStrictPeriod = calculateDepositsRatio({ facts, marketCap: periodMarketCap, viewType: 'STRICT_AAOIFI' });
  const depConsPeriod = calculateDepositsRatio({ facts, marketCap: periodMarketCap, viewType: 'CONSERVATIVE' });
  const depStrictLive = calculateDepositsRatio({ facts, marketCap: liveMarketCap, viewType: 'STRICT_AAOIFI' });
  const depConsLive = calculateDepositsRatio({ facts, marketCap: liveMarketCap, viewType: 'CONSERVATIVE' });

  // 5. Compute Rule 3/4/4 (Prohibited Income Ratio)
  const incomeResult = calculateIncomeRatio({ facts });

  // 6. Compute Rule 3/4/6 (Purification per share) — Zero fallback on share count
  if (!company.totalShares || company.totalShares <= 0n) {
    // Attempt auto-sync of totalShares from DSE
    try {
      await syncDseMarketData(company.dseSymbol);
      company = await prisma.company.findUnique({ where: { id: companyId } });
    } catch (_) {}
  }

  if (!company.totalShares || company.totalShares <= 0n) {
    throw new AccountingValidationError(
      'MISSING_REQUIRED_FACT',
      `Total outstanding shares for company ${company.dseSymbol} is missing or zero. AAOIFI Rule 3/4/6 purification calculation requires verified share count. Zero fallbacks are prohibited.`,
      { company: company.dseSymbol }
    );
  }

  const purificationResult = calculatePurification({ facts, totalShares: company.totalShares });

  // Annualized TTM purification for quarterly filings
  let purificationTtmPerShare = null;
  if (period.periodMonths && period.periodMonths < 12 && period.periodMonths > 0) {
    purificationTtmPerShare = purificationResult.purificationPerShare * (12 / period.periodMonths);
  } else {
    purificationTtmPerShare = purificationResult.purificationPerShare;
  }

  // 7. Overall compliance determination (Strict AAOIFI view as primary benchmark)
  const isCompliant =
    debtStrictPeriod.passes &&
    depStrictPeriod.passes &&
    incomeResult.passes;

  const overallStatus = isCompliant ? 'COMPLIANT' : 'NON_COMPLIANT';

  // 8. Persist ScreeningResult
  const screeningResult = await prisma.screeningResult.create({
    data: {
      companyId,
      financialPeriodId,
      overallStatus,
      purificationPerShare: purificationResult.purificationPerShare,
      purificationTtmPerShare,
      methodologyNotes: JSON.stringify({
        rule_3_4_2_strict_passes: debtStrictPeriod.passes,
        rule_3_4_2_conservative_passes: debtConsPeriod.passes,
        rule_3_4_3_strict_passes: depStrictPeriod.passes,
        rule_3_4_3_conservative_passes: depConsPeriod.passes,
        rule_3_4_4_passes: incomeResult.passes,
        accounting_validation: validationResult.allPassed,
        period_market_cap: periodMarketCap,
        live_market_cap: liveMarketCap,
        total_shares: company.totalShares.toString(),
      }),
    },
  });

  // 9. Persist ScreeningRatioDetail rows with full source fact IDs provenance
  const ratioDetailsToCreate = [
    {
      screeningResultId: screeningResult.id,
      aaoifiRule: '3/4/2',
      viewType: 'STRICT_AAOIFI',
      marketCapType: 'PERIOD_DATE',
      numeratorValue: debtStrictPeriod.numeratorValue,
      numeratorBreakdown: JSON.stringify(debtStrictPeriod.breakdown),
      denominatorValue: debtStrictPeriod.denominatorValue,
      denominatorSource: 'PERIOD_DATE_MCAP',
      ratioValue: debtStrictPeriod.ratioValue,
      ratioPercent: debtStrictPeriod.ratioPercent,
      threshold: debtStrictPeriod.threshold,
      passes: debtStrictPeriod.passes,
      sourceFactIds: JSON.stringify(debtStrictPeriod.sourceFactIds || []),
    },
    {
      screeningResultId: screeningResult.id,
      aaoifiRule: '3/4/2',
      viewType: 'CONSERVATIVE',
      marketCapType: 'PERIOD_DATE',
      numeratorValue: debtConsPeriod.numeratorValue,
      numeratorBreakdown: JSON.stringify(debtConsPeriod.breakdown),
      denominatorValue: debtConsPeriod.denominatorValue,
      denominatorSource: 'PERIOD_DATE_MCAP',
      ratioValue: debtConsPeriod.ratioValue,
      ratioPercent: debtConsPeriod.ratioPercent,
      threshold: debtConsPeriod.threshold,
      passes: debtConsPeriod.passes,
      sourceFactIds: JSON.stringify(debtConsPeriod.sourceFactIds || []),
    },
    {
      screeningResultId: screeningResult.id,
      aaoifiRule: '3/4/3',
      viewType: 'STRICT_AAOIFI',
      marketCapType: 'PERIOD_DATE',
      numeratorValue: depStrictPeriod.numeratorValue,
      numeratorBreakdown: JSON.stringify(depStrictPeriod.breakdown),
      denominatorValue: depStrictPeriod.denominatorValue,
      denominatorSource: 'PERIOD_DATE_MCAP',
      ratioValue: depStrictPeriod.ratioValue,
      ratioPercent: depStrictPeriod.ratioPercent,
      threshold: depStrictPeriod.threshold,
      passes: depStrictPeriod.passes,
      sourceFactIds: JSON.stringify(depStrictPeriod.sourceFactIds || []),
    },
    {
      screeningResultId: screeningResult.id,
      aaoifiRule: '3/4/3',
      viewType: 'CONSERVATIVE',
      marketCapType: 'PERIOD_DATE',
      numeratorValue: depConsPeriod.numeratorValue,
      numeratorBreakdown: JSON.stringify(depConsPeriod.breakdown),
      denominatorValue: depConsPeriod.denominatorValue,
      denominatorSource: 'PERIOD_DATE_MCAP',
      ratioValue: depConsPeriod.ratioValue,
      ratioPercent: depConsPeriod.ratioPercent,
      threshold: depConsPeriod.threshold,
      passes: depConsPeriod.passes,
      sourceFactIds: JSON.stringify(depConsPeriod.sourceFactIds || []),
    },
    {
      screeningResultId: screeningResult.id,
      aaoifiRule: '3/4/4',
      viewType: 'STRICT_AAOIFI',
      marketCapType: 'PERIOD_DATE',
      numeratorValue: incomeResult.numeratorValue,
      numeratorBreakdown: JSON.stringify(incomeResult.breakdown),
      denominatorValue: incomeResult.denominatorValue,
      denominatorSource: 'TOTAL_INCOME',
      ratioValue: incomeResult.ratioValue,
      ratioPercent: incomeResult.ratioPercent,
      threshold: incomeResult.threshold,
      passes: incomeResult.passes,
      sourceFactIds: JSON.stringify(incomeResult.sourceFactIds || []),
    },
  ];

  for (const detail of ratioDetailsToCreate) {
    await prisma.screeningRatioDetail.create({ data: detail });
  }

  return {
    screeningResultId: screeningResult.id,
    company: company.dseSymbol,
    overallStatus,
    period: `${period.fiscalYear} ${period.periodType}`,
    debt: {
      strict: debtStrictPeriod,
      conservative: debtConsPeriod,
      liveStrict: debtStrictLive,
    },
    deposits: {
      strict: depStrictPeriod,
      conservative: depConsPeriod,
      liveStrict: depStrictLive,
    },
    income: incomeResult,
    purification: {
      ...purificationResult,
      purificationTtmPerShare,
    },
    validation: validationResult,
  };
}
