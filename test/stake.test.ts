import {artifacts, ethers, waffle} from 'hardhat';
import chai from 'chai';

import {RareBlocksSubscription, RareBlocksStaking, RareBlocks} from '../typechain';
import NFTMockArtifact from '../artifacts/contracts/mocks/NFTMock.sol/NFTMock.json';
import {NFTMock} from '../typechain/NFTMock';
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

    // Approve the contract to interact with the NFT
    await rareBlocks.connect(staker1).approve(rareblocksStaking.address, 16);
    await rareBlocks.connect(staker2).approve(rareblocksStaking.address, 17);
    await rareBlocks.connect(staker2).approve(rareblocksStaking.address, 18);
    await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 19);
    await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 20);
    await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 21);
    await rareBlocks.connect(staker4).approve(rareblocksStaking.address, 22);
  });

  describe('Test deploy parameters', () => {
    it('RareBlocks address must not be ZeroAddress', async () => {
      const tx = deployContract(owner, await artifacts.readArtifact('RareBlocksStaking'), [
        ethers.constants.AddressZero,
      ]);

      await expect(tx).to.be.revertedWith('INVALID_RAREBLOCK');
    });
  });

  describe('Test stake()', () => {
    it('stake a token that is not RareBlocks Pass', async () => {
      // deploy the mock contract
      const nftMock = (await deployContract(owner, NFTMockArtifact)) as NFTMock;

      // mint an NFT and send it to staker1
      await nftMock.connect(owner).safeMint(staker1.address);

      // staker1 send it to stake contract
      const tx = nftMock
        .connect(staker1)
        ['safeTransferFrom(address,address,uint256)'](staker1.address, rareblocksStaking.address, 0);

      await expect(tx).to.be.revertedWith('SENDER_NOT_RAREBLOCKS');
    });
    it('send a token directly to the contract via safeTransferFrom', async () => {
      const tx = rareBlocks
        .connect(staker1)
        ['safeTransferFrom(address,address,uint256)'](staker1.address, rareblocksStaking.address, 16);

      await expect(tx).to.be.revertedWith('ONLY_FROM_DIRECT_STAKE');
    });
    it("stake a token you don't own", async () => {
      const tx = rareblocksStaking.connect(staker1).stake(1);

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token you that does not exist', async () => {
      const tx = rareblocksStaking.connect(staker1).stake(1000);

      await expect(tx).to.be.revertedWith('ERC721: owner query for nonexistent token');
    });
    it('stake a token that the owner does not have approved yet to be transferred to the stake contract', async () => {
      await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});
      const tx = rareblocksStaking.connect(staker1).stake(23);

      await expect(tx).to.be.revertedWith('ERC721: transfer caller is not owner nor approved');
    });
    it('stake again a token (Stake contract is the new owner)', async () => {
      const tokenID = 16;
      await rareblocksStaking.connect(staker1).stake(tokenID);
      const tx = rareblocksStaking.connect(staker1).stake(tokenID);

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token when the contract is paused', async () => {
      await rareblocksStaking.connect(owner).pause();

      const tokenID = 16;
      const tx = rareblocksStaking.connect(staker1).stake(tokenID);

      await expect(tx).to.be.revertedWith('Pausable: paused');
    });

    it('stake a token that is still locked because of unstake should fail', async () => {
      const tokenID = 16;
      await rareblocksStaking.connect(staker1).stake(tokenID);

      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      await rareblocksStaking.connect(staker1).unstake(tokenID);

      // try to stake it again
      const tx = rareblocksStaking.connect(staker1).stake(tokenID);

      // it should fail because the owner has a lock still active
      await expect(tx).to.be.revertedWith('TOKEN_LOCKED');
    });

    it('stake unstaked token that changed owner should succed (skip lock period)', async () => {
      const tokenID = 16;
      await rareblocksStaking.connect(staker1).stake(tokenID);

      // total tokens after stake but before unstake -> stake from different staker
      const totalStakedTokenBefore = await rareblocksStaking.totalStakedToken();

      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      await rareblocksStaking.connect(staker1).unstake(tokenID);

      // get the user info
      let staker1Info = await rareblocksStaking.stakerInfos(staker1.address);

      // StakerInfo info have been updated
      expect(staker1Info.stakes).to.eq(0);
      expect(staker1Info.amountClaimable).to.gte(0);

      // Change ownership (lock is owner-token based)
      await rareBlocks.connect(staker1).transferFrom(staker1.address, staker2.address, tokenID);
      await rareBlocks.connect(staker2).approve(rareblocksStaking.address, 16);

      // try to stake it again
      const now = new Date().getTime() / 1000;
      await rareblocksStaking.connect(staker2).stake(tokenID);

      // get the user info
      staker1Info = await rareblocksStaking.stakerInfos(staker1.address);

      // StakerInfo info not updated
      expect(staker1Info.stakes).to.eq(0);
      expect(staker1Info.amountClaimable).to.gte(0);

      // check new stake owner
      const stakeInfo = await rareblocksStaking.stakes(16);

      // Stake info have been updated
      expect(stakeInfo.owner).to.eq(staker2.address);
      expect(stakeInfo.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);

      // get the user info
      const staker2Info = await rareblocksStaking.stakerInfos(staker2.address);

      // StakerInfo info have been updated
      expect(staker2Info.stakes).to.eq(1);
      expect(staker2Info.amountClaimable).to.gte(0);

      // number of staked token have been updated
      expect(await rareblocksStaking.totalStakedToken()).to.eq(totalStakedTokenBefore);

      // only 1 valid staker
      expect(await rareblocksStaking.getStakersCount()).to.eq(1);

      // staker1 is not a staker anymore
      expect(await rareblocksStaking.isStaker(staker1.address)).to.eq(false);

      // staker2 is a valid staker
      expect(await rareblocksStaking.isStaker(staker2.address)).to.eq(true);
    });

    it('stake successfully', async () => {
      const now = new Date().getTime() / 1000;
      const totalStakedTokenBefore = await rareblocksStaking.totalStakedToken();

      // stake the token
      const tx = rareblocksStaking.connect(staker1).stake(16);

      // check if the event have been emitted
      await expect(tx).to.emit(rareblocksStaking, 'Staked').withArgs(staker1.address, 16);

      // number of staked token have been updated
      expect(await rareblocksStaking.totalStakedToken()).to.eq(totalStakedTokenBefore.add(1));

      // get the stake info
      const stakeInfo = await rareblocksStaking.stakes(16);

      // Stake info have been updated
      expect(stakeInfo.owner).to.eq(staker1.address);
      expect(stakeInfo.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);

      // get the staker info
      const stakerInfo = await rareblocksStaking.stakerInfos(staker1.address);

      // StakerInfo info have been updated
      expect(stakerInfo.stakes).to.eq(1);
      expect(stakerInfo.amountClaimable).to.gte(0);

      // only 1 valid staker
      expect(await rareblocksStaking.getStakersCount()).to.eq(1);

      // staker1 is a valid staker
      expect(await rareblocksStaking.isStaker(staker1.address)).to.eq(true);
    });
  });

  describe('Test unstake()', () => {
    beforeEach(async () => {
      await rareblocksStaking.connect(staker4).stake(22);
    });

    it("unstake a token you don't own", async () => {
      const tx = rareblocksStaking.connect(staker4).unstake(1);

      await expect(tx).to.be.revertedWith('NOT_TOKEN_OWNER');
    });

    it('unstake a token when the contract is paused', async () => {
      await rareblocksStaking.connect(owner).pause();

      const tokenID = 22;
      const tx = rareblocksStaking.connect(staker4).unstake(tokenID);

      await expect(tx).to.be.revertedWith('Pausable: paused');
    });

    it('unstake a token that is still locked', async () => {
      const tokenID = 22;
      const tx = rareblocksStaking.connect(staker4).unstake(tokenID);

      await expect(tx).to.be.revertedWith('TOKEN_LOCKED');
    });

    it('unstake it correctly', async () => {
      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      const totalStakedTokenBefore = await rareblocksStaking.totalStakedToken();
      const now = new Date().getTime() / 1000;

      const tokenID = 22;
      const tx = rareblocksStaking.connect(staker4).unstake(tokenID);

      await expect(tx).to.emit(rareblocksStaking, 'Unstaked').withArgs(staker4.address, tokenID);

      // number of staked token have been updated
      expect(await rareblocksStaking.totalStakedToken()).to.eq(totalStakedTokenBefore.sub(1));

      // get the stake info
      const stakeInfo = await rareblocksStaking.stakes(tokenID);

      // Stake info have been updated
      expect(stakeInfo.owner).to.eq(staker4.address);
      expect(stakeInfo.lockExpire.toNumber()).to.gte(now + STAKE_LOCK_PERIOD);

      // only 1 valid staker
      expect(await rareblocksStaking.getStakersCount()).to.eq(0);

      // staker1 is a valid staker
      expect(await rareblocksStaking.isStaker(staker4.address)).to.eq(false);
    });
  });

  describe('Test pause()', () => {
    it('contract can be paused only by the owner', async () => {
      const tx = rareblocksStaking.connect(staker1).pause();

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('contract contract is paused after pause()', async () => {
      await rareblocksStaking.connect(owner).pause();

      expect(await rareblocksStaking.paused()).to.be.equal(true);
    });

    it('contract contract is unpaused after unpause()', async () => {
      await rareblocksStaking.connect(owner).pause();

      expect(await rareblocksStaking.paused()).to.be.equal(true);
    });
  });

  describe('Test unpause()', () => {
    it('contract can be unpause only by the owner', async () => {
      const tx = rareblocksStaking.connect(staker1).unpause();

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('contract contract is unpaused after unpause()', async () => {
      await rareblocksStaking.connect(owner).pause();
      await rareblocksStaking.connect(owner).unpause();

      expect(await rareblocksStaking.paused()).to.be.equal(false);
    });
  });
});
