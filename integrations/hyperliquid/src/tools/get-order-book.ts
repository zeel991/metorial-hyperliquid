import { createApiServiceError, SlateTool } from 'slates';
import { z } from 'zod';
import { HyperliquidClient } from '../lib/client';
import { isoTime } from '../lib/format';
import { spec } from '../spec';

let level = z.object({
  px: z.string(),
  sz: z.string().describe('Total size at this level in base units'),
  n: z.number().describe('Number of orders at this level')
});

export let getOrderBook = SlateTool.create(spec, {
  key: 'get_order_book',
  name: 'Get Order Book',
  description:
    'Get the L2 order book for a perp coin (e.g. "BTC", "xyz:TSLA") or spot pair (e.g. "PURR/USDC", "@107"): bids and asks with size and order count per level, plus best bid/ask, mid and spread. Optionally aggregate levels to fewer significant figures.',
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      coin: z.string().describe('Perp coin or spot pair name'),
      depth: z
        .number()
        .int()
        .min(1)
        .max(20)
        .optional()
        .describe('Levels per side to return (default 10, max 20)'),
      nSigFigs: z
        .number()
        .int()
        .min(2)
        .max(5)
        .optional()
        .describe(
          'Aggregate price levels to this many significant figures (2-5). Omit for full precision.'
        )
    })
  )
  .output(
    z.object({
      coin: z.string(),
      time: z.string(),
      bids: z.array(level),
      asks: z.array(level),
      bestBid: z.string().nullable(),
      bestAsk: z.string().nullable(),
      mid: z.number().nullable(),
      spreadBps: z.number().nullable().describe('(bestAsk - bestBid) / mid in basis points')
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let book = await client.info<any>({
      type: 'l2Book',
      coin: ctx.input.coin.trim(),
      ...(ctx.input.nSigFigs ? { nSigFigs: ctx.input.nSigFigs } : {})
    });
    if (!book || !Array.isArray(book.levels)) {
      throw createApiServiceError(
        `No order book for "${ctx.input.coin}". Check the coin name with list_perp_markets or list_spot_markets.`,
        { reason: 'hyperliquid_unknown_market' }
      );
    }
    let depth = ctx.input.depth ?? 10;
    let bids = (book.levels[0] as any[]).slice(0, depth);
    let asks = (book.levels[1] as any[]).slice(0, depth);
    let bestBid = bids[0]?.px ?? null;
    let bestAsk = asks[0]?.px ?? null;
    let mid = bestBid && bestAsk ? (Number(bestBid) + Number(bestAsk)) / 2 : null;
    let spreadBps =
      mid && bestBid && bestAsk ? ((Number(bestAsk) - Number(bestBid)) / mid) * 10_000 : null;

    return {
      output: {
        coin: book.coin,
        time: isoTime(book.time),
        bids,
        asks,
        bestBid,
        bestAsk,
        mid,
        spreadBps
      },
      message: `${book.coin}: best bid ${bestBid ?? 'none'}, best ask ${bestAsk ?? 'none'}${spreadBps !== null ? `, spread ${spreadBps.toFixed(2)} bps` : ''}.`
    };
  })
  .build();
