/// <reference types="bun" />
/// <reference types="node" />
/// <reference lib="esnext" />
import { expect, test } from 'bun:test';
import { pagePost, readHistory } from './history-sync';

test('3Y for an account without points, 1M for one with points, a failure skips that account only', async () => {
  const asked: Array<{ url: string; body: { range: string; acctList: Array<{ acctNum: string; acctType: string }> } }> = [];
  const answer = (date: string, value: number) => ({ balHistoryDetail: { balances: [{ date, value }] } });
  const post = async (url: string, body: unknown) => {
    const b = body as { range: string; acctList: Array<{ acctNum: string; acctType: string }> };
    asked.push({ url, body: b });
    if (b.acctList[0]!.acctNum === 'X3') throw new Error('500');
    return answer('11/20/2026', b.acctList[0]!.acctNum === 'X1' ? 100 : 200);
  };
  const h = await readHistory([
    { number: 'X1', name: 'A', group: 'G', asOf: 't' },
    { number: 'X2', name: 'B', group: 'G', type: 'ROTH IRA', asOf: 't' },
    { number: 'X3', name: 'C', group: 'G', asOf: 't' },
  ], { X2: [{ date: '2026-11-19', value: 1 }] }, post);
  expect(asked.map((a) => [a.body.acctList[0]!.acctNum, a.body.range, a.body.acctList[0]!.acctType])).toEqual([['X1', '3Y', 'Brokerage'], ['X2', '1M', 'ROTH IRA'], ['X3', '3Y', 'Brokerage']]);
  expect(asked.every((a) => a.url === '/ftgw/digital/portfolio/api/BalanceHistory')).toBe(true);
  expect(h).toEqual({ X1: [{ date: '2026-11-20', value: 100 }], X2: [{ date: '2026-11-20', value: 200 }] });
});

test('the page POST refuses any other URL', async () => {
  await expect(pagePost('/ftgw/digital/trade/api/order', {})).rejects.toThrow('not allowed');
});
