import {ethers, waffle} from 'hardhat';
import chai from 'chai';

import RareBlocksSubscriptionArtifact from '../artifacts/contracts/RareBlocksSubscription.sol/RareBlocksSubscription.json';
import {RareBlocksSubscription} from '../typechain/RareBlocksSubscription';
import StakeArtifact from '../artifacts/contracts/Stake.sol/Stake.json';
import {Stake} from '../typechain/Stake';
import RareBlocksArtifact from '../artifacts/contracts/mocks/RareBlocks.sol/RareBlocks.json';
import {RareBlocks} from '../typechain/RareBlocks';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber} from 'ethers';
import {increaseWorldTimeInSeconds} from './utils';
import {SubscriptionConfig} from './model/SubscriptionConfig';

const {deployContract} = waffle;
const {expect} = chai;

const SECONDS_IN_MONTH = 60 * 60 * 24 * 31;

describe('Rent Contract', () => {
  let owner: SignerWithAddress;
  let tresury: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let staker3: SignerWithAddress;
  let subscriber1: SignerWithAddress;
  let subscriber2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  let rareBlocks: RareBlocks;
  let rareblocksSubscription: RareBlocksSubscription;
  let stake: Stake;

  const config: SubscriptionConfig = {
    subscriptionMonthPrice: ethers.utils.parseEther('0.1'),
    maxSubscriptions: BigNumber.from(2),
    stakerFee: BigNumber.from(8000), // 80%,
    stakerAddress: null,
    tresuryAddress: null,
  };

  beforeEach(async () => {
    [owner, tresury, staker1, staker2, staker3, subscriber1, subscriber2, ...addrs] = await ethers.getSigners();

    rareBlocks = (await deployContract(owner, RareBlocksArtifact)) as RareBlocks;

    stake = (await deployContract(owner, StakeArtifact, [rareBlocks.address])) as Stake;

    // update global config
    config.stakerAddress = stake.address;
    config.tresuryAddress = tresury.address;

    rareblocksSubscription = (await deployContract(owner, RareBlocksSubscriptionArtifact, [
      config.subscriptionMonthPrice,
      config.maxSubscriptions,
      config.stakerFee,
      config.stakerAddress,
      config.tresuryAddress,
    ])) as RareBlocksSubscription;

    // allow the rent contract to send funds to the Staking contract
    await stake.updateAllowedSubscriptions([rareblocksSubscription.address], [true]);

    // Prepare rareblocks
    await rareBlocks.connect(owner).setOpenMintActive(true);

    // Mint rareblock for the staker1
    await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});

    // Mint rareblock for the staker2
    await rareBlocks.connect(staker2).mint(staker2.address, 1, {value: ethers.utils.parseEther('0.08')});
    await rareBlocks.connect(staker2).mint(staker2.address, 1, {value: ethers.utils.parseEther('0.08')});

    // Mint rareblock for the staker3
    await rareBlocks.connect(staker3).mint(staker3.address, 1, {value: ethers.utils.parseEther('0.08')});
    await rareBlocks.connect(staker3).mint(staker3.address, 1, {value: ethers.utils.parseEther('0.08')});
    await rareBlocks.connect(staker3).mint(staker3.address, 1, {value: ethers.utils.parseEther('0.08')});
  });

  describe('Test rent()', () => {
    it('fail to rent with 0 month duration', async () => {
      const tx = rareblocksSubscription.connect(subscriber1).subscribe(0, {value: ethers.utils.parseEther('0.1')});

      await expect(tx).to.be.revertedWith('INVALID_AMOUNT_OF_MONTHS');
    });
    it('fail to rent with 13 month duration', async () => {
      const tx = rareblocksSubscription.connect(subscriber1).subscribe(13, {value: ethers.utils.parseEther('1.3')});

      await expect(tx).to.be.revertedWith('INVALID_AMOUNT_OF_MONTHS');
    });
    it('fail to rent without providing correct amount of ETH', async () => {
      const tx = rareblocksSubscription.connect(subscriber1).subscribe(1, {value: ethers.utils.parseEther('0.01')});

      await expect(tx).to.be.revertedWith('NOT_ENOUGH_FUNDS');
    });
    it('fail to rent when max amount of rents has reached', async () => {
      await rareblocksSubscription.connect(owner).setMaxSubscriptions(0);
      const tx = rareblocksSubscription.connect(subscriber1).subscribe(1, {value: ethers.utils.parseEther('0.1')});

      await expect(tx).to.be.revertedWith('MAX_SUBSCRIPTIONS_REACHED');
    });
    it('fail to rent when user has an active rent', async () => {
      await rareblocksSubscription.connect(subscriber1).subscribe(1, {value: ethers.utils.parseEther('0.1')});
      const tx = rareblocksSubscription.connect(subscriber1).subscribe(1, {value: ethers.utils.parseEther('0.1')});

      await expect(tx).to.be.revertedWith('SUBSCRIPTION_STILL_ACTIVE');
    });
    it('rent successfully for 1 month', async () => {
      const nowInSeconds = new Date().getTime() / 1000;
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);

      const amountRentedBefore = await rareblocksSubscription.subscriptionCount();
      const rentExpireDateBefore = await rareblocksSubscription.subscriptions(subscriber1.address);
      const stakeBalanceBefore = await rareblocksSubscription.stakerBalance();

      const tx = rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      // amountRented increased by 1
      // rents[msg.sender] updated to current block timestamp + 31 days * months
      // stakerBalance increased by stakersFee -> (msg.value * stakerFeePercent) / STAKER_MAX_FEE
      // Rented event emitted

      // Check if event is emitted
      await expect(tx)
        .to.emit(rareblocksSubscription, 'Subscribed')
        .withArgs(subscriber1.address, amountOfMonths, ethToSend);

      // Check amount rented increased by 1
      const amountRentedAfter = await rareblocksSubscription.subscriptionCount();
      expect(amountRentedAfter).to.equal(amountRentedBefore.add(1));

      // // Check rent expire date updated
      const rentExpireDateAfter = await rareblocksSubscription.subscriptions(subscriber1.address);
      expect(rentExpireDateAfter).to.be.gt(rentExpireDateBefore);
      expect(rentExpireDateAfter.toNumber()).to.be.gt(nowInSeconds + SECONDS_IN_MONTH * amountOfMonths);

      // // Check stakerBalance
      const stakerFeeEarned = ethToSend.mul(config.stakerFee).div(10000);
      const stakeBalanceAfter = await rareblocksSubscription.stakerBalance();
      expect(stakeBalanceAfter).to.be.gt(stakeBalanceBefore);
      expect(stakeBalanceAfter).to.equal(stakeBalanceBefore.add(stakerFeeEarned));

      const isRentActive = await rareblocksSubscription.connect(subscriber1).isSubscriptionActive();
      expect(isRentActive).to.equal(true);
    });
  });

  describe('Test isRentActive()', () => {
    it('if not renting should be false', async () => {
      const isRentActive = await rareblocksSubscription.connect(subscriber1).isSubscriptionActive();
      expect(isRentActive).to.equal(false);
    });
    it('if rent is active should be true', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      const isRentActive = await rareblocksSubscription.connect(subscriber1).isSubscriptionActive();
      expect(isRentActive).to.equal(true);
    });
    it('if rent has expired should be false', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      increaseWorldTimeInSeconds(SECONDS_IN_MONTH * amountOfMonths, true);

      const isRentActive = await rareblocksSubscription.connect(subscriber1).isSubscriptionActive();
      expect(isRentActive).to.equal(false);
    });
  });

  describe('Test withdrawTresury()', () => {
    it('revert if not the owner', async () => {
      const tx = rareblocksSubscription.connect(subscriber1).withdrawTresury();
      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('revert if tresury balance is 0', async () => {
      const tx = rareblocksSubscription.connect(owner).withdrawTresury();
      await expect(tx).to.be.revertedWith('NO_TRESURY');
    });
    it('revert on double withdraw', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      await rareblocksSubscription.connect(owner).withdrawTresury();

      const tx = rareblocksSubscription.connect(owner).withdrawTresury();
      await expect(tx).to.be.revertedWith('NO_TRESURY');
    });
    it('success, send tresury balance to tresury address', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      const stakerFeeBalance = await rareblocksSubscription.stakerBalance();
      const rentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      const tresuryBalance = rentBalance.sub(stakerFeeBalance);
      const tx = rareblocksSubscription.connect(owner).withdrawTresury();

      await expect(tx)
        .to.emit(rareblocksSubscription, 'TresuryWithdraw')
        .withArgs(owner.address, tresury.address, tresuryBalance);

      await expect(await tx).to.changeEtherBalance(tresury, tresuryBalance);

      const rentBalanceAfterTresuryWithdraw = await ethers.provider.getBalance(rareblocksSubscription.address);
      expect(rentBalanceAfterTresuryWithdraw).to.equal(stakerFeeBalance);
    });
    it('success, send tresury balance to tresury address after staker payout', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      await rareblocksSubscription.connect(owner).stakerPayout();

      const stakerFeeBalance = await rareblocksSubscription.stakerBalance();
      const rentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      const tresuryBalance = rentBalance.sub(stakerFeeBalance);
      const tx = rareblocksSubscription.connect(owner).withdrawTresury();

      await expect(tx)
        .to.emit(rareblocksSubscription, 'TresuryWithdraw')
        .withArgs(owner.address, tresury.address, tresuryBalance);

      await expect(await tx).to.changeEtherBalance(tresury, tresuryBalance);

      const finalRentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      expect(finalRentBalance).to.equal(0);
    });
  });

  describe('Test stakerPayout()', () => {
    it('revert if tresury balance is 0', async () => {
      const tx = rareblocksSubscription.connect(subscriber1).stakerPayout();
      await expect(tx).to.be.revertedWith('NO_STAKER_BALANCE');
    });
    it('revert on double withdraw', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      await rareblocksSubscription.connect(subscriber1).stakerPayout();

      const tx = rareblocksSubscription.connect(subscriber1).stakerPayout();
      await expect(tx).to.be.revertedWith('NO_STAKER_BALANCE');
    });
    it('success, send staker fee balance to stake address', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      const stakerFeeBalance = await rareblocksSubscription.stakerBalance();
      const rentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      const tresuryBalance = rentBalance.sub(stakerFeeBalance);
      const tx = rareblocksSubscription.connect(subscriber1).stakerPayout();

      await expect(tx)
        .to.emit(rareblocksSubscription, 'StakerPayout')
        .withArgs(subscriber1.address, stake.address, stakerFeeBalance);

      // There seems to be some problem with waffle `changeEtherBalance` called on contracts
      // await expect(await tx).to.changeEtherBalance(stake.address, stakerFeeBalance);

      await tx;
      const stakerBalance = await ethers.provider.getBalance(stake.address);
      expect(stakerBalance).to.equal(stakerFeeBalance);

      const rentBalanceAfterStakerPayoutWithdraw = await ethers.provider.getBalance(rareblocksSubscription.address);
      expect(rentBalanceAfterStakerPayoutWithdraw).to.equal(tresuryBalance);
    });
    it('success, send staker fee balance to stake address after tresury withdraw', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      await rareblocksSubscription.connect(owner).withdrawTresury();

      const stakerFeeBalance = await rareblocksSubscription.stakerBalance();
      const rentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      const tresuryBalance = rentBalance.sub(stakerFeeBalance);
      const tx = rareblocksSubscription.connect(subscriber1).stakerPayout();

      await expect(tx)
        .to.emit(rareblocksSubscription, 'StakerPayout')
        .withArgs(subscriber1.address, stake.address, stakerFeeBalance);

      // There seems to be some problem with waffle `changeEtherBalance` called on contracts
      // await expect(await tx).to.changeEtherBalance(stake.address, stakerFeeBalance);

      await tx;
      const stakerBalance = await ethers.provider.getBalance(stake.address);
      expect(stakerBalance).to.equal(stakerFeeBalance);

      const finalRentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      expect(finalRentBalance).to.equal(0);
    });
  });
});
