// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

interface IRareBlocksSubscription {
    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the owner to pause the subscription function
    function pause() external;

    /// @notice Allow the owner to unpause the subscription function
    function unpause() external;

    /*///////////////////////////////////////////////////////////////
                             FEE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a new fee percentage for the RareBlocksStaking
    /// @param newFeePercent The new fee percentage.
    function setStakingFee(uint256 newFeePercent) external;

    /*///////////////////////////////////////////////////////////////
                             SUBSCRIPTION LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the max subscriptions
    /// @param newMaxSubscriptions The new max number of RareBlocks subscriptions
    function setMaxSubscriptions(uint256 newMaxSubscriptions) external;

    /// @notice Sets a new monthly price per subscription
    /// @param newSubscriptionMonthlyPrice The new subscription monthly price
    function setSubscriptionMonthlyPrice(uint256 newSubscriptionMonthlyPrice) external;

    /// @notice Subscribe to a RareBlock pass for a number of months
    /// @param months The amounth of months the user want to subscribe the pass
    function subscribe(uint256 months) external payable;

    /// @notice Check if a user has an active subscription
    /// @return True if the user has an active subscription and it has not expired yet
    function isSubscriptionActive() external view returns (bool);

    /*///////////////////////////////////////////////////////////////
                             TRESURY LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Update the tresury address
    /// @param newTresury The new tresury address
    function setTresury(address newTresury) external;

    /// @notice Withdraw funds from the contract to the tresury addresss
    function withdrawTresury() external;

    /// @notice Update the staking contract address
    /// @param newRareBlocksStaking The new staking contract address
    function setRareBlocksStaking(address newRareBlocksStaking) external;

    /*///////////////////////////////////////////////////////////////
                             STAKING PAYOUT/BALANCE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Withdraw funds from the contract to the RareBlocksStaking addresss
    function sendStakingPayout() external;

    /// @notice Get the balance that can be withdrawn by the RareBlocksStaking contract
    /// @return The balance that can be withdrawn by the RareBlocksStaking contract
    function stakingBalance() external view returns (uint256);
}
