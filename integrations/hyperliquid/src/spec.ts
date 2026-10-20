import { SlateSpecification } from 'slates';
import { auth } from './auth';
import { config } from './config';

export let spec = SlateSpecification.create({
  key: 'hyperliquid',
  name: 'Hyperliquid',
  description:
    'Onchain order-book exchange for perpetual futures and spot trading, including builder-deployed (HIP-3) perp markets.',
  metadata: {},
  config,
  auth
});
