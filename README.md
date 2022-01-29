# PURPOSE OF PROJECT

## Subscription Contract

- Enable purchase of access to the Rareblocks project by paying a monthly or yearly fee.
- Distribute the funds to three different contracts/wallets: Treasury, Staker contract and Creator Pool (to be created)
- Enable lookup of user wallet to see if they have paid access or not

## Staking Contract

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
- Stakers that send their Pass directly to the contract via `transfer` will lose access to their pass without possibility to revert the action

## TODOS

- [ ] Add ability to more payout addresses to the Subscription contract for future additional partner proframs (Creator pool for example)
- [x] Add the ability to the Subscription contract to whitelist addresses who can send funds to contract, to enable future revenue streams (Marketplace)
- [ ] Set a minimum amount of Ethereum before the mass payout function can be called to make sure gas prices are lower than the actually to be divided revenue
