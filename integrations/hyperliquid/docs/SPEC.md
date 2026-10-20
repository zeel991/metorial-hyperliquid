# Hyperliquid API specification

Hyperliquid is an onchain order-book exchange for perpetual futures and spot. All reads go to `POST {base}/info`; trading actions go to `POST {base}/exchange` signed by an API wallet. Base URLs: `https://api.hyperliquid.xyz` (mainnet) and `https://api.hyperliquid-testnet.xyz` (testnet), chosen by the `network` config.

## Connection

| Method | Input | Can trade |
| --- | --- | --- |
| `read_only` | Optional default `accountAddress` | No |
| `api_wallet` | API wallet `privateKey`, optional `vaultAddress` | Yes |

`api_wallet` derives the key's address and calls `userRole`. Anything other than `agent` is rejected, which rules out main-wallet keys (role `user`): those can sign withdrawals and transfers, API wallets cannot. The master account comes from the agent's `userRole` data. A `vaultAddress` must be a subaccount whose master, or a vault whose leader, is that account. Trading tools act on `vaultAddress` when set, otherwise on the master account.

## Signing

Trading actions are L1 actions: `keccak256(msgpack(action) || nonce (u64 BE) || 0x00 | 0x01 vaultAddress)` becomes the `connectionId` of an EIP-712 `Agent(string source, bytes32 connectionId)` message (domain `Exchange`, version `1`, chainId 1337, zero verifying contract; `source` is `a` on mainnet, `b` on testnet). This mirrors `sign_l1_action` in `hyperliquid-python-sdk`; `src/lib/__fixtures__/python-sdk-signatures.json` holds signatures produced by SDK 0.24.0 and the tests require identical results. Nonces are millisecond timestamps, kept strictly increasing within a process.

Withdrawals, transfers, staking, vault deposits and other user-signed actions are deliberately not implemented.

## Asset ids

Main-dex perps use their index in `meta.universe`. Builder-deployed (HIP-3) perps, named `<dex>:<COIN>`, use `100000 + dexIndex * 10000 + index`, where `dexIndex` is the dex's position in `perpDexs`. Spot pairs use `10000 + index`.

## Order rules

Perp prices may have at most 5 significant figures (integers always allowed) and at most `6 - szDecimals` decimals; sizes at most `szDecimals` decimals. `place_order` rejects values off the grid and reports the nearest valid price rather than rounding silently. Market orders are IOC limit orders at mid × (1 ± slippage), default 1%, max 10%, rounded like the SDK's slippage helper. Hyperliquid enforces a $10 minimum notional.

## Tools

| Tool | Endpoint | Tags | Auth |
| --- | --- | --- | --- |
| `list_perp_dexs` | `perpDexs` | read-only | any |
| `list_perp_markets` | `perpDexs`, `metaAndAssetCtxs` | read-only | any |
| `list_spot_markets` | `spotMetaAndAssetCtxs` | read-only | any |
| `get_order_book` | `l2Book` | read-only | any |
| `get_candles` | `candleSnapshot` (5000 most recent per interval) | read-only | any |
| `get_funding_history` | `fundingHistory` (500 per call) | read-only | any |
| `get_account_state` | `clearinghouseState`, `spotClearinghouseState` | read-only | any |
| `get_open_orders` | `frontendOpenOrders` | read-only | any |
| `get_fills` | `userFillsByTime` (2000 per call) | read-only | any |
| `get_order_status` | `orderStatus` | read-only | any |
| `get_funding_payments` | `userFunding` (500 per call) | read-only | any |
| `get_trading_account` | `extraAgents` | read-only | `api_wallet` |
| `place_order` | `order` | destructive | `api_wallet` |
| `cancel_orders` | `cancel`, `cancelByCloid` | destructive | `api_wallet` |
| `update_leverage` | `updateLeverage` | write | `api_wallet` |
| `schedule_cancel` | `scheduleCancel` | destructive | `api_wallet` |

Tag rationale: fills cannot be reversed, so `place_order` is destructive; canceling (now or on schedule) removes orders that cannot be restored, so both cancel tools are destructive; leverage can be set back, so `update_leverage` is a non-destructive write. Account tools default `user` to the connection's trading account. Trading tools also check for an API wallet themselves, so they refuse to run on a read-only connection even if exposed.

Not covered yet: trigger (TP/SL) orders, order modification, TWAP, and spot order placement.

## Official references

- [Info endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint)
- [Perpetuals info](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint/perpetuals)
- [Exchange endpoint](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/exchange-endpoint)
- [Nonces and API wallets](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/nonces-and-api-wallets)
- [Asset IDs](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/asset-ids)
- [Tick and lot size](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/tick-and-lot-size)
- [Python SDK](https://github.com/hyperliquid-dex/hyperliquid-python-sdk)
