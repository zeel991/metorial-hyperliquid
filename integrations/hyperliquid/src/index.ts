import { Slate } from 'slates';
import { spec } from './spec';
import {
  cancelOrders,
  getAccountState,
  getCandles,
  getFills,
  getFundingHistory,
  getFundingPayments,
  getOpenOrders,
  getOrderBook,
  getOrderStatus,
  getTradingAccount,
  listPerpDexs,
  listPerpMarketsTool,
  listSpotMarkets,
  placeOrder,
  scheduleCancel,
  updateLeverage
} from './tools';

export let provider = Slate.create({
  spec,
  tools: [
    listPerpDexs,
    listPerpMarketsTool,
    listSpotMarkets,
    getOrderBook,
    getCandles,
    getFundingHistory,
    getAccountState,
    getOpenOrders,
    getFills,
    getOrderStatus,
    getFundingPayments,
    getTradingAccount,
    placeOrder,
    cancelOrders,
    updateLeverage,
    scheduleCancel
  ],
  triggers: []
});
