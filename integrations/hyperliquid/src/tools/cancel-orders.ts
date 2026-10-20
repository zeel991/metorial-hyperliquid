import { createApiServiceError, SlateTool } from 'slates';
import { z } from 'zod';
import { requireWallet, tradingAccount } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { type PerpMarket, resolvePerpMarket } from '../lib/markets';
import { spec } from '../spec';

export let cancelOrders = SlateTool.create(spec, {
  key: 'cancel_orders',
  name: 'Cancel Orders',
  description:
    'Cancel one or more open perp orders of the connected trading account, each identified by coin plus order id or client order id. Returns a per-order result; an order that already filled or was canceled reports an error instead of failing the whole call.',
  tags: { readOnly: false, destructive: true }
})
  .authMethods(['api_wallet'])
  .input(
    z.object({
      orders: z
        .array(
          z.object({
            coin: z.string().describe('Perp coin of the order, e.g. "BTC"'),
            oid: z.number().int().optional().describe('Exchange order id'),
            clientOrderId: z
              .string()
              .optional()
              .describe('Client order id, used instead of oid')
          })
        )
        .min(1)
        .max(50)
        .describe('Orders to cancel (1-50)')
    })
  )
  .output(
    z.object({
      tradingAccount: z.string(),
      results: z.array(
        z.object({
          coin: z.string(),
          oid: z.number().nullable(),
          clientOrderId: z.string().nullable(),
          canceled: z.boolean(),
          error: z.string().nullable()
        })
      )
    })
  )
  .handleInvocation(async ctx => {
    let wallet = requireWallet(ctx.auth);
    let client = new HyperliquidClient(ctx.config.network);

    let markets = new Map<string, PerpMarket>();
    let marketFor = async (coin: string) => {
      let key = coin.trim().toLowerCase();
      if (!markets.has(key)) markets.set(key, await resolvePerpMarket(client, coin));
      return markets.get(key)!;
    };

    type CancelRequest = { market: PerpMarket; oid?: number; clientOrderId?: string };
    type CancelResult = {
      coin: string;
      oid: number | null;
      clientOrderId: string | null;
      canceled: boolean;
      error: string | null;
    };

    let requests: CancelRequest[] = [];
    for (let order of ctx.input.orders) {
      let clientOrderId = order.clientOrderId?.trim().toLowerCase();
      if ((order.oid === undefined) === !clientOrderId) {
        throw createApiServiceError('Each order needs exactly one of oid or clientOrderId.', {
          reason: 'hyperliquid_invalid_input'
        });
      }
      requests.push({ market: await marketFor(order.coin), oid: order.oid, clientOrderId });
    }

    let byOid = requests.filter(request => request.oid !== undefined);
    let byCloid = requests.filter(request => request.clientOrderId);
    let results: CancelResult[] = [];

    let collect = (batch: CancelRequest[], statuses: any[]) =>
      batch.map((request, index): CancelResult => {
        let status = statuses[index];
        return {
          coin: request.market.coin,
          oid: request.oid ?? null,
          clientOrderId: request.clientOrderId ?? null,
          canceled: status === 'success',
          error:
            status === 'success' ? null : (status?.error ?? JSON.stringify(status ?? null))
        };
      });

    if (byOid.length > 0) {
      let result = await client.exchange({
        ...wallet,
        action: {
          type: 'cancel',
          cancels: byOid.map(request => ({ a: request.market.assetId, o: request.oid }))
        }
      });
      results.push(...collect(byOid, result.response?.data?.statuses ?? []));
    }
    if (byCloid.length > 0) {
      let result = await client.exchange({
        ...wallet,
        action: {
          type: 'cancelByCloid',
          cancels: byCloid.map(request => ({
            asset: request.market.assetId,
            cloid: request.clientOrderId
          }))
        }
      });
      results.push(...collect(byCloid, result.response?.data?.statuses ?? []));
    }

    let canceled = results.filter(result => result.canceled).length;
    return {
      output: { tradingAccount: tradingAccount(ctx.auth)!, results },
      message: `Canceled ${canceled} of ${results.length} orders.`
    };
  })
  .build();
