/// <reference types="bun" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { DATASET_VERSION, parseDataset } from './model';
import { flatten, positionOf } from './parse';
import { ROWS } from './fixtures/grid';
import { growHeader, WIDE_FIRST } from './sheets/tabs';
import { fieldName, fieldNames, snakeCase } from './snake';

// every field of the positions grid as seen live on 2026-11-26 (names only): Fidelity's own keys, nested ones by path
const LIVE = 'actNam actNum actPer askPrice askSize avgVol10Day avgVol90Day bidPrice bidSize callPut changeStk_bottom changeStk_top contractHigh contractHighDate contractLow contractLowDate contractMultiplier cstBasShr cstBasStk_bottom cstBasStk_top cstBasTot curVal currency dayRange_high dayRange_low dayRange_lowHigh deliverables delta displayIcons distYld distYldDate dividendFrequency dvAmt earningsAnnouncementDate equitySummaryRating equitySummaryScore equitySummaryScoreDate estAnuInc exDvDte exRtGs exRtNt expiration fifTwo_high fifTwo_low fifTwo_lowHigh fivYr gamma headlineTime impliedVolatility industry industryGroup intrinsicValue isHTB isLoaned isOptionable lastPrice lstPrChg lstPrChgPct lstPrStk_bottom lstPrStk_top lstPrc lstPrcPrevCls marketCap meta_acctTotalPop_pricedTodayGL meta_acctTotalPop_unpricedTodayGL meta_acctType meta_coreRateTreatmentId meta_cstbasType meta_distributionEvents_dividend_amount meta_distributionEvents_dividend_estAnnualIncome meta_distributionEvents_dividend_exDate meta_distributionEvents_dividend_payDate meta_distributionEvents_dividend_perShareAmount meta_distributionEvents_dividend_securityType meta_distributionEvents_dividend_yield meta_events_earningsCardDetails meta_events_hasCapitalGains meta_events_hasDividends meta_events_hasEarnings meta_events_numberOfEvents meta_grandPop_pricedSecuritiesTodaysGainLoss meta_grandPop_unpricedSecuritiesTodaysGainLoss meta_hasCoreRateTest meta_headerDescription meta_holdingType meta_isAcctBasketEligible meta_isCashAccount meta_isEligibleForLots meta_isFixedIncome meta_isIWS meta_isIntradayActivity meta_isMoneyMarket meta_isOptionable meta_isPriorDayGainLossReset meta_isRetirement meta_isSimpCore meta_isTradable meta_isUnPriced meta_isUnavailLots meta_isWash meta_pendPop_unsettledCash meta_registrationType meta_securitySubType meta_securitySubTypeSC meta_securityType meta_securityTypeSC meta_symDisplayName meta_yield7Date meta_yield7Day mngCtg mstar_cnt mstar_rate oneYr openPrice pctFloat peRatio prevClsDt prevShortInterest prevShortInterestRatio pyDte qty resId rho rowType secYld secYldDate sector sharesOutstanding shortInterest shortInterestRatio strikePrice subIndustry summary sym_cusip sym_desc sym_name sym_usn symbol tenYr text theta thrYr timeValue todGL todGLPct todGLStk_bottom todGLStk_top totGL totGLPct totGLStk_bottom totGLStk_top vega volatility10Day volatility120Day volatility250Day volatility30Day volatility60Day volatility90Day volume wirename yearHighDate yearLowDate ytdDly'.split(' ');

test('our own columns are snake_case; a snake_case name stays', () => {
  expect(['todayGlPct', 'costBasisTotal', 'low52', 'asOf'].map(snakeCase)).toEqual(['today_gl_pct', 'cost_basis_total', 'low52', 'as_of']);
  expect(snakeCase(snakeCase('estAnnualIncome'))).toBe('est_annual_income');
});

test('Fidelity\'s field names read as words (owner: "use readable names instead of lst_prc and cst_bas_tot")', () => {
  const names: Record<string, string> = {
    lstPrc: 'last_price', cstBasTot: 'cost_basis_total', cstBasShr: 'cost_basis_per_share', curVal: 'current_value', todGLPct: 'today_gl_pct',
    totGL: 'total_gl', actNum: 'account_number', actPer: 'percent_of_account', estAnuInc: 'est_annual_income', exDvDte: 'ex_date', pyDte: 'pay_date',
    fifTwo_low: 'week_52_low', isHTB: 'is_hard_to_borrow', avgVol10Day: 'average_volume_10_day', sym_desc: 'symbol_description', mngCtg: 'morningstar_category',
    lastPrice: 'quote_last_price', meta_cstbasType: 'meta_cost_basis_type', marketCap_text: 'market_cap_text', volume: 'volume', somethingNew: 'something_new',
  };
  Object.keys(names).forEach((k) => expect(fieldName(k)).toBe(names[k]!));
});

test('no two fields of the live grid get the same name, and none keeps a capital letter', () => {
  const names = LIVE.map(fieldName);
  expect(names.filter((n, i) => names.indexOf(n) !== i)).toEqual([]);
  names.forEach((n) => expect(n).toMatch(/^[a-z][a-z0-9_]*$/));
});

test('the names of the grid fields agree with the columns of our own tab', () => {
  const p = positionOf(ROWS[2]!)!;
  const f = flatten(ROWS[2]!);
  expect([f.quantity, f.last_price, f.current_value, f.cost_basis_total, f.ex_date]).toEqual([p.quantity!, p.lastPrice!, p.currentValue!, p.costBasisTotal!, p.exDate!]);
});

test('a copy stored before this naming reads with the new names; a new one is left as it is', () => {
  const copy = (fields: Record<string, string | number>) => JSON.stringify({ version: DATASET_VERSION, builtAt: '2026-11-21T02:00:00.000Z', accounts: [], warnings: [], positions: [{ account: 'X1', kind: 'position', symbol: 'AAA', description: '', fields }] });
  const now = { account_number: 'X1', last_price: 10, symbol_name: 'AAA' };
  expect(parseDataset(copy({ actNum: 'X1', lstPrc: 10, sym_name: 'AAA' }))!.positions[0]!.fields).toEqual(now); // as Fidelity names them
  expect(parseDataset(copy({ act_num: 'X1', lst_prc: 10, sym_name: 'AAA' }))!.positions[0]!.fields).toEqual(now); // plain snake_case (0.1.33)
  expect(parseDataset(copy(now))!.positions[0]!.fields).toEqual(now);
  const kept = { account_number: 'X1', last_price: 10, quote_last_price: 11 };
  expect(fieldNames(kept)).toBe(kept);
});

test('the wide tab: a header with the old names starts again, one with the new names only grows', () => {
  expect(growHeader(['as_of', 'actNum', 'lstPrc'], ['as_of', 'account_number', 'last_price'])).toEqual(WIDE_FIRST.concat(['last_price']));
  expect(growHeader(['as_of', 'act_num', 'lst_prc'], ['as_of', 'account_number', 'last_price'])).toEqual(WIDE_FIRST.concat(['last_price']));
  expect(growHeader(WIDE_FIRST.concat(['quantity']), ['quantity', 'last_price'])).toEqual(WIDE_FIRST.concat(['quantity', 'last_price']));
});
