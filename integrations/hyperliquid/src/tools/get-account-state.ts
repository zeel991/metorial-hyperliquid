import { SlateTool } from 'slates';
import { z } from 'zod';
import { resolveUser } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { isoTime } from '../lib/format';
import { spec } from '../spec';

export let getAccountState = SlateTool.create(spec, {
  key: 'get_account_state',
  name: 'Get Account State',
  description:
    "Get an account's perp positions (size, entry, unrealized PnL, leverage, liquidation price, margin, funding paid), margin summary and withdrawable USDC on one perp dex, plus spot token balances. Works for any address; defaults to the connected trading account.",
  tags: { readOnly: true, destructive: false }
})
  .input(
    z.object({
      user: z
        .string()
        .optional()
        .describe('Account address (0x...). Defaults to the connected trading account.'),
      dex: z
        .string()
        .optional()
        .describe(
          'HIP-3 dex name for positions on a builder-deployed dex. Omit for the main dex.'
        ),
      includeSpot: z
        .boolean()
        .optional()
        .describe('Include spot token balances (default true)')
    })
  )
  .output(
    z.object({
      user: z.string(),
      dex: z.string(),
      time: z.string(),
      marginSummary: z.object({
        accountValue: z.string(),
        totalNtlPos: z.string(),
        totalRawUsd: z.string(),
        totalMarginUsed: z.string()
      }),
      crossMaintenanceMarginUsed: z.string(),
      withdrawable: z.string(),
      positions: z.array(
        z.object({
          coin: z.string(),
          size: z.string().describe('Signed size in base units; negative is short'),
          entryPx: z.string().nullable(),
          positionValue: z.string(),
          unrealizedPnl: z.string(),
          returnOnEquity: z.string(),
          leverageType: z.string(),
          leverage: z.number(),
          liquidationPx: z.string().nullable(),
          marginUsed: z.string(),
          maxLeverage: z.number(),
          fundingSinceOpen: z.string().nullable()
        })
      ),
      spotBalances: z
        .array(
          z.object({
            coin: z.string(),
            total: z.string(),
            hold: z.string().describe('Amount reserved by open orders'),
            entryNtl: z.string().nullable()
          })
        )
        .nullable()
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let user = resolveUser(ctx.input.user, ctx.auth);
    let dex = ctx.input.dex?.trim() ?? '';
    let includeSpot = ctx.input.includeSpot ?? true;

    let [state, spot] = await Promise.all([
      client.info<any>({ type: 'clearinghouseState', user, ...(dex ? { dex } : {}) }),
      includeSpot ? client.info<any>({ type: 'spotClearinghouseState', user }) : null
    ]);

    let positions = (state.assetPositions as any[]).map(({ position }) => ({
      coin: position.coin,
      size: position.szi,
      entryPx: position.entryPx ?? null,
      positionValue: position.positionValue,
      unrealizedPnl: position.unrealizedPnl,
      returnOnEquity: position.returnOnEquity,
      leverageType: position.leverage?.type,
      leverage: position.leverage?.value,
      liquidationPx: position.liquidationPx ?? null,
      marginUsed: position.marginUsed,
      maxLeverage: position.maxLeverage,
      fundingSinceOpen: position.cumFunding?.sinceOpen ?? null
    }));
    let spotBalances = spot
      ? (spot.balances as any[])
          .filter(balance => Number(balance.total) !== 0)
          .map(balance => ({
            coin: balance.coin,
            total: balance.total,
            hold: balance.hold,
            entryNtl: balance.entryNtl ?? null
          }))
      : null;

    return {
      output: {
        user,
        dex,
        time: isoTime(state.time),
        marginSummary: state.marginSummary,
        crossMaintenanceMarginUsed: state.crossMaintenanceMarginUsed,
        withdrawable: state.withdrawable,
        positions,
        spotBalances
      },
      message: `${user}: account value ${state.marginSummary.accountValue} USDC, ${positions.length} open perp positions${dex ? ` on dex "${dex}"` : ''}.`
    };
  })
  .build();
