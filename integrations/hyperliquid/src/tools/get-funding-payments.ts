import { SlateTool } from 'slates';
import { z } from 'zod';
import { resolveUser } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { isoTime, parseTime } from '../lib/format';
import { spec } from '../spec';

export let getFundingPayments = SlateTool.create(spec, {
  key: 'get_funding_payments',
  name: 'Get Funding Payments',
  description:
    'Get the hourly funding payments an account paid or received on its perp positions in a time window. Negative usdc means the account paid. Responses are capped at 500 entries; continue from the last returned time. Defaults to the connected trading account.',
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
        .describe('Window end, ISO 8601 or Unix milliseconds (default now)')
    })
  )
  .output(
    z.object({
      user: z.string(),
      payments: z.array(
        z.object({
          time: z.string(),
          coin: z.string(),
          usdc: z.string().describe('Payment in USDC; negative means paid'),
          positionSize: z.string(),
          fundingRate: z.string()
        })
      ),
      netUsdc: z.number().describe('Sum of the returned payments')
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let user = resolveUser(ctx.input.user, ctx.auth);
    let raw = await client.info<any[]>({
      type: 'userFunding',
      user,
      startTime: parseTime(ctx.input.startTime, 'startTime'),
      ...(ctx.input.endTime ? { endTime: parseTime(ctx.input.endTime, 'endTime') } : {})
    });
    let payments = raw
      .filter(entry => entry.delta?.type === 'funding')
      .map(entry => ({
        time: isoTime(entry.time),
        coin: entry.delta.coin,
        usdc: entry.delta.usdc,
        positionSize: entry.delta.szi,
        fundingRate: entry.delta.fundingRate
      }));
    let netUsdc = payments.reduce((sum, payment) => sum + Number(payment.usdc), 0);

    return {
      output: { user, payments, netUsdc },
      message: `${payments.length} funding payments for ${user}, net ${netUsdc.toFixed(2)} USDC.`
    };
  })
  .build();
