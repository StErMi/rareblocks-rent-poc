// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

interface IRent {
    /// @notice Get the staker balance accumulated in the Rent contract
    /// @return Staker balance accumulated in the Rent contract
    function stakerBalance() external view returns (uint256);

    /// @notice Withdraw funds from the contract to the staker addresss
    /// @dev everyone can call this function. Maybe there should be an incentive to this?
    function stakerPayout() external;
}
