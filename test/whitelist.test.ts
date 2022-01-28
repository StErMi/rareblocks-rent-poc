import {ethers, waffle} from 'hardhat';
import chai from 'chai';

import RentArtifact from '../artifacts/contracts/Rent.sol/Rent.json';
import {Rent} from '../typechain/Rent';
import StakeArtifact from '../artifacts/contracts/Stake.sol/Stake.json';
import {Stake} from '../typechain/Stake';
import RareBlocksArtifact from '../artifacts/contracts/mocks/RareBlocks.sol/RareBlocks.json';
import {RareBlocks} from '../typechain/RareBlocks';
import NFTMockArtifact from '../artifacts/contracts/mocks/NFTMock.sol/NFTMock.json';
import {NFTMock} from '../typechain/NFTMock';
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
  });

  describe('Test updateAllowedSubscriptions()', () => {
    it('update allow list if you are not the owner', async () => {
      const tx = stake.connect(staker1).updateAllowedSubscriptions([rent.address], [true]);

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('update allow list with mismatched param lenghts', async () => {
      const tx = stake.connect(owner).updateAllowedSubscriptions([rent.address], [true, false]);

      await expect(tx).to.be.revertedWith('LENGHTS_MISMATCH');
    });
    it('update allow list with invalid subscription address', async () => {
      const tx = stake.connect(owner).updateAllowedSubscriptions([ethers.constants.AddressZero], [true]);

      await expect(tx).to.be.revertedWith('INVALID_SUBSCRIPTION');
    });

    it('check that the list is correctly updated', async () => {
      // add rent contract to the whitelist
      await stake.connect(owner).updateAllowedSubscriptions([rent.address], [true]);

      // check that the list is updated
      expect(await stake.allowedSubscriptions(rent.address)).to.be.equal(true);

      const tx = stake.connect(owner).updateAllowedSubscriptions([rent.address, tresury.address], [false, true]);

      await expect(tx)
        .to.emit(stake, 'AllowedSubscriptionUpdate')
        .withArgs(owner.address, rent.address, false)
        .to.emit(stake, 'AllowedSubscriptionUpdate')
        .withArgs(owner.address, tresury.address, true);

      // check that the list is updated
      expect(await stake.allowedSubscriptions(rent.address)).to.be.equal(false);
      expect(await stake.allowedSubscriptions(tresury.address)).to.be.equal(true);
    });
  });

  describe('Test receive()', () => {
    it('send ETH to the contract if you are not in the allowed list', async () => {
      // rent for 10 months
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      const tx = rent.connect(owner).stakerPayout();

      await expect(tx).to.be.revertedWith('PAYOUT_FAIL');
    });

    it('send ETH to the contract if you are disallowed', async () => {
      await stake.connect(owner).updateAllowedSubscriptions([rent.address], [false]);

      // rent for 10 months
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      const tx = rent.connect(owner).stakerPayout();

      await expect(tx).to.be.revertedWith('PAYOUT_FAIL');
    });

    it('correctly send the payout to the Staker contract', async () => {
      await stake.connect(owner).updateAllowedSubscriptions([rent.address], [true]);

      // rent for 10 months
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      const tx = await rent.connect(owner).stakerPayout();

      const stakerPayout = ethers.utils.parseEther('0.8');
      await expect(tx)
        .to.emit(rent, 'StakerPayout')
        .withArgs(owner.address, stake.address, stakerPayout)
        .to.emit(stake, 'PayoutReceived')
        .withArgs(rent.address, stakerPayout);

      expect(await stake.getNextPayoutBalance()).to.be.eq(stakerPayout);
    });
  });
});
