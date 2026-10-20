import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import fixtures from './__fixtures__/python-sdk-signatures.json';
import {
  actionHash,
  addressFromPrivateKey,
  type Network,
  nextNonce,
  parsePrivateKey,
  signL1Action
} from './signing';

// Fixtures were produced by hyperliquid-python-sdk's sign_l1_action with a throwaway key,
// so these tests pin the TypeScript signer to the reference implementation byte for byte.
describe('L1 action signing matches the Hyperliquid Python SDK', () => {
  let privateKey = parsePrivateKey(fixtures.privateKey);

  it('derives the same address', () => {
    expect(addressFromPrivateKey(privateKey)).toBe(fixtures.address);
  });

  for (let fixture of fixtures.cases) {
    it(fixture.name, () => {
      let vaultAddress = fixture.vaultAddress ?? undefined;
      let expiresAfter = fixture.expiresAfter ?? undefined;
      let hash = actionHash(fixture.action, vaultAddress, fixture.nonce, expiresAfter);
      expect(`0x${bytesToHex(hash)}`).toBe(fixture.actionHash);

      let signature = signL1Action({
        privateKey,
        action: fixture.action,
        vaultAddress,
        nonce: fixture.nonce,
        expiresAfter,
        network: fixture.network as Network
      });
      expect(BigInt(signature.r)).toBe(BigInt(fixture.signature.r));
      expect(BigInt(signature.s)).toBe(BigInt(fixture.signature.s));
      expect(signature.v).toBe(fixture.signature.v);
    });
  }

  it('signs differently for mainnet and testnet', () => {
    let fixture = fixtures.cases[0]!;
    let sign = (network: Network) =>
      signL1Action({ privateKey, action: fixture.action, nonce: fixture.nonce, network });
    expect(sign('mainnet').r).not.toBe(sign('testnet').r);
  });
});

describe('private keys and nonces', () => {
  it('rejects malformed keys', () => {
    expect(() => parsePrivateKey('0x1234')).toThrow(/32 bytes/);
    expect(() => parsePrivateKey(`0x${'0'.repeat(64)}`)).toThrow(/not a valid/);
  });

  it('issues strictly increasing nonces', () => {
    let nonces = Array.from({ length: 50 }, () => nextNonce());
    for (let index = 1; index < nonces.length; index++) {
      expect(nonces[index]!).toBeGreaterThan(nonces[index - 1]!);
    }
  });
});
