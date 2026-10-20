import { createLocalSlateTestClient, expectSlateError } from '@slates/test';
import { beforeAll, describe, expect, it } from 'vitest';
import { provider } from './index';

// Read-only checks against Hyperliquid mainnet's public info API. No keys, no orders.
// Run with HYPERLIQUID_LIVE=1.
let live = process.env.HYPERLIQUID_LIVE === '1';

describe.skipIf(!live)('Hyperliquid live info API (read-only)', () => {
  let client = createLocalSlateTestClient({
    slate: provider,
    state: {
      config: { network: 'mainnet' },
      auth: { authenticationMethodId: 'read_only', output: {} }
    }
  });
  let call = async (toolId: string, input: Record<string, any>) =>
    (await client.invokeTool(toolId, input)).output as any;
  let trader = '';
  let hour = 3_600_000;

  beforeAll(async () => {
    // Slate HTTP helpers only run inside a tool call, so the fixture lookup uses fetch directly.
    let response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'recentTrades', coin: 'BTC' })
    });
    let trades = (await response.json()) as Array<{ users: string[] }>;
    trader = trades[0]!.users[0]!;
  });

  it('lists the main dex and HIP-3 dexes', async () => {
    let { dexes } = await call('list_perp_dexs', {});
    expect(dexes[0].name).toBe('');
    expect(dexes.length).toBeGreaterThan(1);
  });

  it('lists main-dex markets with BTC at asset id 0', async () => {
    let { markets } = await call('list_perp_markets', { coins: ['btc'] });
    expect(markets).toHaveLength(1);
    expect(markets[0]).toMatchObject({ coin: 'BTC', assetId: 0, isDelisted: false });
    expect(Number(markets[0].markPx)).toBeGreaterThan(0);
  });

  it('assigns HIP-3 asset ids from the dex index', async () => {
    let { dexes } = await call('list_perp_dexs', {});
    let dexIndex = dexes.findIndex((dex: any) => dex.name === 'xyz');
    let { markets } = await call('list_perp_markets', {
      dex: 'xyz',
      includeDelisted: true,
      limit: 500
    });
    expect(markets.length).toBeGreaterThan(0);
    for (let market of markets) {
      expect(market.coin.startsWith('xyz:')).toBe(true);
      expect(Math.floor((market.assetId - 100000) / 10000)).toBe(dexIndex);
    }
  });

  it('lists spot pairs with readable token names', async () => {
    let { markets } = await call('list_spot_markets', { tokens: ['PURR'] });
    expect(markets.find((market: any) => market.name === 'PURR/USDC')).toMatchObject({
      base: 'PURR',
      quote: 'USDC',
      assetId: 10000
    });
  });

  it('reads an ordered book', async () => {
    let book = await call('get_order_book', { coin: 'ETH', depth: 5 });
    expect(book.bids).toHaveLength(5);
    expect(Number(book.bestBid)).toBeLessThan(Number(book.bestAsk));
    expect(Number(book.bids[0].px)).toBeGreaterThan(Number(book.bids[4].px));
  });

  it('reads candles and funding history', async () => {
    let start = String(Date.now() - 6 * hour);
    let { candles } = await call('get_candles', {
      coin: 'BTC',
      interval: '1h',
      startTime: start
    });
    expect(candles.length).toBeGreaterThanOrEqual(5);
    let { rates } = await call('get_funding_history', { coin: 'BTC', startTime: start });
    expect(rates.length).toBeGreaterThanOrEqual(5);
  });

  it('reads an active trader account, fills, orders and funding', async () => {
    let state = await call('get_account_state', { user: trader });
    expect(state.user).toBe(trader.toLowerCase());
    expect(Number(state.marginSummary.accountValue)).toBeGreaterThanOrEqual(0);

    let { fills } = await call('get_fills', {
      user: trader,
      startTime: String(Date.now() - hour)
    });
    expect(fills.length).toBeGreaterThan(0);

    let status = await call('get_order_status', { user: trader, oid: fills.at(-1).oid });
    expect(status.found).toBe(true);

    let { orders } = await call('get_open_orders', { user: trader });
    expect(Array.isArray(orders)).toBe(true);
    let { payments } = await call('get_funding_payments', {
      user: trader,
      startTime: String(Date.now() - 24 * hour)
    });
    expect(Array.isArray(payments)).toBe(true);
  });

  it('defaults account tools to the read-only connection address', async () => {
    let { output } = await client.getAuthOutput({
      authenticationMethodId: 'read_only',
      input: { accountAddress: trader.toUpperCase().replace('0X', '0x') }
    });
    let scoped = createLocalSlateTestClient({
      slate: provider,
      state: {
        config: { network: 'mainnet' },
        auth: { authenticationMethodId: 'read_only', output }
      }
    });
    let state = (await scoped.invokeTool('get_account_state', { includeSpot: false }))
      .output as any;
    expect(state.user).toBe(trader.toLowerCase());
    expect(state.spotBalances).toBeNull();
  });

  it('asks for an address when the connection has none', async () => {
    await expectSlateError(() => client.invokeTool('get_account_state', {}), /Pass `user`/);
  });

  it('refuses a key that is not an approved API wallet', async () => {
    await expectSlateError(
      () =>
        client.getAuthOutput({
          authenticationMethodId: 'api_wallet',
          input: { privateKey: `0x${'0123456789abcdef'.repeat(4)}` }
        }),
      /not an approved API wallet/
    );
  });
});
