/// <reference lib="esnext" />
// Rows of the Fidelity positions grid in the shape seen live on 2026-11-23 (ag-grid row data of
// /ftgw/digital/positions/poswebex/api/positions), every name, number and amount made up
import type { GridRow, SidebarAccount } from '../parse';

const v = (val: unknown, disp: string) => ({ val, disp });

export const SIDEBAR: SidebarAccount[] = [
  { group: 'Investment', name: 'Joint', number: 'X10000001', balance: 1525.5, todayGl: 12.3, todayGlPct: 0.81 },
  { group: 'Retirement', name: 'ROTH IRA', number: '200000002', balance: 800, todayGl: -4, todayGlPct: -0.5 },
];

export const ROWS: GridRow[] = [
  { rowType: 'ACCOUNT', actNum: 'X10000001', actNam: 'Joint', sym: { name: 'Joint X10000001' }, meta: { acctActns: { actNum: 'X10000001' }, rowId: 1, acctType: 'Brokerage' } },
  {
    rowType: 'POSITION_CORE', actNum: 'X10000001', actNam: 'Joint',
    meta: { acctType: 'Brokerage', securityType: 'Core', securitySubType: 'Fidelity Mutual Fund', headerDescription: 'FIDELITY GOVERNMENT MONEY MARKET (SPAXX)' },
    sym: { name: 'SPAXX**', cusip: '000000000', desc: 'HELD IN MONEY MARKET' }, curVal: v(25.5, '$25.50'), secYld: v(3.58, '3.58%'), oneYr: v('--', '--'),
  },
  {
    rowType: 'POSITION', actNum: 'X10000001', actNam: 'Joint',
    meta: { acctType: 'Brokerage', securityType: 'Equity', securitySubType: 'Common Stock', holdingType: 'Cash' },
    sym: { name: 'AAAA', cusip: '111111111', desc: 'ALPHA DEMO CORP' },
    qty: v(2.5, '2.500'), lstPrc: v(400, '$400.00'), lstPrChg: v(4, '+$4.00'), lstPrChgPct: v(1.01, '+1.01%'),
    curVal: v(1000, '$1,000.00'), todGL: v(9.9, '+$9.90'), todGLPct: v(1.0, '+1.00%'), totGL: v(100, '+$100.00'), totGLPct: v(11.11, '+11.11%'),
    cstBasTot: v(900, '$900.00'), cstBasShr: v(360, '$360.00'), actPer: v(65.55, '65.55%'),
    distYld: v(2.5, '2.50%'), secYld: v('--', '--'), estAnuInc: v(25, '$25.00'), dvAmt: v(0.25, '$0.2500'),
    dividendFrequency: v(4, 'Quarterly'), marketCap: v(234930000000, 'Large cap ($234.93B)'), sector: v('Energy', 'Energy'),
    exDvDte: v(1796000000, 'Dec-12-2026'), pyDte: v(1797000000, 'Jan-05-2027'),
    fifTwo: { low: v(300, '$300.00'), high: v(410, '$410.00'), lowHigh: 0.91 },
    mstar: { cnt: v('--', '--'), rate: '--' }, tradActns: { canBuy: true }, displayIcons: [{ type: 'E' }],
  },
  { rowType: 'PENDING', actNum: 'X10000001', actNam: 'Joint', curVal: v(-16.46, '-$16.46') },
  {
    rowType: 'ACCOUNT_TOTAL', actNum: 'X10000001', actNam: 'Joint', sym: { name: 'Account total' },
    todGL: v(12.3, '+$12.30'), todGLPct: v(0.81, '+0.81%'), totGL: v(100, '+$100.00'), totGLPct: v(11.11, '+11.11%'),
    cstBasTot: v(900, '$900.00'), curVal: v(1525.5, '$1,525.50'), estAnuInc: v(25, '$25.00'),
  },
  { rowType: 'SPACER' },
  { rowType: 'ACCOUNT', actNum: '200000002', actNam: 'ROTH IRA', meta: { acctType: 'ROTH IRA' } },
  {
    rowType: 'POSITION', actNum: '200000002', actNam: 'ROTH IRA', meta: { securityType: 'ETF' },
    sym: { name: 'BBBB', desc: 'BETA DEMO ETF' }, qty: v(10, '10.000'), lstPrc: v(80, '$80.00'), curVal: v(800, '$800.00'),
    todGL: v(-4, '-$4.00'), todGLPct: v(-0.5, '-0.50%'), sector: v('--', '--'),
  },
  { rowType: 'ACCOUNT_TOTAL', actNum: '200000002', actNam: 'ROTH IRA', curVal: v(800, '$800.00'), todGL: v(-4, '-$4.00') },
  { rowType: 'GRAND_TOTAL', curVal: v(2325.5, '$2,325.50') },
];
