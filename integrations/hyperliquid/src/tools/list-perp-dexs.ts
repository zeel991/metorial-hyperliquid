import { SlateTool } from 'slates';
import { z } from 'zod';
import { HyperliquidClient } from '../lib/client';
import { spec } from '../spec';

export let listPerpDexs = SlateTool.create(spec, {
  key: 'list_perp_dexs',
  name: 'List Perp Dexes',
  description:
    'List perp dexes on Hyperliquid: the main dex plus builder-deployed (HIP-3) dexes, with each deployer, oracle updater, and fee recipient. Use a dex name with list_perp_markets to see its markets.',
  tags: { readOnly: true, destructive: false }
})
  .input(z.object({}))
  .output(
    z.object({
      dexes: z.array(
        z.object({
          name: z.string().describe('Dex name; "" is the main Hyperliquid dex'),
          fullName: z.string().nullable(),
          deployer: z.string().nullable(),
          oracleUpdater: z.string().nullable(),
          feeRecipient: z.string().nullable(),
          marketCount: z
            .number()
            .nullable()
            .describe('Markets with an open-interest cap entry')
        })
      )
    })
  )
  .handleInvocation(async ctx => {
    let client = new HyperliquidClient(ctx.config.network);
    let raw = await client.info<any[]>({ type: 'perpDexs' });
    let dexes = raw.map(dex =>
      dex
        ? {
            name: dex.name,
            fullName: dex.fullName ?? null,
            deployer: dex.deployer ?? null,
            oracleUpdater: dex.oracleUpdater ?? null,
            feeRecipient: dex.feeRecipient ?? null,
            marketCount: Array.isArray(dex.assetToStreamingOiCap)
              ? dex.assetToStreamingOiCap.length
              : null
          }
        : {
            name: '',
            fullName: 'Hyperliquid',
            deployer: null,
            oracleUpdater: null,
            feeRecipient: null,
            marketCount: null
          }
    );
    return {
      output: { dexes },
      message: `Found ${dexes.length} perp dexes (${dexes.length - 1} builder-deployed) on ${ctx.config.network}.`
    };
  })
  .build();
