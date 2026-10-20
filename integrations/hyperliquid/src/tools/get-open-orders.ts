import { SlateTool } from 'slates';
import { z } from 'zod';
import { resolveUser } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { isoTime } from '../lib/format';
import { spec } from '../spec';

export let getOpenOrders = SlateTool.create(spec, {
  key: 'get_open_orders',
  name: 'Get Open Orders',
  description:
    "List an account's open orders on one perp dex (and spot): side, limit price, remaining and original size, time in force, reduce-only, trigger details and client order id. Defaults to the connected trading account.",
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      user: z
        .string()
        .optional()
        .describe('Account address (0x...). Defaults to the connected trading account.'),
      dex: z.string().optional().describe('HIP-3 dex name. Omit for the main dex and spot.'),
      coin: z.string().optional().describe('Only orders for this coin')
    })
  )
  .output(
    z.object({
      user: z.string(),
      orders: z.array(
        z.object({
          coin: z.string(),
          side: z.enum(['buy', 'sell']),
          limitPx: z.string(),
          size: z.string().describe('Remaining size'),
          origSize: z.string(),
          oid: z.number(),
          clientOrderId: z.string().nullable(),
          orderType: z.string(),
          tif: z.string().nullable(),
          reduceOnly: z.boolean(),
          isTrigger: z.boolean(),
          triggerPx: z.string().nullable(),
          triggerCondition: z.string().nullable(),
          placedAt: z.string()
        })
      )
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let user = resolveUser(ctx.input.user, ctx.auth);
    let dex = ctx.input.dex?.trim() ?? '';
    let raw = await client.info<any[]>({
      type: 'frontendOpenOrders',
      user,
      ...(dex ? { dex } : {})
    });
    let coin = ctx.input.coin?.trim().toLowerCase();

    let orders = raw
      .filter(order => !coin || order.coin.toLowerCase() === coin)
      .map(order => ({
        coin: order.coin,
        side: order.side === 'B' ? ('buy' as const) : ('sell' as const),
        limitPx: order.limitPx,
        size: order.sz,
        origSize: order.origSz,
        oid: order.oid,
        clientOrderId: order.cloid ?? null,
        orderType: order.orderType,
        tif: order.tif ?? null,
        reduceOnly: order.reduceOnly === true,
        isTrigger: order.isTrigger === true,
        triggerPx: order.isTrigger ? order.triggerPx : null,
        triggerCondition: order.isTrigger ? order.triggerCondition : null,
        placedAt: isoTime(order.timestamp)
      }));

    return {
      output: { user, orders },
      message: `${user} has ${orders.length} open orders${coin ? ` on ${ctx.input.coin}` : ''}.`
    };
  })
  .build();
