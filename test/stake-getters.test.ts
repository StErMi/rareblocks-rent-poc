import {UnstakedEvent} from './../typechain/Stake.d';
import {ethers, waffle} from 'hardhat';
import chai from 'chai';

import RentArtifact from '../artifacts/contracts/Rent.sol/Rent.json';
import {Rent} from '../typechain/Rent';
import StakeArtifact from '../artifacts/contracts/Stake.sol/Stake.json';
import {Stake} from '../typechain/Stake';
import RareBlocksArtifact from '../artifacts/contracts/mocks/RareBlocks.sol/RareBlocks.json';
import {RareBlocks} from '../typechain/RareBlocks';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber} from 'ethers';
import {increaseWorldTimeInSeconds} from './utils';

const {deployContract} = waffle;
const {expect} = chai;

interface RentConfig {
  rentMonthPrice: BigNumber;
  maxRentals: BigNumber;
  stakerFee: BigNumber; // 80%,
  stakerAddress: null | string;
  tresuryAddress: null | string;
}

const SECONDS_IN_MONTH = 60 * 60 * 24 * 31;

describe('Stake Contract Getters', () => {
  let owner: SignerWithAddress;
  let tresury: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let staker3: SignerWithAddress;
  let staker4: SignerWithAddress;
  let renter1: SignerWithAddress;
  let renter2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  let rareBlocks: RareBlocks;
  let rent: Rent;
  let stake: Stake;

  const config: RentConfig = {
    rentMonthPrice: ethers.utils.parseEther('0.1'),
    maxRentals: BigNumber.from(2),
    stakerFee: BigNumber.from(8000), // 80%,
    stakerAddress: null,
    tresuryAddress: null,
  };

  const STAKE_LOCK_PERIOD = 60 * 60 * 24 * 31; // 1 month

  beforeEach(async () => {
    [owner, tresury, staker1, staker2, staker3, staker4, renter1, renter2, ...addrs] = await ethers.getSigners();

    rareBlocks = (await deployContract(owner, RareBlocksArtifact)) as RareBlocks;

    stake = (await deployContract(owner, StakeArtifact, [rareBlocks.address])) as Stake;

    // update global config
    config.stakerAddress = stake.address;
    config.tresuryAddress = tresury.address;

    rent = (await deployContract(owner, RentArtifact, [
      config.rentMonthPrice,
      config.maxRentals,
      config.stakerFee,
      config.stakerAddress,
      config.tresuryAddress,
    ])) as Rent;

    // set the rent address on stake's contract
    await stake.setRent(rent.address);

    // resume staking
    await stake.unpauseStake();

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
    await rareBlocks.connect(staker1).approve(stake.address, 16);
    await rareBlocks.connect(staker2).approve(stake.address, 17);
    await rareBlocks.connect(staker2).approve(stake.address, 18);
    await rareBlocks.connect(staker3).approve(stake.address, 19);
    await rareBlocks.connect(staker3).approve(stake.address, 20);
    await rareBlocks.connect(staker3).approve(stake.address, 21);
    await rareBlocks.connect(staker4).approve(stake.address, 22);
  });

  describe('Test canStake()', () => {
    it("canStake on a token you don't own", async () => {
      const okToken = await stake.connect(staker4).canStake([1]);

      expect(okToken[0]).to.be.equal(0);
    });

    it('canStake on a token you that does not exist', async () => {
      const tx = stake.connect(staker4).canStake([1000]);

      await expect(tx).to.be.revertedWith('ERC721: owner query for nonexistent token');
    });

    it('canStake on a token that the owner does not have approved yet to be transferred to the stake contract', async () => {
      await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});
      const okToken = await stake.connect(staker1).canStake([23]);

      expect(okToken[0]).to.be.equal(23);
    });
    it('canStake on a token already staked', async () => {
      const tokenID = 16;
      await stake.connect(staker1).stake(tokenID);

      const okToken = await stake.connect(staker1).canStake([tokenID]);

      expect(okToken[0]).to.be.equal(0);
    });

    // it('stake a token when the contract is paused', async () => {
    //   await stake.connect(owner).pauseStake();

    //   const tokenID = 16;
    //   const tx = stake.connect(staker1).stake(tokenID);

    //   await expect(tx).to.be.revertedWith('Pausable: paused');
    // });

    it('canStake on a token already staked, locktime has passed', async () => {
      const tokenID = 16;
      await stake.connect(staker1).stake(tokenID);

      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);

      const okToken = await stake.connect(staker1).canStake([tokenID]);

      expect(okToken[0]).to.be.equal(0);
    });

    it('canStake on token that is still locked because of unstake', async () => {
      const tokenID = 16;
      await stake.connect(staker1).stake(tokenID);

      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      await stake.connect(staker1).unstake(tokenID);

      const okToken = await stake.connect(staker1).canStake([tokenID]);

      expect(okToken[0]).to.be.equal(0);
    });

    it('canStake on token you own that has not been staked', async () => {
      const tokenID = 16;
      const okToken = await stake.connect(staker1).canStake([tokenID]);

      expect(okToken[0]).to.be.equal(tokenID);
    });

    it('canStake correctly unstaked after lock period', async () => {
      const tokenID = 16;

      await stake.connect(staker1).stake(tokenID);

      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      await stake.connect(staker1).unstake(tokenID);

      // let 1 month pass to be able to stake it again
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD + 1, true);

      const okToken = await stake.connect(staker1).canStake([tokenID]);

      expect(okToken[0]).to.be.equal(tokenID);
    });

    it('canStake correctly unstaked and token transfer', async () => {
      const tokenID = 16;

      await stake.connect(staker1).stake(tokenID);

      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD, true);
      await stake.connect(staker1).unstake(tokenID);

      // transfer token to staker2 even if unlock time has not passed (owner has changed)
      await rareBlocks.connect(staker1).transferFrom(staker1.address, staker2.address, tokenID);

      const okToken = await stake.connect(staker2).canStake([tokenID]);

      expect(okToken[0]).to.be.equal(tokenID);
    });

    it('canStake multi parameters', async () => {
      // first token has been staked, unstaked and then transferred -> OK
      // second token has not been staked yet -> OK
      // third token has been unstaked but time has not passed -> KO

      await stake.connect(staker3).stake(19);
      await stake.connect(staker1).stake(16);
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD + 1, true);
      await stake.connect(staker3).unstake(19);
      await stake.connect(staker1).unstake(16);
      await rareBlocks.connect(staker1).transferFrom(staker1.address, staker3.address, 16);

      const okToken = await stake.connect(staker3).canStake([16, 19, 21]);

      expect(okToken[0]).to.be.equal(16);
      expect(okToken[1]).to.be.equal(0);
      expect(okToken[2]).to.be.equal(21);
    });
  });

  describe('Test canUnstake()', () => {
    beforeEach(async () => {
      await stake.connect(staker4).stake(22);
    });

    it("canUnstake a token you don't own", async () => {
      const okToken = await stake.connect(staker4).canUnstake([1]);

      expect(okToken[0]).to.be.equal(0);
    });

    // it('canUnstake a token when the contract is paused', async () => {
    //   await stake.connect(owner).pauseStake();

    //   const tokenID = 22;
    //   const tx = stake.connect(staker4).unstake(tokenID);

    //   await expect(tx).to.be.revertedWith('Pausable: paused');
    // });

    it('canUnstake a token that is still locked', async () => {
      const tokenID = 22;

      const okToken = await stake.connect(staker4).canUnstake([tokenID]);

      expect(okToken[0]).to.be.equal(0);
    });

    it("canUnstake a token that is locked but that I don't own?", async () => {
      await stake.connect(staker1).stake(16);

      const okToken = await stake.connect(staker4).canUnstake([16]);

      expect(okToken[0]).to.be.equal(0);
    });

    it("canUnstake a token that is unlocked but that I don't own?", async () => {
      await stake.connect(staker1).stake(16);

      // let pass 2 months
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD * 2, true);

      const okToken = await stake.connect(staker4).canUnstake([16]);

      expect(okToken[0]).to.be.equal(0);
    });

    it('canUnstake it correctly', async () => {
      // let 1 month pass and unstake it
      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD + 1, true);

      const okToken = await stake.connect(staker4).canUnstake([22]);

      expect(okToken[0]).to.be.equal(22);
    });

    it('canUnstake it correctly multiple params', async () => {
      // act as the third staker

      // first and second can be unstaked because time have passed
      // third cannot because time has not passed
      // forth cannot because the owner is not me

      await stake.connect(staker3).stake(19);
      await stake.connect(staker3).stake(20);

      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD + 1, true);

      await stake.connect(staker3).stake(21);

      const okToken = await stake.connect(staker3).canUnstake([22, 19, 20, 21]);

      expect(okToken[0]).to.be.equal(0);
      expect(okToken[1]).to.be.equal(19);
      expect(okToken[2]).to.be.equal(20);
      expect(okToken[3]).to.be.equal(0);
    });
  });
});
