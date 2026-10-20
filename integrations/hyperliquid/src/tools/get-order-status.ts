import { createApiServiceError, SlateTool } from 'slates';
import { z } from 'zod';
import { resolveUser } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { isoTime } from '../lib/format';
import { spec } from '../spec';

export let getOrderStatus = SlateTool.create(spec, {
  key: 'get_order_status',
  name: 'Get Order Status',
  description:
    'Look up one order by order id or client order id and return its current status (open, filled, canceled, rejected, ...) with the order details. Defaults to the connected trading account.',
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      user: z
        .string()
        .optional()
        .describe('Account address (0x...). Defaults to the connected trading account.'),
      oid: z.number().int().optional().describe('Exchange order id'),
      clientOrderId: z
        .string()
        .optional()
        .describe('Client order id (0x + 32 hex characters). Use instead of oid.')
    })
  )
  .output(
    z.object({
      user: z.string(),
      found: z.boolean(),
      status: z
        .string()
        .nullable()
        .describe('e.g. open, filled, canceled, triggered, rejected'),
      statusTime: z.string().nullable(),
      order: z
        .record(z.string(), z.any())
        .nullable()
        .describe('Order details as returned by Hyperliquid')
    })
  )
  .handleInvocation(async ctx => {
    if ((ctx.input.oid === undefined) === !ctx.input.clientOrderId) {
      throw createApiServiceError('Pass exactly one of oid or clientOrderId.', {
        reason: 'hyperliquid_invalid_input'
      });
    }
    let client = new HyperliquidClient(ctx.config.network);
    let user = resolveUser(ctx.input.user, ctx.auth);
    let result = await client.info<any>({
      type: 'orderStatus',
      user,
      oid: ctx.input.oid ?? ctx.input.clientOrderId!.trim().toLowerCase()
    });

    if (result.status !== 'order') {
      return {
        output: { user, found: false, status: null, statusTime: null, order: null },
        message: `No order ${ctx.input.oid ?? ctx.input.clientOrderId} found for ${user}.`
      };
    }

    return {
      output: {
        user,
        found: true,
        status: result.order.status,
        statusTime: isoTime(result.order.statusTimestamp),
        order: result.order.order
      },
      message: `Order ${result.order.order.oid} on ${result.order.order.coin} is ${result.order.status}.`
    };
  })
  .build();
