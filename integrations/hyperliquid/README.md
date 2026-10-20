# <img src="logo.png" height="20"> Hyperliquid

Read Hyperliquid perpetual and spot markets, order books, candles and funding rates, including builder-deployed (HIP-3) perp dexes. Inspect any account's positions, margin, open orders, fills and funding payments. With an API wallet, place and cancel perp orders, set leverage, and arm a cancel-all dead man's switch.

Two connection types:

- **Read-only (no key):** market and account data only. Optionally set a default account address. Trading tools are not offered and refuse to run.
- **API wallet:** paste the private key of an API wallet created at [app.hyperliquid.xyz/API](https://app.hyperliquid.xyz/API). The key is checked against Hyperliquid on connect, and a main-wallet key is rejected: API wallets can trade but cannot withdraw or transfer funds. Optionally trade for a subaccount or vault you lead.

Pick `mainnet` or `testnet` in the configuration; API wallets are approved per network.

[API documentation](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api)

## License

This integration is licensed under the [FSL-1.1](https://github.com/metorial/metorial-platform/blob/dev/LICENSE).

<div align="center">
  <sub>Built with ❤️ by <a href="https://metorial.com">Metorial</a></sub>
</div>
