import { createApiServiceError, SlateTool } from 'slates';
import { z } from 'zod';
import { requireWallet, tradingAccount } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { requireTradable, resolvePerpMarket } from '../lib/markets';
import { spec } from '../spec';

export let updateLeverage = SlateTool.create(spec, {
  key: 'update_leverage',
  name: 'Update Leverage',
  description:
    "Set the leverage and margin mode (cross or isolated) the connected trading account uses for one perp coin. Applies to the open position and future orders. Leverage cannot exceed the market's max leverage; some markets are isolated-only.",
  tags: { readOnly: false, destructive: false }
})
  .authMethods(['api_wallet'])
  .input(
    z.object({
      coin: z.string().describe('Perp coin, e.g. "ETH"'),
      leverage: z.number().int().min(1).describe('Leverage multiple, e.g. 5'),
      marginMode: z
        .enum(['cross', 'isolated'])
        .describe('cross shares account margin; isolated limits loss to this position')
    })
  )
  .output(
    z.object({
      tradingAccount: z.string(),
      coin: z.string(),
      leverage: z.number(),
      marginMode: z.enum(['cross', 'isolated'])
    })
  )
  .handleInvocation(async ctx => {
    let wallet = requireWallet(ctx.auth);
    let client = new HyperliquidClient(ctx.config.network);
    let market = requireTradable(await resolvePerpMarket(client, ctx.input.coin));

    if (ctx.input.leverage > market.maxLeverage) {
      throw createApiServiceError(
        `${market.coin} allows at most ${market.maxLeverage}x leverage.`,
        { reason: 'hyperliquid_invalid_leverage' }
      );
    }
    if (ctx.input.marginMode === 'cross' && market.onlyIsolated) {
      throw createApiServiceError(`${market.coin} only supports isolated margin.`, {
        reason: 'hyperliquid_invalid_leverage'
      });
    }

    await client.exchange({
      ...wallet,
      action: {
        type: 'updateLeverage',
        asset: market.assetId,
        isCross: ctx.input.marginMode === 'cross',
        leverage: ctx.input.leverage
      }
    });

    return {
      output: {
        tradingAccount: tradingAccount(ctx.auth)!,
        coin: market.coin,
        leverage: ctx.input.leverage,
        marginMode: ctx.input.marginMode
      },
      message: `Set ${market.coin} to ${ctx.input.leverage}x ${ctx.input.marginMode}.`
    };
  })
  .build();
