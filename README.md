# PURPOSE OF PROJECT

## Subscription Contract
- Enable purchase of access to the Rareblocks project by paying a monthly or yearly fee. 
- Distribute the funds to three different contracts/wallets: Treasury, Staker contract and Creator Pool (to be created)
- Enable lookup of user wallet to see if they have paid access or not

## Stake Contract
- Enable Rareblocks NFT holders to stake and unstake their NFT
- Staking an NFT makes you eligable to future payouts from revenue streams created by Rareblocks, where the first one will be the Subscription Contract
- Payouts are manually called by Treasury Wallet every few months, when a minimum amount of funds are available in the Stake or Subscription contract
- When a payout is created, all stakers who staked before the payout date will get a share of the funds. I.e. if 100 NFTs are staked and the total funds are $100.000, every staker is eligable to $1,000.
- Payout call will assign a value to every staker wallet address
- Staker can call a withdrawal function which will send the eligable funds to their wallet
- To disensentivese frequent staking and unstaking, a lockup period of 31 days is introduced on stake and unstake. 
- Stakers can stake for free (exclucing gas costs) to make it usable even for NFT holders who do not have the funds to purchase shares.

# POSSIBLE ISSUES
- Stakers could stake their NFT a few days before payout happens. While this might be an unfair issue in the beginning, the goal is to have future profit of a level that makes payouts enabled every month. With the lockup period, this will mitigate this unfair situation.
- Payout function call could be pricy. We've limited the supply to 250 passes, meaning payout could cost up to $2000. The real amount of stakers will be lower though, as we currently have 142 unique holders. NFT holders can not access Rareblocks while their pass is staked. This means that the real count of stakers will probably be around 100-150 passes staked, bringing the payout function down to about $1000 is gas costs. We'll be migrating to a L2 solution fairly soon, meaning gas prices won't be an issue anymore.
- Users could lose payouts if they unstake before a payout happens. A solution for this is to put a warning on the front-end before unstaking letting stakers know a possible payout might happen soon when the Subscription contract value is over a certain amount of value. It's up to the stakers to make the right call. The same happens with real stocks where if you sell your stocks before dividend payout you're not eligable. Stakers are therefore incentivesed to keep the NFT stakers for long time.
- We've chosen to go the staking route, instead of making snapshots, because this incentiveses NFT holders to lockup their NFT and take them off the market. Only serious holders should be rewarded.

## TODOS
- [ ] Add ability to more payout addresses to the Subscription contract for future additional partner proframs (Creator pool for example)
- [ ] Add the ability to the Subscription contract to whitelist addresses who can send funds to contract, to enable future revenue streams (Marketplace)
- [ ] Set a minimum amount of Ethereum before the mass payout function can be called to make sure gas prices are lower than the actually to be divided revenue


# CHANGELOG

## Lock mechanism

With the current update I introduced a lock mechanism for stake/unstake. If the user stake a token it can be unstaked only after 31 days.
After unstake that user for the same token can only stake it again after 31 days.
If the token change the owner after unstake (sold), the new owner can stake it again without any delay.

Now if the current owner unstake it before claiming all the payouts it can still claim them without problem.
BUT if he sell the token, the new owner can stake the token and claim the unclaimed payouts from the prev user.

### Side problem

User could stake -> wait -> unstake and now transfer to another account to stake again skipping the lock period.
This is to take in consideration.

## Removed checks of stake timing to be elegible for the payout

Now user that have staked BEFORE the payout (even 1 sec) are elegible for the payout. (see the stake/unstake lock mechanism)

# Trade offs compared to the shares mechanism

The payout solutions has some problem compared to the shares mechanism.

1. Staker will be able to get a payout only from the next payout cycle. So if you stake at day 1 of the cycle, you will only be able to redeem on the next cycle and not the current one to avoid frontrunning attack. It can be mitigated by introducing a delta time where we allow the staker to redeem the current cycle if stake at least X delta before the next payout.
2. There's no easy way to aggregate all the payouts a staker can claim (for all the tokens). I can create some bulk function with payoutIds[] and tokenIds[] but it will still costs a lot of gas for the user. There must be an utility function that allow the staker to know how much he can totally redeem so he can understand if it's worth it or not
3. With the current implementation if you unstake the token before gathering all the payouts those funds will be stuck in the stake's contract. I need to find a way to solve this problem but it should not be too difficult (I need to create tests before implement this feature)

# Problems

### stakes will lose funds if he unstake before getting all the payouts

if I add an unstake time when `unstake` is called without deleting the UserStake info I could allow users to claim
claimable payout even if they have already unstaked only if the payout[id].payoutTime < unstakeTime

(need to do more research and testing on this)

### which is the best way on `stake` to check if the stake go to this cycle or next one?

can I just check if payoutID = 0 or stake.stakeTime < payouts[payoutID-1].payoutTime ?

# TODO

- [ ] Add more tests on rent.ts
- [ ] Add all possible tests on stake.ts
- [ ] Add a way to allow renting only if there's enough staked token
- [ ] is there a way to cumulate the staker's payout in order to save gas?
- [ ] add more utility functions to calc staker's total?

# BRAIN DUMP

I can maintain a mapping of user's owned token `mapping(address => uint256[])` to allow the user to easily pull the payoutIds[]?
