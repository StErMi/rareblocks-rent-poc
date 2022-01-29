# TODO LIST

- [x] allow stakers to unstake multiple tokens
- [x] allow stakers to stake multiple tokens
- [x] allow stakers to check if they can stake multiple tokens
- [x] allow stakers to check if they can unstake multiple tokens
- [ ] switch to custom errors
- [x] get the staker balance
- [x] remove receive check. everyone can send to this contract
- [x] added support to whitelist contract to send funds to the staking contract
- [x] add full test coverage
- [x] add support to solcover
- [x] migrate naming to RareBlocksStaking and RareBlocksSubscription

## Brain dump

- [x] should anyone send ether to the contract or only allow a whitelist of addresses to send ether?
- [x] should canStake/canUnstake return 0 if the contract is paused? -> no
- [x] should canStake check external factors like the the contract have been approved by the stakers for the token or all-tokens? -> no
