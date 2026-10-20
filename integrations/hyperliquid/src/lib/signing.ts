import { encode } from '@msgpack/msgpack';
import { secp256k1 } from '@noble/curves/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { createApiServiceError } from 'slates';

export type Network = 'mainnet' | 'testnet';

export type L1Signature = { r: string; s: string; v: number };

// L1 actions (orders, cancels, leverage) are signed as an EIP-712 "phantom agent" whose
// connectionId is keccak256(msgpack(action) || nonce || vault flag [|| expiresAfter]).
// This mirrors sign_l1_action in hyperliquid-python-sdk (utils/signing.py).

let uint256 = (value: number) => {
  let bytes = new Uint8Array(32);
  new DataView(bytes.buffer).setBigUint64(24, BigInt(value));
  return bytes;
};

let uint64 = (value: number) => {
  let bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value));
  return bytes;
};

let DOMAIN_SEPARATOR = keccak_256(
  concatBytes(
    keccak_256(
      utf8ToBytes(
        'EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'
      )
    ),
    keccak_256(utf8ToBytes('Exchange')),
    keccak_256(utf8ToBytes('1')),
    uint256(1337),
    new Uint8Array(32)
  )
);

let AGENT_TYPEHASH = keccak_256(utf8ToBytes('Agent(string source,bytes32 connectionId)'));

let stripHexPrefix = (value: string) => value.trim().replace(/^0x/i, '');

export let normalizeAddress = (value: string, field = 'address') => {
  let hex = stripHexPrefix(value).toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(hex)) {
    throw createApiServiceError(`${field} must be a 0x-prefixed 20-byte hex address.`, {
      reason: 'hyperliquid_invalid_address'
    });
  }
  return `0x${hex}`;
};

export let parsePrivateKey = (value: string) => {
  let hex = stripHexPrefix(value).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) {
    throw createApiServiceError(
      'The API wallet private key must be 32 bytes of hex (64 characters, optionally 0x-prefixed).',
      { reason: 'hyperliquid_invalid_private_key' }
    );
  }
  let key = hexToBytes(hex);
  if (!secp256k1.utils.isValidPrivateKey(key)) {
    throw createApiServiceError('The API wallet private key is not a valid secp256k1 key.', {
      reason: 'hyperliquid_invalid_private_key'
    });
  }
  return key;
};

export let addressFromPrivateKey = (privateKey: Uint8Array) => {
  let publicKey = secp256k1.getPublicKey(privateKey, false);
  return `0x${bytesToHex(keccak_256(publicKey.slice(1)).slice(12))}`;
};

export let actionHash = (
  action: Record<string, unknown>,
  vaultAddress: string | undefined,
  nonce: number,
  expiresAfter?: number
) => {
  let parts: Uint8Array[] = [encode(action, { ignoreUndefined: true }), uint64(nonce)];
  if (vaultAddress) {
    parts.push(new Uint8Array([1]), hexToBytes(stripHexPrefix(vaultAddress)));
  } else {
    parts.push(new Uint8Array([0]));
  }
  if (expiresAfter !== undefined) {
    parts.push(new Uint8Array([0]), uint64(expiresAfter));
  }
  return keccak_256(concatBytes(...parts));
};

export let signL1Action = (d: {
  privateKey: Uint8Array;
  action: Record<string, unknown>;
  vaultAddress?: string;
  nonce: number;
  network: Network;
  expiresAfter?: number;
}): L1Signature => {
  let connectionId = actionHash(d.action, d.vaultAddress, d.nonce, d.expiresAfter);
  let structHash = keccak_256(
    concatBytes(
      AGENT_TYPEHASH,
      keccak_256(utf8ToBytes(d.network === 'mainnet' ? 'a' : 'b')),
      connectionId
    )
  );
  let digest = keccak_256(
    concatBytes(new Uint8Array([0x19, 0x01]), DOMAIN_SEPARATOR, structHash)
  );
  let signature = secp256k1.sign(digest, d.privateKey);

  return {
    r: `0x${signature.r.toString(16)}`,
    s: `0x${signature.s.toString(16)}`,
    v: 27 + signature.recovery
  };
};

// Exchange nonces must be unique per signer, so concurrent calls in one process never reuse a millisecond.
let lastNonce = 0;
export let nextNonce = () => {
  lastNonce = Math.max(Date.now(), lastNonce + 1);
  return lastNonce;
};
