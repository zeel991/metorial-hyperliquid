import { createApiServiceError } from 'slates';
import type { HyperliquidClient } from './client';

export type PerpMarket = {
  coin: string;
  dex: string;
  assetId: number;
  szDecimals: number;
  maxLeverage: number;
  onlyIsolated: boolean;
  isDelisted: boolean;
  markPx: string | null;
  midPx: string | null;
  oraclePx: string | null;
  funding: string | null;
  openInterest: string | null;
  dayNtlVlm: string | null;
  prevDayPx: string | null;
  premium: string | null;
};

let notFound = (message: string) =>
  createApiServiceError(message, { reason: 'hyperliquid_unknown_market' });

// Builder-deployed (HIP-3) coins are named "<dex>:<COIN>", e.g. "xyz:TSLA".
export let dexOfCoin = (coin: string) => (coin.includes(':') ? coin.split(':')[0]! : '');

export let getDexIndex = async (client: HyperliquidClient, dex: string) => {
  if (!dex) return 0;
  let dexs = await client.info<Array<{ name: string } | null>>({ type: 'perpDexs' });
  let index = dexs.findIndex(entry => entry?.name === dex);
  if (index < 1) {
    throw notFound(`Unknown perp dex "${dex}". Use list_perp_dexs to see deployed dexes.`);
  }
  return index;
};

// Asset ids: main-dex perps use their universe index; HIP-3 perps use
// 100000 + dexIndex * 10000 + index (the Python SDK's 110000 + i * 10000 over perpDexs[1:]).
export let listPerpMarkets = async (client: HyperliquidClient, dex: string) => {
  let dexIndex = await getDexIndex(client, dex);
  let [meta, contexts] = await client.info<[any, any[]]>({
    type: 'metaAndAssetCtxs',
    ...(dex ? { dex } : {})
  });

  return (meta.universe as any[]).map((asset, index): PerpMarket => {
    let context = contexts[index] ?? {};
    return {
      coin: asset.name,
      dex,
      assetId: dexIndex === 0 ? index : 100000 + dexIndex * 10000 + index,
      szDecimals: asset.szDecimals,
      maxLeverage: asset.maxLeverage,
      onlyIsolated: asset.onlyIsolated === true,
      isDelisted: asset.isDelisted === true,
      markPx: context.markPx ?? null,
      midPx: context.midPx ?? null,
      oraclePx: context.oraclePx ?? null,
      funding: context.funding ?? null,
      openInterest: context.openInterest ?? null,
      dayNtlVlm: context.dayNtlVlm ?? null,
      prevDayPx: context.prevDayPx ?? null,
      premium: context.premium ?? null
    };
  });
};

export let resolvePerpMarket = async (client: HyperliquidClient, coin: string) => {
  let requested = coin.trim();
  let markets = await listPerpMarkets(client, dexOfCoin(requested));
  let exact = markets.find(market => market.coin === requested);
  let matches = exact
    ? [exact]
    : markets.filter(market => market.coin.toLowerCase() === requested.toLowerCase());

  if (matches.length !== 1) {
    throw notFound(
      `No perp market named "${coin}". Use list_perp_markets to find the exact coin name (HIP-3 markets are "<dex>:<COIN>").`
    );
  }
  return matches[0]!;
};

export let requireTradable = (market: PerpMarket) => {
  if (market.isDelisted) {
    throw createApiServiceError(`${market.coin} is delisted and cannot be traded.`, {
      reason: 'hyperliquid_market_delisted'
    });
  }
  return market;
};
