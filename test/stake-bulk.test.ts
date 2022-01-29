import {artifacts, ethers, waffle} from 'hardhat';
import chai from 'chai';

import {RareBlocksSubscription, RareBlocksStaking, RareBlocks} from '../typechain';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber} from 'ethers';
import {increaseWorldTimeInSeconds} from './utils';
import {SubscriptionConfig} from './model/SubscriptionConfig';

const {deployContract} = waffle;
const {expect} = chai;

describe('Stake Contract', () => {
  let owner: SignerWithAddress;
  let tresury: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let staker3: SignerWithAddress;
  let staker4: SignerWithAddress;
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

  const STAKE_LOCK_PERIOD = 60 * 60 * 24 * 31; // 1 month

  beforeEach(async () => {
    [owner, tresury, staker1, staker2, staker3, staker4, subscriber1, subscriber2, ...addrs] =
      await ethers.getSigners();

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

    // Mint rareblock for the staker4
    await rareBlocks.connect(staker4).mint(staker4.address, 1, {value: ethers.utils.parseEther('0.08')});
    await rareBlocks.connect(staker4).mint(staker4.address, 1, {value: ethers.utils.parseEther('0.08')});
    await rareBlocks.connect(staker4).mint(staker4.address, 1, {value: ethers.utils.parseEther('0.08')});
    await rareBlocks.connect(staker4).mint(staker4.address, 1, {value: ethers.utils.parseEther('0.08')});

    // Approve the contract to interact with the NFT
    await rareBlocks.connect(staker1).approve(rareblocksStaking.address, 16);
    await rareBlocks.connect(staker2).approve(rareblocksStaking.address, 17);
    await rareBlocks.connect(staker2).approve(rareblocksStaking.address, 18);
    await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 19);
    await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 20);
    await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 21);
    await rareBlocks.connect(staker4).approve(rareblocksStaking.address, 22);
    await rareBlocks.connect(staker4).approve(rareblocksStaking.address, 23);
    await rareBlocks.connect(staker4).approve(rareblocksStaking.address, 24);
    await rareBlocks.connect(staker4).approve(rareblocksStaking.address, 25);
  });

  describe('Test stakeBulk()', () => {
    it("stake a token you don't own", async () => {
      const tx = rareblocksStaking.connect(staker1).stakeBulk([1]);

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token you that does not exist', async () => {
      const tx = rareblocksStaking.connect(staker1).stakeBulk([1000]);

      await expect(tx).to.be.revertedWith('ERC721: owner query for nonexistent token');
    });
    it('stake a token that the owner does not have approved yet to be transferred to the stake contract', async () => {
      await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});
      const tx = rareblocksStaking.connect(staker1).stakeBulk([26]);

      await expect(tx).to.be.revertedWith('ERC721: transfer caller is not owner nor approved');
    });
    it('stake again a token (Stake contract is the new owner)', async () => {
      const tokenID = 16;
      await rareblocksStaking.connect(staker1).stakeBulk([tokenID]);
      const tx = rareblocksStaking.connect(staker1).stakeBulk([tokenID]);

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token when the contract is paused', async () => {
      await rareblocksStaking.connect(owner).pause();

      const tokenID = 16;
      const tx = rareblocksStaking.connect(staker1).stakeBulk([tokenID]);

      await expect(tx).to.be.revertedWith('Pausable: paused');
    });

    it('stake a token that is still locked because of unstake should fail', async () => {
      const tokenID = 16;
      await rareblocksStaking.connect(staker1).stakeBulk([tokenID]);

      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      await rareblocksStaking.connect(staker1).unstake(tokenID);

      // try to stake it again
      const tx = rareblocksStaking.connect(staker1).stakeBulk([tokenID]);

      // it should fail because the owner has a lock still active
      await expect(tx).to.be.revertedWith('TOKEN_LOCKED');
    });

    it('stake a bulk of tokens where at least one would fail', async () => {
      const tx = rareblocksStaking.connect(staker3).stakeBulk([19, 20, 21, 22]);

      // it should fail because one of the token (22) is not owned by staker3
      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });

    it('stake successfully', async () => {
      const now = new Date().getTime() / 1000;
      const totalStakedTokenBefore = await rareblocksStaking.totalStakedToken();

      // stake the token
      const tx = rareblocksStaking.connect(staker3).stakeBulk([19, 20, 21]);

      // check if the event have been emitted
      await expect(tx)
        .to.emit(rareblocksStaking, 'Staked')
        .withArgs(staker3.address, 19)
        .to.emit(rareblocksStaking, 'Staked')
        .withArgs(staker3.address, 20)
        .to.emit(rareblocksStaking, 'Staked')
        .withArgs(staker3.address, 21)
        .to.emit(rareblocksStaking, 'StakedBulk')
        .withArgs(staker3.address, [19, 20, 21]);

      // number of staked token have been updated
      expect(await rareblocksStaking.totalStakedToken()).to.eq(totalStakedTokenBefore.add(3));

      // get the stake info
      const stakeInfo1 = await rareblocksStaking.stakes(19);
      const stakeInfo2 = await rareblocksStaking.stakes(20);
      const stakeInfo3 = await rareblocksStaking.stakes(21);

      // Stake info have been updated
      expect(stakeInfo1.owner).to.eq(staker3.address);
      expect(stakeInfo1.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);
      expect(stakeInfo2.owner).to.eq(staker3.address);
      expect(stakeInfo2.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);
      expect(stakeInfo3.owner).to.eq(staker3.address);
      expect(stakeInfo3.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);

      // get the staker info
      const stakerInfo = await rareblocksStaking.stakerInfos(staker3.address);

      // StakerInfo info have been updated
      expect(stakerInfo.stakes).to.eq(3);
      expect(stakerInfo.amountClaimable).to.gte(0);

      // only 1 valid staker
      expect(await rareblocksStaking.getStakersCount()).to.eq(1);

      // staker3 is a valid staker
      expect(await rareblocksStaking.isStaker(staker3.address)).to.eq(true);
    });
  });

  describe('Test unstakeBulk()', () => {
    beforeEach(async () => {
      await rareblocksStaking.connect(staker4).stakeBulk([22, 23, 24, 25]);
    });

    it("unstake a token you don't own", async () => {
      const tx = rareblocksStaking.connect(staker4).unstakeBulk([1]);

      await expect(tx).to.be.revertedWith('NOT_TOKEN_OWNER');
    });

    it('unstake a token when the contract is paused', async () => {
      await rareblocksStaking.connect(owner).pause();

      const tokenID = 22;
      const tx = rareblocksStaking.connect(staker4).unstakeBulk([tokenID]);

      await expect(tx).to.be.revertedWith('Pausable: paused');
    });

    it('unstake a token that is still locked', async () => {
      const tokenID = 22;
      const tx = rareblocksStaking.connect(staker4).unstakeBulk([tokenID]);

      await expect(tx).to.be.revertedWith('TOKEN_LOCKED');
    });

    it('stake a bulk of tokens where at least one would fail', async () => {
      await rareblocksStaking.connect(staker3).stake(21);
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);

      const tx = rareblocksStaking.connect(staker4).unstakeBulk([22, 23, 24, 25, 21]);

      // it should fail because one of the token (21) is not owned by staker4
      await expect(tx).to.be.revertedWith('NOT_TOKEN_OWNER');
    });

    it('unstake all correctly', async () => {
      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      const totalStakedTokenBefore = await rareblocksStaking.totalStakedToken();
      const now = new Date().getTime() / 1000;

      const tx = rareblocksStaking.connect(staker4).unstakeBulk([22, 23, 24, 25]);

      await expect(tx)
        .to.emit(rareblocksStaking, 'Unstaked')
        .withArgs(staker4.address, 22)
        .to.emit(rareblocksStaking, 'Unstaked')
        .withArgs(staker4.address, 23)
        .to.emit(rareblocksStaking, 'Unstaked')
        .withArgs(staker4.address, 24)
        .to.emit(rareblocksStaking, 'Unstaked')
        .withArgs(staker4.address, 25)
        .to.emit(rareblocksStaking, 'UnstakedBulk')
        .withArgs(staker4.address, [22, 23, 24, 25]);

      // number of staked token have been updated
      expect(await rareblocksStaking.totalStakedToken()).to.eq(totalStakedTokenBefore.sub(4));

      // get the stake info
      const stakeInfo1 = await rareblocksStaking.stakes(22);
      const stakeInfo2 = await rareblocksStaking.stakes(23);
      const stakeInfo3 = await rareblocksStaking.stakes(24);
      const stakeInfo4 = await rareblocksStaking.stakes(25);

      // Stake info have been updated
      expect(stakeInfo1.owner).to.eq(staker4.address);
      expect(stakeInfo1.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);
      expect(stakeInfo2.owner).to.eq(staker4.address);
      expect(stakeInfo2.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);
      expect(stakeInfo3.owner).to.eq(staker4.address);
      expect(stakeInfo3.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);
      expect(stakeInfo4.owner).to.eq(staker4.address);
      expect(stakeInfo4.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);

      // 0 valid staker
      expect(await rareblocksStaking.getStakersCount()).to.eq(0);

      // staker4 is not a valid staker anymore
      expect(await rareblocksStaking.isStaker(staker4.address)).to.eq(false);
    });
  });
});
