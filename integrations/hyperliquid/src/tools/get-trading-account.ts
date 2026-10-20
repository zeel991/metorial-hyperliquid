import { SlateTool } from 'slates';
import { z } from 'zod';
import { tradingAccount } from '../lib/account';
import { HyperliquidClient } from '../lib/client';
import { spec } from '../spec';

export let getTradingAccount = SlateTool.create(spec, {
  key: 'get_trading_account',
  name: 'Get Trading Account',
  description:
    'Show which Hyperliquid account this connection trades for: the API wallet address, the master account that approved it, the subaccount or vault (if any), the network, and when the API wallet expires. Call this before trading to confirm the account.',
  tags: { readOnly: true, destructive: false }
})
  .authMethods(['api_wallet'])
  .input(z.object({}))
  .output(
    z.object({
      network: z.string(),
      tradingAccount: z
        .string()
        .describe('Account whose orders and positions trading tools act on'),
      accountAddress: z.string().describe('Master account that approved the API wallet'),
      vaultAddress: z.string().nullable(),
      agentAddress: z.string().describe('API wallet address'),
      agentName: z.string().nullable(),
      agentValidUntil: z
        .string()
        .nullable()
        .describe('Expiry of the API wallet approval, when Hyperliquid reports one')
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let agents = await client.info<
      Array<{ name: string; address: string; validUntil?: number }>
    >({
      type: 'extraAgents',
      user: ctx.auth.accountAddress
    });
    let agent = agents.find(
      entry => entry.address.toLowerCase() === ctx.auth.agentAddress?.toLowerCase()
    );

    return {
      output: {
        network: ctx.config.network,
        tradingAccount: tradingAccount(ctx.auth)!,
        accountAddress: ctx.auth.accountAddress!,
        vaultAddress: ctx.auth.vaultAddress ?? null,
        agentAddress: ctx.auth.agentAddress!,
        agentName: agent?.name ?? null,
        agentValidUntil: agent?.validUntil ? new Date(agent.validUntil).toISOString() : null
      },
      message: `Trading ${tradingAccount(ctx.auth)} on ${ctx.config.network} with API wallet ${ctx.auth.agentAddress}.`
    };
  })
  .build();
