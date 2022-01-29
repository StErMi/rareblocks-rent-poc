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
import {SubscriptionConfig} from './model/SubscriptionConfig';

const {deployContract, loadFixture} = waffle;
const {expect} = chai;

describe('Stake Contract', () => {
  let owner: SignerWithAddress;
  let tresury: SignerWithAddress;
  let subscriber1: SignerWithAddress;
  let stakers: SignerWithAddress[];

  let rareBlocks: RareBlocks;
  let rareblocksSubscription: RareBlocksSubscription;
  let stake: Stake;

  const MAX_MINT = 10;

  const config: SubscriptionConfig = {
    subscriptionMonthPrice: ethers.utils.parseEther('0.1'),
    maxSubscriptions: BigNumber.from(2),
    stakerFee: BigNumber.from(8000), // 80%,
    stakerAddress: null,
    tresuryAddress: null,
  };

  beforeEach(async () => {
    [owner, tresury, subscriber1, ...stakers] = await ethers.getSigners();

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
      await stake.connect(staker).stake(i);
      stakerIndex++;
    }
  });

  describe('Test distributePayout()', () => {
    it('distribute the rent to all the stakers', async () => {
      // Create a rent
      const stakerMaxFee = await rareblocksSubscription.STAKER_MAX_FEE();
      const stakerFee = await rareblocksSubscription.stakerFeePercent();

      const rentPrice = ethers.utils.parseEther('1');
      const stakeCommission = rentPrice.mul(stakerFee).div(stakerMaxFee);
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: rentPrice});

      // check that the balance for the payout equals the rent
      expect(await rareblocksSubscription.stakerBalance()).to.eq(stakeCommission);
      expect(await ethers.provider.getBalance(stake.address)).to.eq(0);

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).stakerPayout();

      // Make the owner distribute share claims
      await stake.connect(owner).distributePayout();

      // Check that the balanceNextPayout has been resetted
      expect(await stake.getNextPayoutBalance()).to.eq(0);
      expect(await ethers.provider.getBalance(stake.address)).to.eq(stakeCommission);
    });
  });
});
