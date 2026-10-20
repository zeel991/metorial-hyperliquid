import {
  buildApiServiceError,
  createApiServiceError,
  createAxios,
  requestAxiosData
} from 'slates';
import {
  type L1Signature,
  type Network,
  nextNonce,
  normalizeAddress,
  parsePrivateKey,
  signL1Action
} from './signing';

export let API_URLS: Record<Network, string> = {
  mainnet: 'https://api.hyperliquid.xyz',
  testnet: 'https://api.hyperliquid-testnet.xyz'
};

export type ExchangeResult = {
  status: 'ok' | 'err';
  response: any;
};

let hyperliquidError = (error: unknown, operation: string) =>
  buildApiServiceError(error, {
    providerLabel: 'Hyperliquid',
    reason: 'hyperliquid_api_error',
    operation,
    extractResponse: (input, helpers) => helpers.getResponseWithBody(input)
  });

export class HyperliquidClient {
  private axios: ReturnType<typeof createAxios>;

  constructor(readonly network: Network = 'mainnet') {
    this.axios = createAxios({
      baseURL: API_URLS[network],
      headers: { 'Content-Type': 'application/json' }
    });
  }

  info<T = any>(body: Record<string, unknown>): Promise<T> {
    return requestAxiosData<T>(
      `info ${String(body.type)}`,
      () => this.axios.post('/info', body),
      hyperliquidError
    );
  }

  // Signs an L1 action with the API wallet and posts it. The API wallet can only sign
  // trading actions; withdrawals and transfers need the master wallet and are never built here.
  async exchange(d: {
    privateKey: string;
    vaultAddress?: string;
    action: Record<string, unknown>;
  }): Promise<ExchangeResult> {
    let nonce = nextNonce();
    let vaultAddress = d.vaultAddress
      ? normalizeAddress(d.vaultAddress, 'vaultAddress')
      : undefined;
    let signature: L1Signature = signL1Action({
      privateKey: parsePrivateKey(d.privateKey),
      action: d.action,
      vaultAddress,
      nonce,
      network: this.network
    });

    let result = await requestAxiosData<ExchangeResult>(
      `exchange ${String(d.action.type)}`,
      () =>
        this.axios.post('/exchange', {
          action: d.action,
          nonce,
          signature,
          vaultAddress: vaultAddress ?? null
        }),
      hyperliquidError
    );

    if (result?.status !== 'ok') {
      let detail =
        typeof result?.response === 'string' ? result.response : JSON.stringify(result);
      throw createApiServiceError(
        `Hyperliquid rejected the ${d.action.type} action: ${detail}`,
        {
          reason: 'hyperliquid_exchange_rejected'
        }
      );
    }

    return result;
  }
}
