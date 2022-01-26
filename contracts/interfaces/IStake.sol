// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;
import "../mocks/RareBlocks.sol";

import "./IRent.sol";

interface IStake {
    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the owner to pause the stake function
    function pauseStake() external;

    /// @notice Allow the owner to unpause the stake function
    function unpauseStake() external;

    /// @notice Get the current pause state of the contract;
    /// @return The pause state of the contract, true if paused
    // function paused() public view virtual returns (bool);

    /*///////////////////////////////////////////////////////////////
                             RAREBLOCKS UPDATE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a new address for the rareblocks contract
    /// @param newRareBlocks The new rareblocks contract
    function setRareBlocks(RareBlocks newRareBlocks) external;

    /*///////////////////////////////////////////////////////////////
                             RENT UPDATE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a new address for the rent contract
    /// @param newRent The new rent contract
    function setRent(IRent newRent) external;

    /*///////////////////////////////////////////////////////////////
                             STAKE / UNSTAKE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Stake a RareBlocks pass and pay to get a staking share
    /// @param tokenId The RareBlocks tokenId to stake
    function stake(uint256 tokenId) external;

    /// @notice Unstake a RareBlocks pass and get paid what is owed to you
    /// @dev should the user be able to unstake even if the contract is paused?
    /// @param tokenId The RareBlocks tokenId to unstake
    /// @dev should the user be able to unstake even if the contract is paused?
    function unstake(uint256 tokenId) external;

    /// @notice Get the total number of unique stakers
    /// @return The total number of unique stakers
    function getStakersCount() external view returns (uint256);

    /// @notice Check if an address has staked at least a token
    /// @param user The user that need to be checked if is a staker
    /// @return If the user is a staker
    function isStaker(address user) external view returns (bool);

    /// @notice Check if a list of tokens can be staked
    /// @dev approve is not taked in account in this case. User must have already approved Stake contract for single or all tokens
    /// @param tokenIds List of tokens to be checked
    /// @return The list of tokens that can be staked
    function canStake(uint256[] calldata tokenIds) external view returns (uint256[] memory);

    /// @notice Check if a list of tokens can be unstaked
    /// @param tokenIds List of tokens to be checked
    /// @return The list of tokens that can be unstaked
    function canUnstake(uint256[] calldata tokenIds) external view returns (uint256[] memory);

    /*///////////////////////////////////////////////////////////////
                             PAYOUT LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Get the total payout balance owed to to a stakerclaimPayout
    /// @return The payout balance withdrawable by the staker
    function claimableBalance() external view returns (uint256);

    /// @notice Allow the staker to withdrawn the payout
    function claimPayout() external;

    /// @notice Allow the owner of the contract to distribute the rewards to stakers
    function distributePayout() external;

    /// @notice Get the total balance owed to stakers
    /// @return The balance withdrawable by stakers
    function getNextPayoutBalance() external view returns (uint256);
}
