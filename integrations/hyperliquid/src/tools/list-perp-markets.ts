import { SlateTool } from 'slates';
import { z } from 'zod';
import { HyperliquidClient } from '../lib/client';
import { listPerpMarkets } from '../lib/markets';
import { spec } from '../spec';

export let listPerpMarketsTool = SlateTool.create(spec, {
  key: 'list_perp_markets',
  name: 'List Perp Markets',
  description:
    'List perpetual markets on the main dex or a builder-deployed (HIP-3) dex with live mark, oracle and mid prices, hourly funding rate, open interest, 24h volume, size decimals and max leverage. Sorted by 24h notional volume.',
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      dex: z
        .string()
        .optional()
        .describe('HIP-3 dex name from list_perp_dexs (e.g. "xyz"). Omit for the main dex.'),
      coins: z
        .array(z.string())
        .optional()
        .describe('Only return these coins (case-insensitive), e.g. ["BTC", "ETH"]'),
      includeDelisted: z
        .boolean()
        .optional()
        .describe('Include delisted markets (default false)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(500)
        .optional()
        .describe('Maximum markets to return (default 50)')
    })
  )
  .output(
    z.object({
      markets: z.array(
        z.object({
          coin: z.string(),
          assetId: z.number().describe('Asset id used in exchange actions'),
          szDecimals: z.number(),
          maxLeverage: z.number(),
          onlyIsolated: z.boolean(),
          isDelisted: z.boolean(),
          markPx: z.string().nullable(),
          oraclePx: z.string().nullable(),
          midPx: z.string().nullable(),
          funding: z.string().nullable().describe('Current hourly funding rate'),
          openInterest: z.string().nullable().describe('Open interest in base units'),
          dayNtlVlm: z.string().nullable().describe('24h notional volume in USD'),
          prevDayPx: z.string().nullable(),
          premium: z.string().nullable()
        })
      ),
      totalMarkets: z.number()
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let dex = ctx.input.dex?.trim() ?? '';
    let markets = await listPerpMarkets(client, dex);
    let wanted = ctx.input.coins?.map(coin => coin.trim().toLowerCase());

    let filtered = markets
      .filter(market => ctx.input.includeDelisted || !market.isDelisted)
      .filter(market => !wanted || wanted.includes(market.coin.toLowerCase()))
      .sort((a, b) => Number(b.dayNtlVlm ?? 0) - Number(a.dayNtlVlm ?? 0));
    let limited = filtered
      .slice(0, ctx.input.limit ?? 50)
      .map(({ dex: _dex, ...rest }) => rest);

    return {
      output: { markets: limited, totalMarkets: filtered.length },
      message: `Returned ${limited.length} of ${filtered.length} perp markets on ${dex ? `dex "${dex}"` : 'the main dex'}.`
    };
  })
  .build();
