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
    [owner, tresury, staker1, staker2, staker3, renter1, renter2, ...addrs] = await ethers.getSigners();

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

    // Approve the contract to interact with the NFT
    await rareBlocks.connect(staker1).approve(stake.address, 16);
    await rareBlocks.connect(staker2).approve(stake.address, 17);
    await rareBlocks.connect(staker2).approve(stake.address, 18);
    await rareBlocks.connect(staker3).approve(stake.address, 19);
    await rareBlocks.connect(staker3).approve(stake.address, 20);
    await rareBlocks.connect(staker3).approve(stake.address, 21);
  });

  describe('Test stake()', () => {
    it("stake a token you don't own", async () => {
      const sharePrice = await stake.getSharePrice();
      const tx = stake.connect(staker1).stake(1, {value: sharePrice});

      await expect(tx).to.be.revertedWith('TOKEN_NOT_OWNED');
    });
    it('stake a token you that does not exist', async () => {
      const sharePrice = await stake.getSharePrice();
      const tx = stake.connect(staker1).stake(1000, {value: sharePrice});

      await expect(tx).to.be.revertedWith('ERC721: owner query for nonexistent token');
    });
    it('stake a token that the owner does not have approved yet to be transferred to the stake contract', async () => {
      const sharePrice = await stake.getSharePrice();
      await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});
      const tx = stake.connect(staker1).stake(22, {value: sharePrice});

      await expect(tx).to.be.revertedWith('ERC721: transfer caller is not owner nor approved');
    });
    it('stake it when totalShare = 0 -> sharePrice 0', async () => {
      const tokenID = 16;
      const sharePrice = 0;

      const totalSharesBefore = await stake.totalShares();
      const userSharesBefore = await stake.userShares(staker1.address);
      const tokenOwnersBefore = await stake.tokenOwners(tokenID);

      const tx = stake.connect(staker1).stake(tokenID, {value: 0});

      // Event is correctly emitted
      await expect(tx).to.emit(stake, 'Staked').withArgs(staker1.address, tokenID, sharePrice);

      // Number of shares is updated
      expect(await stake.totalShares()).to.eq(totalSharesBefore.add(1));

      // Shares of the user is updated
      expect(await stake.userShares(staker1.address)).to.eq(userSharesBefore.add(1));

      // Shares of the user is updated
      expect(tokenOwnersBefore).to.eq(ethers.constants.AddressZero);
      expect(await stake.tokenOwners(tokenID)).to.eq(staker1.address);

      // Check that the owner of the token is the staker
      expect(await rareBlocks.ownerOf(tokenID)).to.eq(stake.address);
    });

    it('stake it when totalShare = 0 -> sharePrice 0', async () => {
      // staker1 stake a token
      await stake.connect(staker1).stake(16, {value: await stake.getSharePrice()});

      // staker2 stake a token
      await stake.connect(staker2).stake(17, {value: await stake.getSharePrice()});

      // renter 1 rent a pass
      await rent.connect(renter1).rent(10, {value: ethers.utils.parseEther('1')});

      // staker3 stake a token
      await stake.connect(staker3).stake(19, {value: await stake.getSharePrice()});

      await stake.connect(staker1).unstake(16);
    });
  });
});
