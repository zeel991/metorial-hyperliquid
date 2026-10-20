import { SlateConfig } from 'slates';
import { z } from 'zod';

export let config = SlateConfig.create(
  z.object({
    network: z
      .enum(['mainnet', 'testnet'])
      .default('mainnet')
      .describe(
        'Hyperliquid network. "mainnet" for real funds, "testnet" for test funds. API wallets are approved per network.'
      )
  })
);
