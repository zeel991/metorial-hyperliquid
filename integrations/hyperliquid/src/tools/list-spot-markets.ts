import { SlateTool } from 'slates';
import { z } from 'zod';
import { HyperliquidClient } from '../lib/client';
import { spec } from '../spec';

export let listSpotMarkets = SlateTool.create(spec, {
  key: 'list_spot_markets',
  name: 'List Spot Markets',
  description:
    'List Hyperliquid spot pairs with base and quote token names, mark and mid prices, and 24h volume. Non-canonical pairs are named "@<index>" by the API; the base and quote fields give the readable tokens. Sorted by 24h notional volume.',
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      tokens: z
        .array(z.string())
        .optional()
        .describe('Only pairs whose base or quote token matches one of these (e.g. ["HYPE"])'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum pairs to return (default 50)')
    })
  )
  .output(
    z.object({
      markets: z.array(
        z.object({
          name: z
            .string()
            .describe('Pair name used by info endpoints (e.g. "PURR/USDC" or "@107")'),
          index: z.number(),
          assetId: z.number().describe('10000 + index'),
          base: z.string().nullable(),
          quote: z.string().nullable(),
          markPx: z.string().nullable(),
          midPx: z.string().nullable(),
          prevDayPx: z.string().nullable(),
          dayNtlVlm: z.string().nullable()
        })
      ),
      totalMarkets: z.number()
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let [meta, contexts] = await client.info<[any, any[]]>({ type: 'spotMetaAndAssetCtxs' });
    let tokenNames = new Map<number, string>(
      (meta.tokens as any[]).map(token => [token.index, token.name])
    );
    let contextByCoin = new Map<string, any>(contexts.map(context => [context.coin, context]));
    let wanted = ctx.input.tokens?.map(token => token.trim().toUpperCase());

    let markets = (meta.universe as any[])
      .map(pair => {
        let context = contextByCoin.get(pair.name) ?? {};
        return {
          name: pair.name,
          index: pair.index,
          assetId: 10000 + pair.index,
          base: tokenNames.get(pair.tokens?.[0]) ?? null,
          quote: tokenNames.get(pair.tokens?.[1]) ?? null,
          markPx: context.markPx ?? null,
          midPx: context.midPx ?? null,
          prevDayPx: context.prevDayPx ?? null,
          dayNtlVlm: context.dayNtlVlm ?? null
        };
      })
      .filter(
        market =>
          !wanted ||
          wanted.includes(market.base?.toUpperCase() ?? '') ||
          wanted.includes(market.quote?.toUpperCase() ?? '')
      )
      .sort((a, b) => Number(b.dayNtlVlm ?? 0) - Number(a.dayNtlVlm ?? 0));
    let limited = markets.slice(0, ctx.input.limit ?? 50);

    return {
      output: { markets: limited, totalMarkets: markets.length },
      message: `Returned ${limited.length} of ${markets.length} spot pairs.`
    };
  })
  .build();
