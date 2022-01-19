# Project Introduction

This project should allow [RareBlocks NFT Pass](https://rareblocks.xyz/) owners to stake their Pass in the `Stake` contract and get rewarded with ETH by the profit of renting their passes by renters.

RareBlocks NFT are supply capped at 500.

## Use case

- Staker stake the pass that will be available to be rented in a pool
- Renter want to use the RareBlocks service for X amount of months where `1<=X<=12`. Renter will pay `Y` to rent the pass from the pool where `Y = X * Z` and `Z = rentCost per month in ETH`
- Staker will be rewarded a `fee` from the rent cost

## Reward distribution mechanism

I have tried to implement two different types of reward distribution mechanism:

- share: each staker when stake purchase a share, the share value (and cost) will increase when renters rent a pass and will decrease when a staker unstake the pass (unstaking will "sell" the share)
- payout: owner of the contract will create a periodic snapshot of the balance and create a `Payout`. Stakers that have staked before the payout are entitled to claim the payout reward.

For these two distribution mechanism I've also implemented a `mass-distribution` flavor where the owner of the contract distribute the whole payout to users.

## TODO

The project is not finished, I just wanted to explore possible reward distribution mechanism and understand their pro/cons and how much gas would they cost.

- [ ] cover the whole code with tests
- [ ] add more methods to allow users to get their funds with ony 1 tx
- [ ] add read-only utility functions for web3 frontends
- [ ] experiment more ways for reward mechanism
- [ ] [...]

# Problem and briandump

# Shares

Repo: https://github.com/StErMi/rareblocks-rent-poc/tree/shares

When the staker stake a Pass he/she needs to purchase a share.
The share cost is calculated like this `getStakedBalance() / totalShares;`

`getStakedBalance` will return the balance of the `Stake` contract plus the balance in the `Rent` contract that is owned by the `Stake` contract (rent cost - tresury commission).

The problem of this approach is that if no stakers unstake (sell the share) and renters keep renting the share value will only increase.

Because stakers needs to buy a share when they stake their NFT at some point (in this worst case situation) they will need to pay a lot of ETH for the investment.

At least for now I've not found a way to allow Stakers to claim their share value without selling their share.

# Shares Mass Distribution

Repo: https://github.com/StErMi/rareblocks-rent-poc/tree/shares-mass-distribution

This mechanism is an extension of the Shares mechanism witht the only addition of a `distributeClaims()` function that try to solve the above problem creating a way to distribute all the current share values to the stakers without selling those shares.

After `distributeClaims` the shareValue will be 0, so new stakers can stake their pass with a lower share price.

The problem of this solution is the high cost fee. At the current time distributing those share rewards will cost ~13.5m gas in the worst scenario (500 different stakers, so 500 loops)

# Payout

Repo: https://github.com/StErMi/rareblocks-rent-poc/tree/payout

This mechanism create a periodic snapshot of the Payout allowing stakers that have staked before the snapshot to claim their reward.

The problem is that the UX in this scenario is not the best because for each payout users needs to claim using a function like `claim(payoutID, tokenID)`.
It's true that I can easily add utility functions like `claim(payoutIDs[], tokenIDs[][])` where for each payout you can specify a list of `tokenIDs` to pull from but it still have a lot of problems because users/web3 frontend needs to always remember for each payout which tokens have been already claimed.

# Payout Mass Distribution

Repo: https://github.com/StErMi/rareblocks-rent-poc/tree/payout-mass-distribution

This version of the payout removed totally the periodic snapshot and just add a `distributeMassPayout()` function similar to the `distributeClaims()` from `shares-mass-distribution` branch. Being similar it has also similar cost: ~13.5m gas in the worst scenario.
