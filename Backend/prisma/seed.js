import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const STARTER_COMPANIES = [
  {
    dseSymbol: 'GP',
    name: 'Grameenphone Ltd.',
    sector: 'Telecom',
    fiscalYearEnd: 'December',
    listingYear: 2009,
    faceValue: 10.0,
    totalShares: 1350300022n,
    paidUpCapMn: 13503.0,
    authorizedCapMn: 40000.0,
  },
  {
    dseSymbol: 'SQURPHARMA',
    name: 'Square Pharmaceuticals PLC',
    sector: 'PharmaChem',
    fiscalYearEnd: 'June',
    listingYear: 1995,
    faceValue: 10.0,
    totalShares: 886451010n,
    paidUpCapMn: 8864.51,
    authorizedCapMn: 10000.0,
  },
  {
    dseSymbol: 'BXPHARMA',
    name: 'Beximco Pharmaceuticals Ltd.',
    sector: 'PharmaChem',
    fiscalYearEnd: 'June',
    listingYear: 1986,
    faceValue: 10.0,
    totalShares: 446112089n,
    paidUpCapMn: 4461.12,
    authorizedCapMn: 15000.0,
  },
  {
    dseSymbol: 'WALTONHIL',
    name: 'Walton Hi-Tech Industries PLC',
    sector: 'Engineering',
    fiscalYearEnd: 'June',
    listingYear: 2020,
    faceValue: 10.0,
    totalShares: 302928343n,
    paidUpCapMn: 3029.28,
    authorizedCapMn: 6000.0,
  },
  {
    dseSymbol: 'RENATA',
    name: 'Renata PLC',
    sector: 'PharmaChem',
    fiscalYearEnd: 'June',
    listingYear: 1979,
    faceValue: 10.0,
    totalShares: 114696490n,
    paidUpCapMn: 1146.96,
    authorizedCapMn: 2850.0,
  },
  {
    dseSymbol: 'BERGERPBL',
    name: 'Berger Paints Bangladesh Ltd.',
    sector: 'Miscellaneous',
    fiscalYearEnd: 'March',
    listingYear: 2006,
    faceValue: 10.0,
    totalShares: 46377880n,
    paidUpCapMn: 463.78,
    authorizedCapMn: 1000.0,
  },
  {
    dseSymbol: 'UPGDCL',
    name: 'United Power Generation & Distribution Company Ltd.',
    sector: 'Fuel & Power',
    fiscalYearEnd: 'June',
    listingYear: 2015,
    faceValue: 10.0,
    totalShares: 579695270n,
    paidUpCapMn: 5796.95,
    authorizedCapMn: 10000.0,
  },
  {
    dseSymbol: 'MARICO',
    name: 'Marico Bangladesh Ltd.',
    sector: 'FMCG',
    fiscalYearEnd: 'March',
    listingYear: 2009,
    faceValue: 10.0,
    totalShares: 31500000n,
    paidUpCapMn: 315.0,
    authorizedCapMn: 400.0,
  },
  {
    dseSymbol: 'LHB',
    name: 'LafargeHolcim Bangladesh Ltd.',
    sector: 'Cement',
    fiscalYearEnd: 'December',
    listingYear: 2003,
    faceValue: 10.0,
    totalShares: 1161373500n,
    paidUpCapMn: 11613.74,
    authorizedCapMn: 14000.0,
  },
  {
    dseSymbol: 'ROBI',
    name: 'Robi Axiata PLC',
    sector: 'Telecom',
    fiscalYearEnd: 'December',
    listingYear: 2020,
    faceValue: 10.0,
    totalShares: 5237933335n,
    paidUpCapMn: 52379.33,
    authorizedCapMn: 60000.0,
  },
];

async function main() {
  console.log('Seeding starter companies...');
  for (const comp of STARTER_COMPANIES) {
    await prisma.company.upsert({
      where: { dseSymbol: comp.dseSymbol },
      update: {
        name: comp.name,
        sector: comp.sector,
        fiscalYearEnd: comp.fiscalYearEnd,
        listingYear: comp.listingYear,
        faceValue: comp.faceValue,
        totalShares: comp.totalShares,
        paidUpCapMn: comp.paidUpCapMn,
        authorizedCapMn: comp.authorizedCapMn,
      },
      create: comp,
    });
    console.log(`Seeded company: ${comp.dseSymbol} - ${comp.name}`);
  }
  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
