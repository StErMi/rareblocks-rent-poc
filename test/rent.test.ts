import {artifacts, ethers, waffle} from 'hardhat';
import chai from 'chai';

import {RareBlocksSubscription, RareBlocksStaking, RareBlocks} from '../typechain';
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
  let rareblocksStaking: RareBlocksStaking;

  const config: SubscriptionConfig = {
    subscriptionMonthPrice: ethers.utils.parseEther('0.1'),
    maxSubscriptions: BigNumber.from(2),
    stakerFee: BigNumber.from(8000), // 80%,
    stakerAddress: null,
    tresuryAddress: null,
  };

  beforeEach(async () => {
    [owner, tresury, staker1, staker2, staker3, subscriber1, subscriber2, ...addrs] = await ethers.getSigners();

    rareBlocks = (await deployContract(owner, await artifacts.readArtifact('RareBlocks'))) as RareBlocks;

    rareblocksStaking = (await deployContract(owner, await artifacts.readArtifact('RareBlocksStaking'), [
      rareBlocks.address,
    ])) as RareBlocksStaking;

    // update global config
    config.stakerAddress = rareblocksStaking.address;
    config.tresuryAddress = tresury.address;

    rareblocksSubscription = (await deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
      config.subscriptionMonthPrice,
      config.maxSubscriptions,
      config.stakerFee,
      config.stakerAddress,
      config.tresuryAddress,
    ])) as RareBlocksSubscription;

    // allow the rent contract to send funds to the Staking contract
    await rareblocksStaking.updateAllowedSubscriptions([rareblocksSubscription.address], [true]);

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

  describe('Test deploy parameters', () => {
    it('Monthly price param must be greater than zero', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
        ethers.constants.Zero,
        config.maxSubscriptions,
        config.stakerFee,
        config.stakerAddress,
        config.tresuryAddress,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_PRICE_PER_MONTH');
    });

    it('Max subscriptions param must be greater than zero', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
        config.subscriptionMonthPrice,
        ethers.constants.Zero,
        config.stakerFee,
        config.stakerAddress,
        config.tresuryAddress,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_MAX_SUBSCRIPTIONS');
    });

    it('Max staking fee param must be greater than zero', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
        config.subscriptionMonthPrice,
        config.maxSubscriptions,
        ethers.constants.Zero,
        config.stakerAddress,
        config.tresuryAddress,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_STAKING_FEE');
    });

    it('Max staking fee param must be less or equal to 10000 (100%)', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
        config.subscriptionMonthPrice,
        config.maxSubscriptions,
        BigNumber.from(10001),
        config.stakerAddress,
        config.tresuryAddress,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_STAKING_FEE');
    });

    it('Staking contract address must not be zero address', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
        config.subscriptionMonthPrice,
        config.maxSubscriptions,
        config.stakerFee,
        ethers.constants.AddressZero,
        config.tresuryAddress,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_STAKING_CONTRACT');
    });

    it('Tresury address must not be zero address', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
        config.subscriptionMonthPrice,
        config.maxSubscriptions,
        config.stakerFee,
        config.stakerAddress,
        ethers.constants.AddressZero,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_TRESURY_ADDRESSS');
    });
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
      const stakeBalanceBefore = await rareblocksSubscription.stakingBalance();

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
      const stakeBalanceAfter = await rareblocksSubscription.stakingBalance();
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

      const stakerFeeBalance = await rareblocksSubscription.stakingBalance();
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

      await rareblocksSubscription.connect(owner).sendStakingPayout();

      const stakerFeeBalance = await rareblocksSubscription.stakingBalance();
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

  describe('Test sendStakingPayout()', () => {
    it('revert if not the owner', async () => {
      const tx = rareblocksSubscription.connect(subscriber1).sendStakingPayout();
      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('revert if tresury balance is 0', async () => {
      const tx = rareblocksSubscription.connect(owner).sendStakingPayout();
      await expect(tx).to.be.revertedWith('NO_STAKING_BALANCE');
    });
    it('revert on double withdraw', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      await rareblocksSubscription.connect(owner).sendStakingPayout();

      const tx = rareblocksSubscription.connect(owner).sendStakingPayout();
      await expect(tx).to.be.revertedWith('NO_STAKING_BALANCE');
    });
    it('success, send staker fee balance to stake address', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      const stakerFeeBalance = await rareblocksSubscription.stakingBalance();
      const rentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      const tresuryBalance = rentBalance.sub(stakerFeeBalance);
      const tx = rareblocksSubscription.connect(owner).sendStakingPayout();

      await expect(tx)
        .to.emit(rareblocksSubscription, 'StakingPayoutSent')
        .withArgs(owner.address, rareblocksStaking.address, stakerFeeBalance);

      // There seems to be some problem with waffle `changeEtherBalance` called on contracts
      // await expect(await tx).to.changeEtherBalance(stake.address, stakerFeeBalance);

      await tx;
      const stakerBalance = await ethers.provider.getBalance(rareblocksStaking.address);
      expect(stakerBalance).to.equal(stakerFeeBalance);

      const rentBalanceAfterStakerPayoutWithdraw = await ethers.provider.getBalance(rareblocksSubscription.address);
      expect(rentBalanceAfterStakerPayoutWithdraw).to.equal(tresuryBalance);
    });
    it('success, send staker fee balance to stake address after tresury withdraw', async () => {
      const amountOfMonths = 1;
      const ethToSend = config.subscriptionMonthPrice.mul(amountOfMonths);
      await rareblocksSubscription.connect(subscriber1).subscribe(amountOfMonths, {value: ethToSend});

      await rareblocksSubscription.connect(owner).withdrawTresury();

      const stakerFeeBalance = await rareblocksSubscription.stakingBalance();
      const rentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      const tresuryBalance = rentBalance.sub(stakerFeeBalance);
      const tx = rareblocksSubscription.connect(owner).sendStakingPayout();

      await expect(tx)
        .to.emit(rareblocksSubscription, 'StakingPayoutSent')
        .withArgs(owner.address, rareblocksStaking.address, stakerFeeBalance);

      // There seems to be some problem with waffle `changeEtherBalance` called on contracts
      // await expect(await tx).to.changeEtherBalance(stake.address, stakerFeeBalance);

      await tx;
      const stakerBalance = await ethers.provider.getBalance(rareblocksStaking.address);
      expect(stakerBalance).to.equal(stakerFeeBalance);

      const finalRentBalance = await ethers.provider.getBalance(rareblocksSubscription.address);
      expect(finalRentBalance).to.equal(0);
    });
  });

  describe('Test pause()', () => {
    it('contract can be paused only by the owner', async () => {
      const tx = rareblocksSubscription.connect(staker1).pause();

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('contract contract is paused after pause()', async () => {
      await rareblocksSubscription.connect(owner).pause();

      expect(await rareblocksSubscription.paused()).to.be.equal(true);
    });

    it('contract contract is unpaused after unpause()', async () => {
      await rareblocksSubscription.connect(owner).pause();

      expect(await rareblocksSubscription.paused()).to.be.equal(true);
    });
  });

  describe('Test unpause()', () => {
    it('contract can be unpause only by the owner', async () => {
      const tx = rareblocksSubscription.connect(staker1).unpause();

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('contract contract is unpaused after unpause()', async () => {
      await rareblocksSubscription.connect(owner).pause();
      await rareblocksSubscription.connect(owner).unpause();

      expect(await rareblocksSubscription.paused()).to.be.equal(false);
    });
  });

  describe('Test setStakingFee()', () => {
    it('can be updated only by the owner', async () => {
      const tx = rareblocksSubscription.connect(staker1).setStakingFee(BigNumber.from(1));

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('new fee must be greater than zero', async () => {
      const tx = rareblocksSubscription.connect(owner).setStakingFee(ethers.constants.Zero);

      await expect(tx).to.be.revertedWith('INVALID_STAKING_FEE');
    });

    it('new fee must less or equal to 10000 (100%)', async () => {
      const tx = rareblocksSubscription.connect(owner).setStakingFee(BigNumber.from(10001));

      await expect(tx).to.be.revertedWith('INVALID_STAKING_FEE');
    });

    it('new fee must be different from the old one', async () => {
      const tx = rareblocksSubscription.connect(owner).setStakingFee(config.stakerFee);

      await expect(tx).to.be.revertedWith('SAME_FEE');
    });

    it('successfully update staking fee', async () => {
      const newFee = BigNumber.from(10000);
      const tx = rareblocksSubscription.connect(owner).setStakingFee(newFee);

      await expect(tx).to.emit(rareblocksSubscription, 'StakingFeeUpdated').withArgs(owner.address, newFee);

      expect(await rareblocksSubscription.stakingFeePercent()).to.be.equal(newFee);
    });
  });

  describe('Test setSubscriptionMonthlyPrice()', () => {
    it('can be updated only by the owner', async () => {
      const tx = rareblocksSubscription.connect(staker1).setSubscriptionMonthlyPrice(BigNumber.from(1));

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('new price must be greater than zero', async () => {
      const tx = rareblocksSubscription.connect(owner).setSubscriptionMonthlyPrice(ethers.constants.Zero);

      await expect(tx).to.be.revertedWith('INVALID_PRICE');
    });

    it('new price must be different from the old one', async () => {
      const tx = rareblocksSubscription.connect(owner).setSubscriptionMonthlyPrice(config.subscriptionMonthPrice);

      await expect(tx).to.be.revertedWith('SAME_PRICE');
    });

    it('successfully update subscription price', async () => {
      const newPrice = ethers.utils.parseEther('0.2');
      const tx = rareblocksSubscription.connect(owner).setSubscriptionMonthlyPrice(newPrice);

      await expect(tx)
        .to.emit(rareblocksSubscription, 'SubscriptionMonthPriceUpdated')
        .withArgs(owner.address, newPrice);

      expect(await rareblocksSubscription.subscriptionMonthlyPrice()).to.be.equal(newPrice);
    });
  });

  describe('Test setTresury()', () => {
    it('can be updated only by the owner', async () => {
      const tx = rareblocksSubscription.connect(staker1).setTresury(staker1.address);

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('new tresury must not be zero address', async () => {
      const tx = rareblocksSubscription.connect(owner).setTresury(ethers.constants.AddressZero);

      await expect(tx).to.be.revertedWith('INVALID_TRESURY_ADDRESS');
    });

    it('new tresury must be different from the old one', async () => {
      const tx = rareblocksSubscription.connect(owner).setTresury(tresury.address);

      await expect(tx).to.be.revertedWith('SAME_TRESURY_ADDRESS');
    });

    it('successfully update tresury address', async () => {
      const tx = rareblocksSubscription.connect(owner).setTresury(staker1.address);

      await expect(tx).to.emit(rareblocksSubscription, 'TresuryUpdated').withArgs(owner.address, staker1.address);

      expect(await rareblocksSubscription.tresury()).to.be.equal(staker1.address);
    });
  });

  describe('Test setRareBlocksStaking()', () => {
    it('can be updated only by the owner', async () => {
      const tx = rareblocksSubscription.connect(staker1).setRareBlocksStaking(staker1.address);

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('new RareBlocksStaking address must not be zero address', async () => {
      const tx = rareblocksSubscription.connect(owner).setRareBlocksStaking(ethers.constants.AddressZero);

      await expect(tx).to.be.revertedWith('INVALID_STAKING_ADDRESS');
    });

    it('new RareBlocksStaking address must be different from the old one', async () => {
      const tx = rareblocksSubscription.connect(owner).setRareBlocksStaking(rareblocksStaking.address);

      await expect(tx).to.be.revertedWith('SAME_STAKING_ADDRESS');
    });

    it('old RareBlocksStaking address must not have pending fee balance', async () => {
      // make someone rent a pass
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      const tx = rareblocksSubscription.connect(owner).setRareBlocksStaking(tresury.address);

      await expect(tx).to.be.revertedWith('PREV_STAKING_HAVE_PENDING_BALANCE');
    });

    it('successfully update RareBlocksStaking address', async () => {
      const tx = rareblocksSubscription.connect(owner).setRareBlocksStaking(staker1.address);

      await expect(tx)
        .to.emit(rareblocksSubscription, 'RareBlocksStakingUpdated')
        .withArgs(owner.address, staker1.address);

      expect(await rareblocksSubscription.rareBlocksStaking()).to.be.equal(staker1.address);
    });
  });
});
