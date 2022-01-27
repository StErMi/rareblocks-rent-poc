// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;
import "./IStake.sol";

interface IRent {
    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the owner to pause the rent function
    function pauseRent() external;

    /// @notice Allow the owner to unpause the rent function
    function unpauseRent() external;

    /*///////////////////////////////////////////////////////////////
                             FEE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a new fee percentage for the staker
    /// @param newFeePercent The new fee percentage.
    function setStakerFee(uint256 newFeePercent) external;

    /*///////////////////////////////////////////////////////////////
                             RENT LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the max rentable pass
    /// @param newMaxRentals The new max number of RareBlocks rentable
    function setMaxRentals(uint256 newMaxRentals) external;

    /// @notice Sets a new montly price per rent
    /// @param newRentMontlyPrice The new rent montly price
    function setRentMontlyPrice(uint256 newRentMontlyPrice) external;

    /// @notice Rent a RareBlock pass for a number of months
    /// @param months The amounth of months the user want to rent the pass
    /// @dev do we want to limit the amount of months the user can rent the pass for?
    function rent(uint256 months) external payable;

    /// @notice Check if a user has an active pass
    /// @return True if the user has an active pass and it has not expired yet
    function isRentActive() external view returns (bool);

    /*///////////////////////////////////////////////////////////////
                             TRESURY LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Update the tresury address
    /// @param newTresury The new tresury address
    function setTresury(address newTresury) external;

    /// @notice Withdraw funds from the contract to the tresury addresss
    function withdrawTresury() external;

    /// @notice Update the staker address
    /// @param newStaker The new staker address
    function setStaker(IStake newStaker) external;

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
