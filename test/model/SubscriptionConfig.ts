import {BigNumber} from 'ethers';

interface SubscriptionConfig {
  subscriptionMonthPrice: BigNumber;
  maxSubscriptions: BigNumber;
  stakerFee: BigNumber; // 80%,
  stakerAddress: null | string;
  tresuryAddress: null | string;
}

export {SubscriptionConfig};
