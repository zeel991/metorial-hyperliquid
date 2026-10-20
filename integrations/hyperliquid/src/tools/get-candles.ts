import { SlateTool } from 'slates';
import { z } from 'zod';
import { HyperliquidClient } from '../lib/client';
import { isoTime, parseTime } from '../lib/format';
import { spec } from '../spec';

let INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '8h',
  '12h',
  '1d',
  '3d',
  '1w',
  '1M'
] as const;

export let getCandles = SlateTool.create(spec, {
  key: 'get_candles',
  name: 'Get Candles',
  description:
    'Get OHLCV candles for a perp coin or spot pair over a time window. Hyperliquid serves at most the 5000 most recent candles per interval, so long windows at small intervals are truncated to recent data.',
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      coin: z
        .string()
        .describe('Perp coin (e.g. "BTC", "xyz:TSLA") or spot pair (e.g. "@107")'),
      interval: z.enum(INTERVALS).describe('Candle interval'),
      startTime: z
        .string()
        .describe('Window start, ISO 8601 (e.g. 2026-10-01T00:00:00Z) or Unix milliseconds'),
      endTime: z
        .string()
        .optional()
        .describe('Window end, ISO 8601 or Unix milliseconds (default now)')
    })
  )
  .output(
    z.object({
      coin: z.string(),
      interval: z.string(),
      candles: z.array(
        z.object({
          openTime: z.string(),
          closeTime: z.string(),
          open: z.string(),
          high: z.string(),
          low: z.string(),
          close: z.string(),
          volume: z.string().describe('Volume in base units'),
          trades: z.number()
        })
      )
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let startTime = parseTime(ctx.input.startTime, 'startTime');
    let endTime = ctx.input.endTime ? parseTime(ctx.input.endTime, 'endTime') : Date.now();
    let raw = await client.info<any[]>({
      type: 'candleSnapshot',
      req: { coin: ctx.input.coin.trim(), interval: ctx.input.interval, startTime, endTime }
    });
    let candles = raw.map(candle => ({
      openTime: isoTime(candle.t),
      closeTime: isoTime(candle.T),
      open: candle.o,
      high: candle.h,
      low: candle.l,
      close: candle.c,
      volume: candle.v,
      trades: candle.n
    }));

    return {
      output: { coin: ctx.input.coin.trim(), interval: ctx.input.interval, candles },
      message: `Returned ${candles.length} ${ctx.input.interval} candles for ${ctx.input.coin}.`
    };
  })
  .build();
