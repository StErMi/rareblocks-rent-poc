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
  let treasury: SignerWithAddress;
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
    treasuryAddress: null,
  };

  beforeEach(async () => {
    [owner, treasury, staker1, staker2, staker3, staker4, subscriber1, subscriber2, ...addrs] =
      await ethers.getSigners();

    rareBlocks = (await deployContract(owner, await artifacts.readArtifact('RareBlocks'))) as RareBlocks;

    rareblocksStaking = (await deployContract(owner, await artifacts.readArtifact('RareBlocksStaking'), [
      rareBlocks.address,
    ])) as RareBlocksStaking;

    // update global config
    config.stakerAddress = rareblocksStaking.address;
    config.treasuryAddress = treasury.address;

    rareblocksSubscription = (await deployContract(owner, await artifacts.readArtifact('RareBlocksSubscription'), [
      config.subscriptionMonthPrice,
      config.maxSubscriptions,
      config.stakerFee,
      config.stakerAddress,
      config.treasuryAddress,
    ])) as RareBlocksSubscription;
  });

  describe('Test updateAllowedSubscriptions()', () => {
    it('update allow list if you are not the owner', async () => {
      const tx = rareblocksStaking
        .connect(staker1)
        .updateAllowedSubscriptions([rareblocksSubscription.address], [true]);

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });
    it('update allow list with mismatched param lenghts', async () => {
      const tx = rareblocksStaking
        .connect(owner)
        .updateAllowedSubscriptions([rareblocksSubscription.address], [true, false]);

      await expect(tx).to.be.revertedWith('LENGHTS_MISMATCH');
    });
    it('update allow list with invalid subscription address', async () => {
      const tx = rareblocksStaking.connect(owner).updateAllowedSubscriptions([ethers.constants.AddressZero], [true]);

      await expect(tx).to.be.revertedWith('INVALID_SUBSCRIPTION');
    });

    it('check that the list is correctly updated', async () => {
      // add rent contract to the whitelist
      await rareblocksStaking.connect(owner).updateAllowedSubscriptions([rareblocksSubscription.address], [true]);

      // check that the list is updated
      expect(await rareblocksStaking.allowedSubscriptions(rareblocksSubscription.address)).to.be.equal(true);

      const tx = rareblocksStaking
        .connect(owner)
        .updateAllowedSubscriptions([rareblocksSubscription.address, treasury.address], [false, true]);

      await expect(tx)
        .to.emit(rareblocksStaking, 'AllowedSubscriptionUpdate')
        .withArgs(owner.address, rareblocksSubscription.address, false)
        .to.emit(rareblocksStaking, 'AllowedSubscriptionUpdate')
        .withArgs(owner.address, treasury.address, true);

      // check that the list is updated
      expect(await rareblocksStaking.allowedSubscriptions(rareblocksSubscription.address)).to.be.equal(false);
      expect(await rareblocksStaking.allowedSubscriptions(treasury.address)).to.be.equal(true);
    });
  });

  describe('Test receive()', () => {
    it('send ETH to the contract if you are not in the allowed list', async () => {
      // rent for 10 months
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      const tx = rareblocksSubscription.connect(owner).sendStakingPayout();

      await expect(tx).to.be.revertedWith('PAYOUT_FAIL');
    });

    it('send ETH to the contract if you are disallowed', async () => {
      await rareblocksStaking.connect(owner).updateAllowedSubscriptions([rareblocksSubscription.address], [false]);

      // rent for 10 months
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      const tx = rareblocksSubscription.connect(owner).sendStakingPayout();

      await expect(tx).to.be.revertedWith('PAYOUT_FAIL');
    });

    it('correctly send the payout to the Staker contract', async () => {
      await rareblocksStaking.connect(owner).updateAllowedSubscriptions([rareblocksSubscription.address], [true]);

      // rent for 10 months
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      const tx = await rareblocksSubscription.connect(owner).sendStakingPayout();

      const stakerPayout = ethers.utils.parseEther('0.8');
      await expect(tx)
        .to.emit(rareblocksSubscription, 'StakingPayoutSent')
        .withArgs(owner.address, rareblocksStaking.address, stakerPayout)
        .to.emit(rareblocksStaking, 'PayoutReceived')
        .withArgs(rareblocksSubscription.address, stakerPayout);

      expect(await rareblocksStaking.getNextPayoutBalance()).to.be.eq(stakerPayout);
    });
  });
});
