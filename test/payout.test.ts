import {artifacts, ethers, waffle} from 'hardhat';
import chai from 'chai';

import {RareBlocksSubscription, RareBlocksStaking, RareBlocks} from '../typechain';
import {SignerWithAddress} from '@nomiclabs/hardhat-ethers/signers';
import {BigNumber} from 'ethers';
import {increaseWorldTimeInSeconds} from './utils';
import {SubscriptionConfig} from './model/SubscriptionConfig';

const {deployContract} = waffle;
const {expect} = chai;

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
      subscriber1,
      subscriber2,
      ...addrs
    ] = await ethers.getSigners();

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

    // mint some NFT
    await rareBlocks.connect(staker1).mint(staker1.address, 1, {value: ethers.utils.parseEther('0.08')});

    // Approve the contract to interact with the NFT
    await rareBlocks.connect(staker1).approve(rareblocksStaking.address, 16);
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
      await rareBlocks.connect(staker2).approve(rareblocksStaking.address, 17);
      await rareBlocks.connect(staker3).approve(rareblocksStaking.address, 18);
      await rareBlocks.connect(staker4).approve(rareblocksStaking.address, 19);
      await rareBlocks.connect(staker5).approve(rareblocksStaking.address, 20);
      await rareBlocks.connect(staker6).approve(rareblocksStaking.address, 21);
      await rareBlocks.connect(staker6).approve(rareblocksStaking.address, 22);
      await rareBlocks.connect(staker7).approve(rareblocksStaking.address, 23);
      await rareBlocks.connect(staker7).approve(rareblocksStaking.address, 24);
      await rareBlocks.connect(staker8).approve(rareblocksStaking.address, 25);
      await rareBlocks.connect(staker9).approve(rareblocksStaking.address, 26);
    });

    it('distribute when you are not the owner of the contract', async () => {
      const tx = rareblocksStaking.connect(staker1).distributePayout();

      await expect(tx).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('distribute when there are no active stakers', async () => {
      const tx = rareblocksStaking.connect(owner).distributePayout();

      await expect(tx).to.be.revertedWith('NO_TOKEN_STAKED');
    });

    it('distribute when there is no balance (no one rented)', async () => {
      await rareblocksStaking.connect(staker1).stake(16);

      const tx = rareblocksStaking.connect(owner).distributePayout();

      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('distribute when there is no balance (prev payout already distributed)', async () => {
      await rareblocksStaking.connect(staker1).stake(16);
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).sendStakingPayout();

      // distribute the first payout
      await rareblocksStaking.connect(owner).distributePayout();

      // try to do the next one briefly after
      const tx = rareblocksStaking.connect(owner).distributePayout();
      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('distribute correctly', async () => {
      // staker 1, 2, 3, 4, 5 staked 1 token
      // staker6 staked 2 tokens but unstaked 1 before payout
      // staker7 have staked 2 tokens
      // staker8 have staked 1 token but unstaked before payout
      // staker9 have staked 1 token but after payout

      // stake before payout
      await rareblocksStaking.connect(staker1).stake(16);
      await rareblocksStaking.connect(staker2).stake(17);
      await rareblocksStaking.connect(staker3).stake(18);
      await rareblocksStaking.connect(staker4).stake(19);
      await rareblocksStaking.connect(staker5).stake(20);

      await rareblocksStaking.connect(staker6).stake(21);
      await rareblocksStaking.connect(staker6).stake(22);

      await rareblocksStaking.connect(staker7).stake(23);
      await rareblocksStaking.connect(staker7).stake(24);

      await rareblocksStaking.connect(staker8).stake(25);

      increaseWorldTimeInSeconds(STAKE_LOCK_PERIOD + 1, true);

      // unstake before payout
      await rareblocksStaking.connect(staker6).unstake(22);
      await rareblocksStaking.connect(staker8).unstake(25);

      // rent for 10 months
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).sendStakingPayout();

      // check balance before payout
      expect(await rareblocksStaking.getNextPayoutBalance()).to.be.equal(ethers.utils.parseEther('0.8'));

      // distribute payout
      const tx = rareblocksStaking.connect(owner).distributePayout();
      await expect(tx)
        .to.emit(rareblocksStaking, 'PayoutDistributed')
        .withArgs(owner.address, ethers.utils.parseEther('0.8'), 7, 8, ethers.utils.parseEther('0.1'));

      // stake after payout
      await rareblocksStaking.connect(staker9).stake(26);

      // check balance after payout
      expect(await rareblocksStaking.getNextPayoutBalance()).to.be.equal(0);

      // check that each staker has the correct payout balance
      expect(await rareblocksStaking.connect(staker1).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await rareblocksStaking.connect(staker2).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await rareblocksStaking.connect(staker3).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await rareblocksStaking.connect(staker4).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await rareblocksStaking.connect(staker5).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await rareblocksStaking.connect(staker6).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.1'));
      expect(await rareblocksStaking.connect(staker7).claimableBalance()).to.be.equal(ethers.utils.parseEther('0.2'));
      expect(await rareblocksStaking.connect(staker8).claimableBalance()).to.be.equal(0);
      expect(await rareblocksStaking.connect(staker9).claimableBalance()).to.be.equal(0);
    });
  });

  describe('Test claimPayout()', () => {
    it('claim balance when you have no balance', async () => {
      const tx = rareblocksStaking.connect(staker1).claimPayout();

      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('claim after already have claimed it', async () => {
      // stake a token
      await rareblocksStaking.connect(staker1).stake(16);

      // renter rent a token
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).sendStakingPayout();

      // distribute payout to stakers
      await rareblocksStaking.connect(owner).distributePayout();

      // staker claim their payout
      await rareblocksStaking.connect(staker1).claimPayout();

      const tx = rareblocksStaking.connect(staker1).claimPayout();

      await expect(tx).to.be.revertedWith('NO_PAYOUT_BALANCE');
    });

    it('event is emitted', async () => {
      // stake a token
      await rareblocksStaking.connect(staker1).stake(16);

      // renter rent a token
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).sendStakingPayout();

      // distribute payout to stakers
      await rareblocksStaking.connect(owner).distributePayout();

      const tx = rareblocksStaking.connect(staker1).claimPayout();

      await expect(tx)
        .to.emit(rareblocksStaking, 'PayoutClaimed')
        .withArgs(staker1.address, ethers.utils.parseEther('0.8'));
    });

    it('correctly claim the reward and balance is updated', async () => {
      // stake a token
      await rareblocksStaking.connect(staker1).stake(16);

      // renter rent a token
      await rareblocksSubscription.connect(subscriber1).subscribe(10, {value: ethers.utils.parseEther('1.0')});

      // distribute staking payout from Rent to Staking contract
      await rareblocksSubscription.connect(owner).sendStakingPayout();

      // distribute payout to stakers
      await rareblocksStaking.connect(owner).distributePayout();

      const reward = ethers.utils.parseEther('0.8'); // 80% of the total rent balance

      // check that reward that can be claimed is the correct one (only one staker so 100% of the total reward)
      expect(await rareblocksStaking.connect(staker1).claimableBalance()).to.be.equal(reward);

      const tx = rareblocksStaking.connect(staker1).claimPayout();

      // check that the reward has been correctly sent to the staker balance
      await expect(await tx).to.changeEtherBalance(staker1, reward);

      // check that the stakers has 0 claimable balance on the contract
      expect(await rareblocksStaking.connect(staker1).claimableBalance()).to.be.equal(0);
    });
  });
});
