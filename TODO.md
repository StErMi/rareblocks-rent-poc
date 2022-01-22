# TODO LIST

- [ ] allow stakers to unstake multiple tokens
- [ ] allow stakers to check if they can stake multiple tokens
- [ ] allow stakers to check if they can unstake multiple tokens
- [ ] allow stakers to stake multiple tokens
- [ ] switch to custom errors
- [ ] get the staker balance
- [ ] remove receive check. everyone can send to this contract

## Brain dump

- [ ] on stake/unstake should I allow to fail silently instead of revert the whole tx? I think that the frontend should simply call the stake/unstake with the stakable/unstackable tokens (tokens not locked)
- [ ] should anyone send ether to the contract or only allow a whitelist of addresses to send ether?
