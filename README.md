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
