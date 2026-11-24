/// <reference lib="esnext" />
// Made-up demo data (no real account, number or amount): lets the viewer be looked at and tuned before the first
// sync. Shown only after "Show demo data", never written to Sheets or the cache
import { DATASET_VERSION, type Account, type Dataset, type Position } from './model';

const ACCOUNTS: Array<[string, string, string, string]> = [
  ['X00000001', 'Individual', 'Investment', 'Brokerage'],
  ['X00000002', 'Joint', 'Investment', 'Brokerage'],
  ['X00000003', 'Dividends', 'Investment', 'Brokerage'],
  ['000000004', 'ROTH IRA', 'Retirement', 'ROTH IRA'],
  ['000000005', 'Traditional IRA', 'Retirement', 'Traditional IRA'],
];

// symbol, name, sector, type, price, today %, dist rate %, frequency, market cap ($B)
const SECURITIES: Array<[string, string, string, string, number, number, number, string, number]> = [
  ['ACME', 'ACME DEMO CORP', 'Information Technology', 'Equity', 182.4, 2.31, 0.6, 'Quarterly', 410],
  ['BOLT', 'BOLT ENERGY DEMO INC', 'Energy', 'Equity', 64.1, -1.12, 3.9, 'Quarterly', 75],
  ['CRUX', 'CRUX HEALTH DEMO CO', 'Health Care', 'Equity', 121.9, 0.44, 1.8, 'Quarterly', 160],
  ['DUNE', 'DUNE RETAIL DEMO', 'Consumer Discretionary', 'Equity', 48.7, -2.85, 0, '--', 12],
  ['ECHO', 'ECHO BANK DEMO', 'Financials', 'Equity', 77.3, 1.05, 2.7, 'Quarterly', 220],
  ['FERN', 'FERN UTILITIES DEMO', 'Utilities', 'Equity', 39.2, 0.12, 4.6, 'Quarterly', 30],
  ['GRID', 'DEMO HIGH DIVIDEND ETF', 'Other', 'ETF', 52.8, 0.65, 5.2, 'Monthly', 8],
  ['HALO', 'DEMO S&P 500 INDEX ETF', 'Other', 'ETF', 512.6, 0.98, 1.3, 'Quarterly', 500],
  ['IRIS', 'IRIS SEMICONDUCTOR DEMO', 'Information Technology', 'Equity', 233.0, 4.12, 0.2, 'Quarterly', 900],
  ['JADE', 'JADE STAPLES DEMO', 'Consumer Staples', 'Equity', 58.9, -0.37, 3.1, 'Quarterly', 140],
];

const r2 = (n: number) => Math.round(n * 100) / 100;

export function sampleDataset(now: Date): Dataset {
  const builtAt = now.toISOString();
  const day = (offset: number) => { const d = new Date(now); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const positions: Position[] = [];
  const accounts: Account[] = ACCOUNTS.map(([number, name, group, type], ai) => {
    const own: Position[] = SECURITIES.filter((_, si) => (si + ai) % 3 !== 0).map(([symbol, description, sector, securityType, price, pct, dist, freq, cap], si) => {
      const quantity = r2(3 + ((si * 7 + ai * 5) % 40) * 1.37);
      const currentValue = r2(quantity * price);
      const costBasisTotal = r2(currentValue * (0.8 + ((si + ai) % 5) * 0.09));
      const todayGl = r2(currentValue - currentValue / (1 + pct / 100));
      const estAnnualIncome = r2((currentValue * dist) / 100);
      return {
        account: number, kind: 'position', symbol, description, securityType, quantity, lastPrice: price, lastPriceChange: r2(price - price / (1 + pct / 100)), lastPriceChangePct: pct,
        currentValue, todayGl, todayGlPct: pct, totalGl: r2(currentValue - costBasisTotal), totalGlPct: r2(((currentValue - costBasisTotal) / costBasisTotal) * 100),
        costBasisTotal, costBasisPerShare: r2(costBasisTotal / quantity), distRate: dist || undefined, estAnnualIncome: estAnnualIncome || undefined,
        paymentFrequency: freq === '--' ? undefined : freq, exDate: dist ? day((si * 3 + ai) % 40 - 5) : undefined, payDate: dist ? day((si * 3 + ai) % 40 + 10) : undefined,
        marketCap: cap * 1e9, marketCapText: `${cap >= 200 ? 'Mega' : cap >= 10 ? 'Large' : 'Medium'} cap ($${cap}B)`, sector,
        low52: r2(price * 0.72), high52: r2(price * (1.02 + (si % 4) * 0.12)),
        fields: { sym_name: symbol, sym_desc: description, sector, demo: true },
      };
    });
    const cash = r2(150 + ai * 420.5);
    own.push({ account: number, kind: 'core', symbol: 'SPAXX', description: 'HELD IN MONEY MARKET', securityType: 'Core', currentValue: cash, fields: { demo: true } });
    positions.push(...own);
    const value = own.reduce((s, p) => s + (p.currentValue ?? 0), 0);
    const todayGl = own.reduce((s, p) => s + (p.todayGl ?? 0), 0);
    const costBasis = own.filter((p) => p.kind === 'position').reduce((s, p) => s + (p.costBasisTotal ?? 0), 0);
    const invested = own.filter((p) => p.kind === 'position').reduce((s, p) => s + (p.currentValue ?? 0), 0);
    return {
      number, name, group, type, balance: r2(value), todayGl: r2(todayGl), todayGlPct: r2((todayGl / (value - todayGl)) * 100),
      totalGl: r2(invested - costBasis), totalGlPct: r2(((invested - costBasis) / costBasis) * 100), costBasis: r2(costBasis),
      estAnnualIncome: r2(own.reduce((s, p) => s + (p.estAnnualIncome ?? 0), 0)), cash, asOf: builtAt,
    };
  });
  return { version: DATASET_VERSION, builtAt, asOf: 'demo data', accounts, positions, warnings: [] };
}
