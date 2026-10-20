import { SlateTool } from 'slates';
import { z } from 'zod';
import { HyperliquidClient } from '../lib/client';
import { isoTime, parseTime } from '../lib/format';
import { spec } from '../spec';

export let getFundingHistory = SlateTool.create(spec, {
  key: 'get_funding_history',
  name: 'Get Funding History',
  description:
    'Get the historical hourly funding rates and premiums for a perp coin. Positive rates mean longs pay shorts. Responses are capped at 500 entries; continue from the last returned time for longer windows.',
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      coin: z.string().describe('Perp coin, e.g. "ETH" or "xyz:TSLA"'),
      startTime: z.string().describe('Window start, ISO 8601 or Unix milliseconds'),
      endTime: z
        .string()
        .optional()
        .describe('Window end, ISO 8601 or Unix milliseconds (default now)')
    })
  )
  .output(
    z.object({
      coin: z.string(),
      rates: z.array(
        z.object({
          time: z.string(),
          fundingRate: z.string().describe('Hourly funding rate'),
          premium: z.string()
        })
      )
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let raw = await client.info<any[]>({
      type: 'fundingHistory',
      coin: ctx.input.coin.trim(),
      startTime: parseTime(ctx.input.startTime, 'startTime'),
      ...(ctx.input.endTime ? { endTime: parseTime(ctx.input.endTime, 'endTime') } : {})
    });
    let rates = raw.map(entry => ({
      time: isoTime(entry.time),
      fundingRate: entry.fundingRate,
      premium: entry.premium
    }));

    return {
      output: { coin: ctx.input.coin.trim(), rates },
      message: `Returned ${rates.length} hourly funding rates for ${ctx.input.coin}.`
    };
  })
  .build();
