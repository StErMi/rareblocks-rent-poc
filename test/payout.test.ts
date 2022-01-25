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

describe('Stake Contract Payout', () => {
  let owner: SignerWithAddress;
  let tresury: SignerWithAddress;
  let staker1: SignerWithAddress;
  let staker2: SignerWithAddress;
  let staker3: SignerWithAddress;
  let staker4: SignerWithAddress;
  let staker5: SignerWithAddress;
  let staker6: SignerWithAddress;
  let staker7: SignerWithAddress;
  let staker8: SignerWithAddress;
  let staker9: SignerWithAddress;
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
    [
      owner,
      tresury,
      staker1,
      staker2,
      staker3,
      staker4,
      staker5,
      staker6,
      staker7,
      staker8,
      staker9,
      renter1,
      renter2,
      ...addrs
    ] = await ethers.getSigners();

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

    // mint some NFT
    await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});

    // Approve the contract to interact with the NFT
    await rareBlocks.connect(staker1).approve(stake.address, 16);
  });

  describe('Test distributePayout()', () => {
    beforeEach(async () => {
      // mint some NFT
      await rareBlocks.connect(staker2).mint(staker2.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker3).mint(staker3.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker4).mint(staker4.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker5).mint(staker5.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker6).mint(staker6.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker6).mint(staker6.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker7).mint(staker7.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker7).mint(staker7.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker8).mint(staker8.address, 1, {value: ethers.utils.parseEther('0.08')});
      await rareBlocks.connect(staker9).mint(staker9.address, 1, {value: ethers.utils.parseEther('0.08')});

      // Approve the contract to interact with the NFT
      await rareBlocks.connect(staker2).approve(stake.address, 17);
      await rareBlocks.connect(staker3).approve(stake.address, 18);
      await rareBlocks.connect(staker4).approve(stake.address, 19);
      await rareBlocks.connect(staker5).approve(stake.address, 20);
      await rareBlocks.connect(staker6).approve(stake.address, 21);
      await rareBlocks.connect(staker6).approve(stake.address, 22);
      await rareBlocks.connect(staker7).approve(stake.address, 23);
      await rareBlocks.connect(staker7).approve(stake.address, 24);
      await rareBlocks.connect(staker8).approve(stake.address, 25);
      await rareBlocks.connect(staker9).approve(stake.address, 26);
    });

    it('distribute when you are not the owner of the contract', async () => {
      const tx = stake.connect(staker1).distributePayout();

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('distribute when there are no active stakers', async () => {
      const tx = stake.connect(owner).distributePayout();

      await expect(tx).to.be.revertedWith('NO_TOKEN_STAKED');
    });

    it('distribute when there is no balance (no one rented)', async () => {
      await stake.connect(staker1).stake(16);

      const tx = stake.connect(owner).distributePayout();

      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('distribute when there is no balance (prev payout already distributed)', async () => {
      await stake.connect(staker1).stake(16);
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});

      // distribute the first payout
      await stake.connect(owner).distributePayout();

      // try to do the next one briefly after
      const tx = stake.connect(owner).distributePayout();
      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('distribute correctly', async () => {
      // staker 1, 2, 3, 4, 5 staked 1 token
      // staker6 staked 2 tokens but unstaked 1 before payout
      // staker7 have staked 2 tokens
      // staker8 have staked 1 token but unstaked before payout
      // staker9 have staked 1 token but after payout

      // stake before payout
      await stake.connect(staker1).stake(16);
      await stake.connect(staker2).stake(17);
      await stake.connect(staker3).stake(18);
      await stake.connect(staker4).stake(19);
      await stake.connect(staker5).stake(20);

      await stake.connect(staker6).stake(21);
      await stake.connect(staker6).stake(22);

      await stake.connect(staker7).stake(23);
      await stake.connect(staker7).stake(24);

      await stake.connect(staker8).stake(25);

      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD + 1, true);

      // unstake before payout
      await stake.connect(staker6).unstake(22);
      await stake.connect(staker8).unstake(25);

      // rent for 10 months
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});

      // check balance before payout
      expect(await stake.getNextPayoutBalance()).to.be.equal(ethers.utils.parseEther('0.8'));

      // distribute payout
      const tx = stake.connect(owner).distributePayout();
      await expect(tx)
        .to.emit(stake, 'PayoutDistributed')
        .withArgs(owner.address, ethers.utils.parseEther('0.8'), 7, 8, ethers.utils.parseEther('0.1'));

      // stake after payout
      await stake.connect(staker9).stake(26);

      // check balance after payout
      expect(await stake.getNextPayoutBalance()).to.be.equal(0);

      // check that each staker has the correct payout balance
      expect(await stake.connect(staker1).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await stake.connect(staker2).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await stake.connect(staker3).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await stake.connect(staker4).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await stake.connect(staker5).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await stake.connect(staker6).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await stake.connect(staker7).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.2'));
      expect(await stake.connect(staker8).claimableBalance()).to.be.equal(0);
      expect(await stake.connect(staker9).claimableBalance()).to.be.equal(0);
    });
  });

  describe('Test claimPayout()', () => {
    it('claim balance when you have no balance', async () => {
      const tx = stake.connect(staker1).claimPayout();

      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('claim after already have claimed it', async () => {
      await stake.connect(staker1).stake(16);
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});
      await stake.connect(owner).distributePayout();
      await stake.connect(staker1).claimPayout();

      const tx = stake.connect(staker1).claimPayout();

      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('event is emitted', async () => {
      await stake.connect(staker1).stake(16);
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});
      await stake.connect(owner).distributePayout();

      const tx = stake.connect(staker1).claimPayout();

      await expect(tx).to.emit(stake, 'PayoutClaimed').withArgs(staker1.address, ethers.utils.parseEther('0.8'));
    });

    it('correctly claim the reward and balance is updated', async () => {
      await stake.connect(staker1).stake(16);
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});
      await stake.connect(owner).distributePayout();

      const reward = ethers.utils.parseEther('0.8'); // 80% of the total rent balance

      expect(await stake.connect(staker1).claimableBalance()).to.be.equal(reward);

      const tx = stake.connect(staker1).claimPayout();

      await expect(await tx).to.changeEtherBalance(staker1, reward);

      expect(await stake.connect(staker1).claimableBalance()).to.be.equal(0);
    });
  });
});
