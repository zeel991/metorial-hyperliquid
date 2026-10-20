import { createApiServiceError, SlateTool } from 'slates';
import { z } from 'zod';
import { requireWallet, tradingAccount } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { checkPerpPrice, checkSize, roundPerpPrice } from '../lib/format';
import { requireTradable, resolvePerpMarket } from '../lib/markets';
import { spec } from '../spec';

let invalid = (message: string) =>
  createApiServiceError(message, { reason: 'hyperliquid_invalid_order' });

export let placeOrder = SlateTool.create(spec, {
  key: 'place_order',
  name: 'Place Order',
  description: `Place a perp order on Hyperliquid for the connected trading account. Fills cannot be undone.
- limit: rests at your price. timeInForce Gtc (default), Alo (post-only, canceled instead of taking) or Ioc (fill what crosses now, cancel the rest).
- market: an Ioc limit order at the current mid price plus or minus "slippage" (default 1%, max 10%); anything that cannot fill within that price is canceled.
Prices and sizes are decimal strings and must already fit the market's tick and size steps (see szDecimals from list_perp_markets); invalid values are rejected with the nearest valid price, never silently rounded. Hyperliquid rejects orders under $10 notional.`,
  tags: { readOnly: false, destructive: true }
})
  .authMethods(['api_wallet'])
  .input(
    z.object({
      coin: z.string().describe('Perp coin, e.g. "BTC" or "xyz:TSLA"'),
      side: z.enum(['buy', 'sell']).describe('buy opens or adds to a long / reduces a short'),
      size: z.string().describe('Order size in base units as a decimal string, e.g. "0.01"'),
      orderType: z
        .enum(['limit', 'market'])
        .describe('limit or market (Ioc with slippage cap)'),
      price: z
        .string()
        .optional()
        .describe(
          'Limit price as a decimal string. Required for limit orders; not allowed for market orders.'
        ),
      timeInForce: z
        .enum(['Gtc', 'Alo', 'Ioc'])
        .optional()
        .describe('Limit orders only (default Gtc)'),
      slippage: z
        .number()
        .min(0.0001)
        .max(0.1)
        .optional()
        .describe(
          'Market orders only: max distance from mid as a fraction (default 0.01 = 1%)'
        ),
      reduceOnly: z
        .boolean()
        .optional()
        .describe('Only reduce an existing position, never open or flip one (default false)'),
      clientOrderId: z
        .string()
        .optional()
        .describe('Optional client order id: 0x followed by 32 hex characters')
    })
  )
  .output(
    z.object({
      tradingAccount: z.string(),
      coin: z.string(),
      assetId: z.number(),
      side: z.enum(['buy', 'sell']),
      orderType: z.enum(['limit', 'market']),
      timeInForce: z.string(),
      submittedPrice: z.string(),
      submittedSize: z.string(),
      reduceOnly: z.boolean(),
      clientOrderId: z.string().nullable(),
      status: z.string().describe('resting, filled, or another status Hyperliquid reports'),
      oid: z.number().nullable(),
      filledSize: z.string().nullable(),
      avgPx: z.string().nullable()
    })
  )
  .handleInvocation(async ctx => {
    let wallet = requireWallet(ctx.auth);
    let client = new HyperliquidClient(ctx.config.network);
    let market = requireTradable(await resolvePerpMarket(client, ctx.input.coin));
    let size = checkSize(ctx.input.size, market.szDecimals);
    let isBuy = ctx.input.side === 'buy';

    let price: string;
    let tif: 'Gtc' | 'Alo' | 'Ioc';
    if (ctx.input.orderType === 'limit') {
      if (!ctx.input.price) throw invalid('price is required for limit orders.');
      if (ctx.input.slippage !== undefined)
        throw invalid('slippage applies to market orders only.');
      price = checkPerpPrice(ctx.input.price, market.szDecimals);
      tif = ctx.input.timeInForce ?? 'Gtc';
    } else {
      if (ctx.input.price) throw invalid('Market orders take no price; set slippage instead.');
      if (ctx.input.timeInForce)
        throw invalid('Market orders are always Ioc; omit timeInForce.');
      let mid = Number(market.midPx ?? market.markPx);
      if (!Number.isFinite(mid) || mid <= 0) {
        throw invalid(
          `${market.coin} has no mid price right now; place a limit order instead.`
        );
      }
      let slippage = ctx.input.slippage ?? 0.01;
      price = roundPerpPrice(mid * (isBuy ? 1 + slippage : 1 - slippage), market.szDecimals);
      tif = 'Ioc';
    }

    let clientOrderId = ctx.input.clientOrderId?.trim().toLowerCase();
    if (clientOrderId && !/^0x[0-9a-f]{32}$/.test(clientOrderId)) {
      throw invalid('clientOrderId must be 0x followed by 32 hex characters.');
    }

    // Key order matches the Python SDK's order wire; it is part of the signed msgpack payload.
    let order: Record<string, unknown> = {
      a: market.assetId,
      b: isBuy,
      p: price,
      s: size,
      r: ctx.input.reduceOnly ?? false,
      t: { limit: { tif } }
    };
    if (clientOrderId) order.c = clientOrderId;

    let result = await client.exchange({
      ...wallet,
      action: { type: 'order', orders: [order], grouping: 'na' }
    });
    let status = result.response?.data?.statuses?.[0];
    if (!status || status.error) {
      throw createApiServiceError(
        `Hyperliquid rejected the order: ${status?.error ?? JSON.stringify(result.response)}`,
        { reason: 'hyperliquid_order_rejected' }
      );
    }

    let kind = typeof status === 'string' ? status : (Object.keys(status)[0] ?? 'unknown');
    let detail = typeof status === 'object' ? (status[kind] ?? {}) : {};

    return {
      output: {
        tradingAccount: tradingAccount(ctx.auth)!,
        coin: market.coin,
        assetId: market.assetId,
        side: ctx.input.side,
        orderType: ctx.input.orderType,
        timeInForce: tif,
        submittedPrice: price,
        submittedSize: size,
        reduceOnly: ctx.input.reduceOnly ?? false,
        clientOrderId: clientOrderId ?? null,
        status: kind,
        oid: detail.oid ?? null,
        filledSize: detail.totalSz ?? null,
        avgPx: detail.avgPx ?? null
      },
      message:
        kind === 'filled'
          ? `Filled ${detail.totalSz} ${market.coin} at avg ${detail.avgPx} (oid ${detail.oid}).`
          : `${ctx.input.side} ${size} ${market.coin} @ ${price} ${tif}: ${kind}${detail.oid ? ` (oid ${detail.oid})` : ''}.`
    };
  })
  .build();
