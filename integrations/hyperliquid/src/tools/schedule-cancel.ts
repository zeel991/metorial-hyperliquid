import { createApiServiceError, SlateTool } from 'slates';
import { z } from 'zod';
import { requireWallet, tradingAccount } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { isoTime, parseTime } from '../lib/format';
import { spec } from '../spec';

export let scheduleCancel = SlateTool.create(spec, {
  key: 'schedule_cancel',
  name: 'Schedule Cancel-All',
  description:
    "Arm or clear Hyperliquid's dead man's switch for the connected trading account: at the scheduled time every open order is canceled. Re-arm it periodically while an agent is running so its orders are pulled if it stops. The time must be at least 5 seconds ahead; Hyperliquid allows at most 10 triggers per UTC day.",
  tags: { readOnly: false, destructive: true }
})
  .authMethods(['api_wallet'])
  .input(
    z.object({
      cancelAt: z
        .string()
        .optional()
        .describe(
          'When to cancel all open orders: ISO 8601 or Unix milliseconds. Omit with clear=true to remove the schedule.'
        ),
      clear: z
        .boolean()
        .optional()
        .describe('Remove a scheduled cancel instead of setting one')
    })
  )
  .output(
    z.object({
      tradingAccount: z.string(),
      scheduledFor: z
        .string()
        .nullable()
        .describe('Scheduled cancel time, or null when cleared')
    })
  )
  .handleInvocation(async ctx => {
    if (Boolean(ctx.input.cancelAt) === Boolean(ctx.input.clear)) {
      throw createApiServiceError('Pass either cancelAt or clear=true.', {
        reason: 'hyperliquid_invalid_input'
      });
    }
    let wallet = requireWallet(ctx.auth);
    let client = new HyperliquidClient(ctx.config.network);

    let time = ctx.input.cancelAt ? parseTime(ctx.input.cancelAt, 'cancelAt') : undefined;
    if (time !== undefined && time < Date.now() + 5_000) {
      throw createApiServiceError('cancelAt must be at least 5 seconds in the future.', {
        reason: 'hyperliquid_invalid_input'
      });
    }

    await client.exchange({
      ...wallet,
      action:
        time === undefined ? { type: 'scheduleCancel' } : { type: 'scheduleCancel', time }
    });

    return {
      output: {
        tradingAccount: tradingAccount(ctx.auth)!,
        scheduledFor: time === undefined ? null : isoTime(time)
      },
      message:
        time === undefined
          ? 'Cleared the scheduled cancel-all.'
          : `All open orders will be canceled at ${isoTime(time)} unless re-armed or cleared.`
    };
  })
  .build();
