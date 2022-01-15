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

const {deployContract, loadFixture} = waffle;
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
  let renter1: SignerWithAddress;
  let stakers: SignerWithAddress[];

  let rareBlocks: RareBlocks;
  let rent: Rent;
  let stake: Stake;

  const MAX_MINT = 500;

  const config: RentConfig = {
    rentMonthPrice: ethers.utils.parseEther('0.1'),
    maxRentals: BigNumber.from(2),
    stakerFee: BigNumber.from(8000), // 80%,
    stakerAddress: null,
    tresuryAddress: null,
  };

  beforeEach(async () => {
    [owner, tresury, renter1, ...stakers] = await ethers.getSigners();

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

    let stakerIndex = 0;
    for (let i = 1; i <= MAX_MINT; i++) {
      let staker = stakers[stakerIndex];
      if (i <= 15) {
        // first 15 NFT are owned by the contract's deployer, so I'm sending directly to one staker
        await rareBlocks.connect(owner).transferFrom(owner.address, staker.address, i);
      } else {
        await rareBlocks.connect(staker).mint(staker.address, 1, {value: ethers.utils.parseEther('0.08')});
      }

      await rareBlocks.connect(staker).approve(stake.address, i);
      await stake.connect(staker).stake(i, {value: ethers.utils.parseEther('0')});
      stakerIndex++;
    }
  });

  describe('Test distributeClaims()', () => {
    it("stake a token you don't own", async () => {
      // Create a rent
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1')});
      // pull the balance to renter otherwise the sharePrice is not accurate (because of gas)
      const sharePriceBeforeDistribute = await stake.getSharePrice();

      // Make the owner mass distribute share claims
      await stake.connect(owner).distributeClaims();

      // share value should be 0
      expect(await stake.getSharePrice()).to.eq(0);

      // should be > 0
      expect(await stake.totalAccruedClaimAmount()).to.eq(sharePriceBeforeDistribute.mul(MAX_MINT));
    });
  });
});
