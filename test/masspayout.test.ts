import {artifacts, ethers, waffle} from 'hardhat';
import chai from 'chai';

import {RareBlocksSubscription, RareBlocksStaking, RareBlocks} from '../typechain';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber} from 'ethers';
import {SubscriptionConfig} from './model/SubscriptionConfig';

const {deployContract} = waffle;
const {expect} = chai;

describe('Stake Contract', () => {
  let owner: SignerWithAddress;
  let tresury: SignerWithAddress;
  let subscriber1: SignerWithAddress;
  let stakers: SignerWithAddress[];

  let rareBlocks: RareBlocks;
  let rareblocksSubscription: RareBlocksSubscription;
  let rareblocksStaking: RareBlocksStaking;

  const MAX_MINT = 250;

  const config: SubscriptionConfig = {
    subscriptionMonthPrice: ethers.utils.parseEther('0.1'),
    maxSubscriptions: BigNumber.from(2),
    stakerFee: BigNumber.from(8000), // 80%,
    stakerAddress: null,
    tresuryAddress: null,
  };

  beforeEach(async () => {
    [owner, tresury, subscriber1, ...stakers] = await ethers.getSigners();

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

    let stakerIndex = 0;
    for (let i = 1; i <= MAX_MINT; i++) {
      let staker = stakers[stakerIndex];
      if (i <= 15) {
        // first 15 NFT are owned by the contract's deployer, so I'm sending directly to one staker
        await rareBlocks.connect(owner).transferFrom(owner.address, staker.address, i);
      } else {
        await rareBlocks.connect(staker).mint(staker.address, 1, {value: ethers.utils.parseEther('0.08')});
      }

      await rareBlocks.connect(staker).approve(rareblocksStaking.address, i);
      await rareblocksStaking.connect(staker).stake(i);
      stakerIndex++;
    }
  });

  describe('Test distributePayout()', () => {
    it('distribute the rent to all the stakers', async () => {
      // Create a rent
      const stakerMaxFee = await rareblocksSubscription.STAKING_MAX_FEE();
      const stakerFee = await rareblocksSubscription.stakingFeePercent();

      const rentPrice = ethers.utils.parseEther('1');
      const stakeCommission = rentPrice.mul(stakerFee).div(stakerMaxFee);
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: rentPrice});

      // check that the balance for the payout equals the rent
      expect(await rareblocksSubscription.stakingBalance()).to.eq(stakeCommission);
      expect(await ethers.provider.getBalance(rareblocksStaking.address)).to.eq(0);

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).sendStakingPayout();

      // Make the owner distribute share claims
      await rareblocksStaking.connect(owner).distributePayout();

      // Check that the balanceNextPayout has been resetted
      expect(await rareblocksStaking.getNextPayoutBalance()).to.eq(0);
      expect(await ethers.provider.getBalance(rareblocksStaking.address)).to.eq(stakeCommission);
    });
  });
});
