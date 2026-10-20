import { createApiServiceError } from 'slates';
import { HyperliquidClient } from './client';
import {
  addressFromPrivateKey,
  type Network,
  normalizeAddress,
  parsePrivateKey
} from './signing';

export type HyperliquidAuth = {
  token?: string;
  agentAddress?: string;
  accountAddress?: string;
  vaultAddress?: string;
};

type UserRole =
  | { role: 'agent'; data: { user: string } }
  | { role: 'subAccount'; data: { master: string } }
  | { role: 'user' | 'vault' | 'missing'; data?: unknown };

let walletError = (message: string) =>
  createApiServiceError(message, { reason: 'hyperliquid_invalid_api_wallet' });

// Only approved API (agent) wallets are accepted. A main-wallet key could withdraw and
// transfer funds; an API wallet can only trade, so a leaked connection cannot move money out.
export let validateApiWallet = async (d: {
  privateKey: string;
  vaultAddress?: string;
  network: Network;
}): Promise<Required<Omit<HyperliquidAuth, 'vaultAddress'>> & { vaultAddress?: string }> => {
  let key = parsePrivateKey(d.privateKey);
  let agentAddress = addressFromPrivateKey(key);
  let client = new HyperliquidClient(d.network);
  let role = await client.info<UserRole>({ type: 'userRole', user: agentAddress });

  if (role.role !== 'agent') {
    throw walletError(
      `Address ${agentAddress} is not an approved API wallet on Hyperliquid ${d.network} (role: ${role.role}). Create an API wallet at https://app.hyperliquid.xyz/API and paste its private key. Main wallet keys are rejected because they can withdraw funds.`
    );
  }

  let accountAddress = normalizeAddress(role.data.user, 'master account');
  let vaultAddress = d.vaultAddress?.trim()
    ? normalizeAddress(d.vaultAddress, 'vaultAddress')
    : undefined;

  if (vaultAddress) {
    let vaultRole = await client.info<UserRole>({ type: 'userRole', user: vaultAddress });
    let owner =
      vaultRole.role === 'subAccount'
        ? vaultRole.data.master
        : vaultRole.role === 'vault'
          ? (await client.info<{ leader: string }>({ type: 'vaultDetails', vaultAddress }))
              .leader
          : undefined;
    if (!owner || normalizeAddress(owner) !== accountAddress) {
      throw walletError(
        `${vaultAddress} is not a subaccount or vault led by ${accountAddress}, the account this API wallet trades for.`
      );
    }
  }

  return {
    token: `0x${Buffer.from(key).toString('hex')}`,
    agentAddress,
    accountAddress,
    vaultAddress
  };
};

// The account whose orders and positions trading tools act on.
export let tradingAccount = (auth: HyperliquidAuth) =>
  auth.vaultAddress ?? auth.accountAddress;

export let resolveUser = (user: string | undefined, auth: HyperliquidAuth) => {
  if (user?.trim()) return normalizeAddress(user, 'user');
  let fallback = tradingAccount(auth);
  if (fallback) return fallback;
  throw createApiServiceError(
    'Pass `user` (a 0x address), or connect an API wallet so the connected account is used.',
    { reason: 'hyperliquid_user_required' }
  );
};

export let requireWallet = (auth: HyperliquidAuth) => {
  if (!auth.token || !auth.accountAddress) {
    throw createApiServiceError('This tool needs an API wallet connection.', {
      reason: 'hyperliquid_api_wallet_required'
    });
  }
  return { privateKey: auth.token, vaultAddress: auth.vaultAddress };
};
