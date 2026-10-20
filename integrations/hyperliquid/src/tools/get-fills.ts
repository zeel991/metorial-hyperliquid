import { SlateTool } from 'slates';
import { z } from 'zod';
import { resolveUser } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { isoTime, parseTime } from '../lib/format';
import { spec } from '../spec';

export let getFills = SlateTool.create(spec, {
  key: 'get_fills',
  name: 'Get Fills',
  description:
    "Get an account's trade fills in a time window: coin, side, price, size, direction (open/close long/short), closed PnL, fee and order id. Hyperliquid returns at most 2000 fills per call (oldest first) and keeps only the 10000 most recent fills; continue from the last fill's time for more. Defaults to the connected trading account.",
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      user: z
        .string()
        .optional()
        .describe('Account address (0x...). Defaults to the connected trading account.'),
      startTime: z.string().describe('Window start, ISO 8601 or Unix milliseconds'),
      endTime: z
        .string()
        .optional()
        .describe('Window end, ISO 8601 or Unix milliseconds (default now)'),
      aggregateByTime: z
        .boolean()
        .optional()
        .describe(
          'Combine partial fills of one order that crossed at the same time (default false)'
        ),
      coin: z.string().optional().describe('Only fills for this coin')
    })
  )
  .output(
    z.object({
      user: z.string(),
      fills: z.array(
        z.object({
          time: z.string(),
          coin: z.string(),
          side: z.enum(['buy', 'sell']),
          px: z.string(),
          size: z.string(),
          direction: z.string().describe('e.g. "Open Long", "Close Short"'),
          startPosition: z.string(),
          closedPnl: z.string(),
          fee: z.string(),
          feeToken: z.string(),
          crossed: z.boolean().describe('True when the fill took liquidity'),
          oid: z.number(),
          clientOrderId: z.string().nullable(),
          tid: z.number(),
          hash: z.string()
        })
      ),
      truncated: z.boolean().describe('True when the 2000-fill cap was reached')
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let user = resolveUser(ctx.input.user, ctx.auth);
    let raw = await client.info<any[]>({
      type: 'userFillsByTime',
      user,
      startTime: parseTime(ctx.input.startTime, 'startTime'),
      ...(ctx.input.endTime ? { endTime: parseTime(ctx.input.endTime, 'endTime') } : {}),
      ...(ctx.input.aggregateByTime ? { aggregateByTime: true } : {})
    });
    let coin = ctx.input.coin?.trim().toLowerCase();

    let fills = raw
      .filter(fill => !coin || fill.coin.toLowerCase() === coin)
      .map(fill => ({
        time: isoTime(fill.time),
        coin: fill.coin,
        side: fill.side === 'B' ? ('buy' as const) : ('sell' as const),
        px: fill.px,
        size: fill.sz,
        direction: fill.dir,
        startPosition: fill.startPosition,
        closedPnl: fill.closedPnl,
        fee: fill.fee,
        feeToken: fill.feeToken,
        crossed: fill.crossed === true,
        oid: fill.oid,
        clientOrderId: fill.cloid ?? null,
        tid: fill.tid,
        hash: fill.hash
      }));

    return {
      output: { user, fills, truncated: raw.length >= 2000 },
      message: `Returned ${fills.length} fills for ${user}${raw.length >= 2000 ? ' (capped at 2000; continue from the last fill time)' : ''}.`
    };
  })
  .build();
