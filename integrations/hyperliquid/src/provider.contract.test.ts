import {
  createLocalSlateTestClient,
  expectSlateContract,
  expectSlateError
} from '@slates/test';
import { describe, expect, it } from 'vitest';
import { provider } from './index';

let READ_TOOLS = [
  'list_perp_dexs',
  'list_perp_markets',
  'list_spot_markets',
  'get_order_book',
  'get_candles',
  'get_funding_history',
  'get_account_state',
  'get_open_orders',
  'get_fills',
  'get_order_status',
  'get_funding_payments',
  'get_trading_account'
];
let TRADING_TOOLS = ['place_order', 'cancel_orders', 'update_leverage', 'schedule_cancel'];

let tools = provider.actions.filter(action => action.type === 'tool');

describe('Hyperliquid tool governance tags', () => {
  it('exposes exactly the expected tools', () => {
    expect(tools.map(tool => tool.key).sort()).toEqual(
      [...READ_TOOLS, ...TRADING_TOOLS].sort()
    );
  });

  it('marks every data tool read-only', () => {
    for (let tool of tools.filter(tool => READ_TOOLS.includes(tool.key))) {
      expect(tool.tags, tool.key).toEqual({ readOnly: true, destructive: false });
    }
  });

  it('marks trading tools as writes, and order placement and cancellation as destructive', () => {
    let tagsOf = (key: string) => tools.find(tool => tool.key === key)?.tags;
    expect(tagsOf('place_order')).toEqual({ readOnly: false, destructive: true });
    expect(tagsOf('cancel_orders')).toEqual({ readOnly: false, destructive: true });
    expect(tagsOf('schedule_cancel')).toEqual({ readOnly: false, destructive: true });
    expect(tagsOf('update_leverage')).toEqual({ readOnly: false, destructive: false });
  });

  it('only offers trading tools on an API wallet connection', () => {
    for (let tool of tools) {
      let expected =
        TRADING_TOOLS.includes(tool.key) || tool.key === 'get_trading_account'
          ? ['api_wallet']
          : undefined;
      expect(tool.authMethods, tool.key).toEqual(expected);
      expect(`hyperliquid-${tool.key}`.length).toBeLessThan(60);
    }
  });
});

describe('hyperliquid provider contract', () => {
  it('exposes the expected provider, tools and auth methods', async () => {
    let client = createLocalSlateTestClient({ slate: provider });
    await expectSlateContract({
      client,
      provider: { id: 'hyperliquid', name: 'Hyperliquid' },
      toolIds: [...READ_TOOLS, ...TRADING_TOOLS],
      authMethodIds: ['read_only', 'api_wallet']
    });
  });
});

// The hub hides tools whose authMethods exclude the connection, but the slate does not rely on
// that: every trading tool refuses to sign without an API wallet, before any network call.
describe('trading tools on a read-only connection', () => {
  let client = createLocalSlateTestClient({
    slate: provider,
    state: {
      config: { network: 'mainnet' },
      auth: {
        authenticationMethodId: 'read_only',
        output: { accountAddress: '0x0000000000000000000000000000000000000001' }
      }
    }
  });
  let inputs: Record<string, Record<string, any>> = {
    place_order: {
      coin: 'BTC',
      side: 'buy',
      size: '0.001',
      orderType: 'limit',
      price: '1000'
    },
    cancel_orders: { orders: [{ coin: 'BTC', oid: 1 }] },
    update_leverage: { coin: 'BTC', leverage: 2, marginMode: 'isolated' },
    schedule_cancel: { clear: true }
  };

  for (let toolId of TRADING_TOOLS) {
    it(`${toolId} refuses to run`, async () => {
      await expectSlateError(
        () => client.invokeTool(toolId, inputs[toolId]!),
        /needs an API wallet connection/
      );
    });
  }
});
