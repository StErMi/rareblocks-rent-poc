// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;
import "./IStake.sol";

interface IRareBlocksSubscription {
    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the owner to pause the subscription function
    function pauseSubscription() external;

    /// @notice Allow the owner to unpause the subscription function
    function unpauseSubscription() external;

    /*///////////////////////////////////////////////////////////////
                             FEE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a new fee percentage for the staker
    /// @param newFeePercent The new fee percentage.
    function setStakerFee(uint256 newFeePercent) external;

    /*///////////////////////////////////////////////////////////////
                             SUBSCRIPTION LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the max subscriptions
    /// @param newMaxSubscriptions The new max number of RareBlocks subscriptions
    function setMaxSubscriptions(uint256 newMaxSubscriptions) external;

    /// @notice Sets a new montly price per subscription
    /// @param newSubscriptionMontlyPrice The new subscription montly price
    function setSubscriptionMontlyPrice(uint256 newSubscriptionMontlyPrice) external;

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
    /// @param newStaking The new staking contract address
    function setStaking(IStake newStaking) external;

    /*///////////////////////////////////////////////////////////////
                             STAKER LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Withdraw funds from the contract to the staker addresss
    /// @dev everyone can call this function. Maybe there should be an incentive to this?
    function stakerPayout() external;

    /// @notice Get the balance that can be withdrawn by the Staking contract
    /// @return The balance that can be withdrawn by the Staking contract
    function stakerBalance() external view returns (uint256);
}
