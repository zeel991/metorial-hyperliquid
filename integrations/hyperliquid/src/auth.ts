import { SlateAuth } from 'slates';
import { z } from 'zod';
import { validateApiWallet } from './lib/account';
import { normalizeAddress } from './lib/signing';

let networkOf = (config?: Record<string, any>) =>
  config?.network === 'testnet' ? ('testnet' as const) : ('mainnet' as const);

export let auth = SlateAuth.create()
  .output(
    z.object({
      token: z
        .string()
        .optional()
        .describe('API wallet private key used to sign trading actions'),
      agentAddress: z.string().optional().describe('Address of the API wallet'),
      accountAddress: z
        .string()
        .optional()
        .describe(
          'Default account to read; for API wallets, the master account that approved it'
        ),
      vaultAddress: z
        .string()
        .optional()
        .describe('Subaccount or vault the API wallet trades on behalf of')
    })
  )
  // Read-only connections hold no key, so trading tools (restricted to api_wallet) are never offered.
  .addCustomAuth({
    type: 'auth.custom',
    name: 'Read-only (no key)',
    key: 'read_only',
    inputSchema: z.object({
      accountAddress: z
        .string()
        .optional()
        .describe(
          'Optional default account to read (0x...). Account tools still accept any address.'
        )
    }),
    getOutput: async ctx => ({
      output: ctx.input.accountAddress?.trim()
        ? { accountAddress: normalizeAddress(ctx.input.accountAddress, 'accountAddress') }
        : {}
    })
  })
  .addTokenAuth({
    type: 'auth.token',
    name: 'API Wallet',
    key: 'api_wallet',
    docs: [
      {
        type: 'docs.auth.token',
        name: 'API wallets',
        url: 'https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets'
      }
    ],
    inputSchema: z.object({
      privateKey: z
        .string()
        .describe(
          'Private key of a Hyperliquid API wallet, created at https://app.hyperliquid.xyz/API. Main wallet keys are rejected.'
        ),
      vaultAddress: z
        .string()
        .optional()
        .describe(
          'Optional subaccount or vault address to trade on behalf of. Leave empty to trade the master account.'
        )
    }),
    getOutput: async ctx => ({
      output: await validateApiWallet({
        privateKey: ctx.input.privateKey,
        vaultAddress: ctx.input.vaultAddress,
        network: networkOf(ctx.config)
      })
    }),
    getProfile: async (ctx: {
      output: { agentAddress?: string; accountAddress?: string; vaultAddress?: string };
    }) => ({
      profile: {
        id: ctx.output.vaultAddress ?? ctx.output.accountAddress,
        name: `Hyperliquid ${ctx.output.vaultAddress ?? ctx.output.accountAddress}`,
        accountAddress: ctx.output.accountAddress,
        agentAddress: ctx.output.agentAddress,
        vaultAddress: ctx.output.vaultAddress
      }
    })
  });
