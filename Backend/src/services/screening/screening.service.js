import prisma from '../../lib/prisma.js';
import { validateAccountingIntegrity } from '../validation/accounting-equation.js';
import { calculateDebtRatio } from './debt-ratio.service.js';
import { calculateDepositsRatio } from './deposits-ratio.service.js';
import { calculateIncomeRatio } from './income-ratio.service.js';
import { calculatePurification } from './purification.service.js';

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
  const company = await prisma.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error(`Company with ID "${companyId}" not found`);
  }

  const period = await prisma.financialPeriod.findUnique({
    where: { id: financialPeriodId },
    include: {
      facts: true,
    },
  });

  if (!period) {
    throw new Error(`FinancialPeriod with ID "${financialPeriodId}" not found`);
  }

  const facts = period.facts;
  if (!facts || facts.length === 0) {
    throw new Error(`No extracted facts found for period "${period.fiscalYear} ${period.periodType}". Please run extraction first.`);
  }

  // 1. Accounting Equation & Subtotal Integrity Validation
  const validationResult = validateAccountingIntegrity(facts);

  // 2. Resolve Market Capitalization
  let periodMarketCap = customMarketData?.periodMarketCap;
  let liveMarketCap = customMarketData?.liveMarketCap;
  let avg12mMarketCap = customMarketData?.avg12mMarketCap;

  if (!periodMarketCap || !liveMarketCap) {
    const marketRecords = await prisma.marketData.findMany({
      where: { companyId },
      orderBy: { priceDate: 'desc' },
      take: 5,
    });

    if (marketRecords.length > 0) {
      if (!liveMarketCap) liveMarketCap = marketRecords[0].marketCap;
      if (!periodMarketCap) periodMarketCap = marketRecords[marketRecords.length - 1].marketCap;
      if (!avg12mMarketCap && marketRecords[0].marketCap12mAvg) {
        avg12mMarketCap = marketRecords[0].marketCap12mAvg;
      }
    } else if (company.totalShares && company.paidUpCapMn) {
      // Fallback base calculation if market data not yet recorded
      const baseEstimate = Number(company.totalShares) * (company.faceValue || 10.0);
      if (!liveMarketCap) liveMarketCap = baseEstimate;
      if (!periodMarketCap) periodMarketCap = baseEstimate;
    } else {
      throw new Error(
        `Market capitalization is required to screen company ${company.dseSymbol}. Please sync DSE market data first.`
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

  // 6. Compute Rule 3/4/6 (Purification per share)
  const totalShares = company.totalShares || 1n;
  const purificationResult = calculatePurification({ facts, totalShares });

  // 7. Overall compliance determination (Strict AAOIFI view as primary)
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
      purificationTtmPerShare: null,
      methodologyNotes: JSON.stringify({
        rule_3_4_2_strict_passes: debtStrictPeriod.passes,
        rule_3_4_2_conservative_passes: debtConsPeriod.passes,
        rule_3_4_3_strict_passes: depStrictPeriod.passes,
        rule_3_4_3_conservative_passes: depConsPeriod.passes,
        rule_3_4_4_passes: incomeResult.passes,
        accounting_validation: validationResult.allPassed,
      }),
    },
  });

  // 9. Persist ScreeningRatioDetail rows
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
      sourceFactIds: JSON.stringify([]),
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
      sourceFactIds: JSON.stringify([]),
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
      sourceFactIds: JSON.stringify([]),
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
      sourceFactIds: JSON.stringify([]),
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
      sourceFactIds: JSON.stringify([]),
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
    purification: purificationResult,
    validation: validationResult,
  };
}
