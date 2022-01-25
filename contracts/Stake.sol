// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./mocks/RareBlocks.sol";
import "./interfaces/IRent.sol";

struct StakeInfo {
    address owner;
    uint256 lockExpire;
}

struct StakerInfo {
    uint256 stakes;
    uint256 amountClaimable;
}

contract Stake is IERC721Receiver, Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*///////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice How many days a user must wait before unstake and stake
    uint256 public constant STAKE_LOCK_PERIOD = 31 days;

    /// @notice RareBlocks contract reference
    RareBlocks private rareblocks;

    /// @notice Rent contract address
    IRent public rent;

    /// @notice number of token eligible for current payout
    uint256 public totalStakedToken;

    /// @notice token owned by stakers
    mapping(uint256 => StakeInfo) public stakes;

    /// @notice
    uint256 private balanceNextPayout;

    /// @notice Set of stakers
    EnumerableSet.AddressSet private stakers;

    /// @notice Total accrued claims to be distributed to stakers
    uint256 public totalAccruedClaimAmount;

    /// @notice Staker info
    mapping(address => StakerInfo) public stakerInfos;

    /*///////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(RareBlocks _rareblocks) {
        // validate parameters
        require(address(_rareblocks) != address(0), "INVALID_RAREBLOCK");

        rareblocks = _rareblocks;

        // Pause until the deployer deploy the rent contract and unpause
        // @dev pause -> deploy rent -> set rent -> unpause could be avoided (at least pause/unpause)
        // if we are going to pause/unpause remove the require on getStakedBalance
        _pause();
    }

    /*///////////////////////////////////////////////////////////////
                             IERC721Receiver LOGIC
    //////////////////////////////////////////////////////////////*/

    function onERC721Received(
        address,
        address,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        // accept transfer only from RareBlocks contract
        require(msg.sender == address(rareblocks), "SENDER_NOT_RAREBLOCKS");
        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }

    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the owner to pause the stake function
    function pauseStake() external onlyOwner {
        _pause();
    }

    /// @notice Allow the owner to unpause the stake function
    function unpauseStake() external onlyOwner {
        _unpause();
    }

    /*///////////////////////////////////////////////////////////////
                             RAREBLOCKS UPDATE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner update the rareblocks contract
    /// @param user The authorized user who triggered the update
    /// @param newRareBlocks The new rareblocks contract
    event RareblocksUpdated(address indexed user, RareBlocks newRareBlocks);

    /// @notice Sets a new address for the rareblocks contract
    /// @param newRareBlocks The new rareblocks contract
    function setRareBlocks(RareBlocks newRareBlocks) external onlyOwner {
        require(address(newRareBlocks) != address(0), "INVALID_RAREBLOCKS");
        rareblocks = newRareBlocks;

        emit RareblocksUpdated(msg.sender, newRareBlocks);
    }

    /*///////////////////////////////////////////////////////////////
                             RENT UPDATE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner update the rent contract
    /// @param user The authorized user who triggered the update
    /// @param newRent The new rent contract
    event RentUpdated(address indexed user, IRent newRent);

    /// @notice Sets a new address for the rent contract
    /// @param newRent The new rent contract
    function setRent(IRent newRent) external onlyOwner {
        require(address(newRent) != address(0), "INVALID_RENT");
        rent = newRent;

        emit RentUpdated(msg.sender, newRent);
    }

    /*///////////////////////////////////////////////////////////////
                             STAKE / UNSTAKE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the user has staked a RareBlocks pass
    /// @param user The authorized user who triggered the stake
    /// @param tokenId The tokenId staked
    event Staked(address indexed user, uint256 indexed tokenId);

    /// @notice Emitted after the user has unstaked a RareBlocks pass
    /// @param user The authorized user who triggered the unstake
    /// @param tokenId The tokenId unstaked
    event Unstaked(address indexed user, uint256 indexed tokenId);

    /// @notice Stake a RareBlocks pass and pay to get a staking share
    /// @param tokenId The RareBlocks tokenId to stake
    function stake(uint256 tokenId) external whenNotPaused {
        // check that the sender owns the token
        require(rareblocks.ownerOf(tokenId) == msg.sender, "TOKEN_NOT_OWNED");

        // Check if there's a lock on that token for the user
        StakeInfo storage stakeInfo = stakes[tokenId];

        // we already know that the token is owned by the user
        // if the owner of the current stake info is different from the sender it means that it was from the prev owner
        // and that the token has changed have been transferred between unstake and re-stake
        // if the owner is the same check the lock period
        require(stakeInfo.owner != msg.sender || stakeInfo.lockExpire < block.timestamp, "TOKEN_LOCKED");

        // update total staked token count
        totalStakedToken += 1;

        // update the user's stake information
        stakeInfo.owner = msg.sender;
        stakeInfo.lockExpire = block.timestamp + STAKE_LOCK_PERIOD;

        // Add the user to the set of stakers
        stakers.add(msg.sender);

        // update the user info
        stakerInfos[msg.sender].stakes += 1;

        // Emit the stake event
        emit Staked(msg.sender, tokenId);

        // transfer the token from the owner to the stake contract
        rareblocks.safeTransferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice Unstake a RareBlocks pass and get paid what is owed to you
    /// @param tokenId The RareBlocks tokenId to unstake
    /// @dev should the user be able to unstake even if the contract is paused?
    function unstake(uint256 tokenId) external whenNotPaused {
        StakeInfo storage stakeInfo = stakes[tokenId];

        // Check if the user was the owner of the tokenId
        require(stakes[tokenId].owner == msg.sender, "NOT_TOKEN_OWNER");

        // allow unstake only if the lock has expired
        require(stakeInfo.lockExpire < block.timestamp, "TOKEN_LOCKED");

        // update the lock period for next stake
        stakeInfo.lockExpire = block.timestamp + STAKE_LOCK_PERIOD;

        // update total staked token count
        totalStakedToken -= 1;

        // update the user info
        stakerInfos[msg.sender].stakes -= 1;

        // remove the user from the list of stakers if he does not own 0 shares
        if (stakerInfos[msg.sender].stakes == 0) {
            stakers.remove(msg.sender);
        }

        // Emit the unstake event
        emit Unstaked(msg.sender, tokenId);

        // Send the token to the user
        rareblocks.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    /// @notice Get the total number of unique stakers
    /// @return The total number of unique stakers
    function getStakersCount() external view returns (uint256) {
        return stakers.length();
    }

    /// @notice Check if an address has staked at least a token
    /// @param user The user that need to be checked if is a staker
    /// @return If the user is a staker
    function isStaker(address user) external view returns (bool) {
        return stakers.contains(user);
    }

    /// @notice Check if a list of tokens can be staked
    /// @param tokenIds List of tokens to be checked
    /// @return The list of tokens that can be staked
    /// @dev approve is not taked in account in this case. User must have already approved Stake contract for single or all tokens
    function canStake(uint256[] calldata tokenIds) external view returns (uint256[] memory) {
        uint256[] memory okTokens = new uint256[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            StakeInfo storage stakeInfo = stakes[tokenId];
            // user must be the owner of the token
            // if token is unstaked the owner must be different (token transferred to new owner) or the lock period must be passed
            if (
                rareblocks.ownerOf(tokenId) == msg.sender &&
                (stakeInfo.owner != msg.sender || stakeInfo.lockExpire < block.timestamp)
            ) {
                okTokens[i] = tokenId;
            }
        }

        return okTokens;
    }

    /// @notice Check if a list of tokens can be unstaked
    /// @param tokenIds List of tokens to be checked
    /// @return The list of tokens that can be unstaked
    function canUnstake(uint256[] calldata tokenIds) external view returns (uint256[] memory) {
        uint256[] memory okTokens = new uint256[](tokenIds.length);

        for (uint256 i = 0; i < tokenIds.length; i++) {
            uint256 tokenId = tokenIds[i];
            StakeInfo storage stakeInfo = stakes[tokenId];

            // owner of the token must be this contract (token staked)
            // owner of the stake must be the sender
            // stake must be unlocked
            if (
                rareblocks.ownerOf(tokenId) == address(this) &&
                stakeInfo.owner == msg.sender &&
                stakeInfo.lockExpire < block.timestamp
            ) {
                okTokens[i] = tokenId;
            }
        }

        return okTokens;
    }

    /*///////////////////////////////////////////////////////////////
                             PAYOUT LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the staker has claimed the payout distributed
    /// @param user The authorized staker that has claimed the payout
    /// @param claimedAmount The amount claimed
    event PayoutClaimed(address indexed user, uint256 claimedAmount);

    /// @notice Emitted after the owner has distributed the payout to stakers balance
    /// @param user The authorized user who triggered the payout creation
    /// @param payoutAmount The total amount distributed to stakers
    /// @param stakersCount The amount of stakers at payout time
    /// @param stakesCount The amount of token staked at payout time
    /// @param claimablePerStake The amount clamimable for each stake
    event PayoutDistributed(
        address indexed user,
        uint256 payoutAmount,
        uint256 stakersCount,
        uint256 stakesCount,
        uint256 claimablePerStake
    );

    function claimableBalance() external view returns (uint256) {
        return stakerInfos[msg.sender].amountClaimable;
    }

    function claimPayout() external {
        StakerInfo storage stakerInfo = stakerInfos[msg.sender];

        uint256 claimableAmount = stakerInfo.amountClaimable;

        // check if the user has any payout
        require(claimableAmount != 0, "NO_PAYOUT_BALANCE");

        // reset the claimable amount
        stakerInfo.amountClaimable = 0;

        // emit the event
        emit PayoutClaimed(msg.sender, claimableAmount);

        // Transfer to the staker
        (bool success, ) = msg.sender.call{value: claimableAmount}("");
        require(success, "CLAIM_FAIL");
    }

    function distributePayout() external onlyOwner {
        // if there's no staker just revert
        require(totalStakedToken != 0, "NO_TOKEN_STAKED");

        // Pulls funds from the Rent contract, balanceNextPayout should be updated
        // We need to check if the Rent has funds otherwise it will revert (on Rent side)
        // And this is not ok because the Owner could do a daily `rent.stakerPayout()` but at
        // distributePayout it would revert because there are no funds on Rent
        uint256 stakeBalanceOnRent = rent.stakerBalance();
        if (stakeBalanceOnRent > 0) {
            rent.stakerPayout();
        }

        // get the updated balance of the stake contract
        uint256 balanceSnapshot = balanceNextPayout;

        // check if we have at least some balance for stakers claims
        require(balanceNextPayout != 0, "NO_PAYOUT_BALANCE");

        // calc the amount claimable for each stake
        uint256 claimablePerStake = balanceSnapshot / totalStakedToken;

        // loop all the stakers
        address[] memory stakersSet = stakers.values();
        uint256 stakersCount = stakersSet.length;
        for (uint256 i = 0; i < stakersCount; i++) {
            address stakerAddress = stakersSet[i];
            if (stakerAddress != address(0)) {
                StakerInfo storage stakerInfo = stakerInfos[stakerAddress];
                uint256 totalClaim = claimablePerStake * stakerInfo.stakes;
                stakerInfo.amountClaimable += totalClaim;
            }
        }

        // Reset the balance for the next payout
        balanceNextPayout = 0;

        // emit the event
        emit PayoutDistributed(msg.sender, balanceSnapshot, stakersCount, totalStakedToken, claimablePerStake);
    }

    /// @notice Get the total balance owed to stakers
    /// @return The balance withdrawable by stakers
    function getNextPayoutBalance() public view returns (uint256) {
        uint256 stakerBalanceOnRent = 0;

        // Contract can start with rent contract not initialized
        if (address(rent) != address(0)) {
            stakerBalanceOnRent = rent.stakerBalance();
        }
        return balanceNextPayout + stakerBalanceOnRent;
    }

    /*///////////////////////////////////////////////////////////////
                             RECEIVE / FALLBACK
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        // Accept payments only from the rent contract
        require(msg.sender == address(rent), "ONLY_FROM_RENT");

        balanceNextPayout += msg.value;
    }
}
