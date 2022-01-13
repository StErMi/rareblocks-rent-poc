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

describe('Stake Contract', () => {
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

  describe('Test stake()', () => {
    it("stake a token you don't own", async () => {
      const tx = stake.connect(staker1).stake(1);

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token you that does not exist', async () => {
      const tx = stake.connect(staker1).stake(1000);

      await expect(tx).to.be.revertedWith('ERC721: owner query for nonexistent token');
    });
    it('stake a token that the owner does not have approved yet to be transferred to the stake contract', async () => {
      await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});
      const tx = stake.connect(staker1).stake(23);

      await expect(tx).to.be.revertedWith('ERC721: transfer caller is not owner nor approved');
    });
    it('stake again a token (Stake is the new owner)', async () => {
      const tokenID = 16;
      await stake.connect(staker1).stake(tokenID);
      const tx = stake.connect(staker1).stake(tokenID);

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token when the contract is paused', async () => {
      await stake.connect(owner).pauseStake();

      const tokenID = 16;
      const tx = stake.connect(staker1).stake(tokenID);

      await expect(tx).to.be.revertedWith('Pausable: paused');
    });
    it('stake it when payoutID is 0', async () => {
      const tokenID = 16;
      const totalStakedTokenBefore = await stake.totalStakedToken();
      const totalStakedTokenNextCycle = await stake.totalStakedTokenNextCycle();
      const nowInSeconds = new Date().getTime() / 1000;

      const tx = stake.connect(staker1).stake(tokenID);

      // Event is correctly emitted
      await expect(tx).to.emit(stake, 'Staked').withArgs(staker1.address, tokenID);

      // Number of totalStakedTokenBefore is updated
      expect(await stake.totalStakedToken()).to.eq(totalStakedTokenBefore.add(1));

      // Number of totalStakedTokenNextCycle is the same
      expect(await stake.totalStakedTokenNextCycle()).to.eq(totalStakedTokenNextCycle);

      // Stake of the user has been updated

      const userStakeBefore = await stake.stakes(tokenID);
      expect(userStakeBefore.stakeTime.toNumber()).to.be.gt(nowInSeconds);
      expect(userStakeBefore.owner).to.eq(staker1.address);

      // Check that the owner of the token is the staker
      expect(await rareBlocks.ownerOf(tokenID)).to.eq(stake.address);
    });
  });

  describe('Test unstake()', () => {
    beforeEach(async () => {
      await stake.connect(staker4).stake(22);
    });

    it("unstake a token you don't own", async () => {
      const tx = stake.connect(staker4).unstake(1);

      await expect(tx).to.be.revertedWith('NOT_TOKEN_OWNER');
    });

    it('unstake a token when the contract is paused', async () => {
      await stake.connect(owner).pauseStake();

      const tokenID = 22;
      const tx = stake.connect(staker4).unstake(tokenID);

      await expect(tx).to.be.revertedWith('Pausable: paused');
    });
    it('unstake it when payoutID is 0', async () => {
      const tokenID = 22;
      const totalStakedTokenBefore = await stake.totalStakedToken();
      const totalStakedTokenNextCycle = await stake.totalStakedTokenNextCycle();

      const tx = stake.connect(staker4).unstake(tokenID);

      // Event is correctly emitted
      await expect(tx).to.emit(stake, 'Unstaked').withArgs(staker4.address, tokenID);

      // Number of totalStakedTokenBefore is updated
      expect(await stake.totalStakedToken()).to.eq(totalStakedTokenBefore.sub(1));

      // Number of totalStakedTokenNextCycle is the same
      expect(await stake.totalStakedTokenNextCycle()).to.eq(totalStakedTokenNextCycle);

      // Stake of the user has been updated
      const userStakeBefore = await stake.stakes(tokenID);
      expect(userStakeBefore.stakeTime.toNumber()).to.eq(0);
      expect(userStakeBefore.owner).to.eq(ethers.constants.AddressZero);

      // Check that the owner of the token is the staker
      expect(await rareBlocks.ownerOf(tokenID)).to.eq(staker4.address);
    });
  });
});
