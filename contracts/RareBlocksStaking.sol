// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "./interfaces/IRareBlocksStaking.sol";

/// @title RareBlocks Pass Stake contract
contract RareBlocksStaking is IRareBlocksStaking, IERC721Receiver, Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*///////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice list of addresses that can send funds to this
    mapping(address => bool) public allowedSubscriptions;

    /// @notice How many days a user must wait before unstake and stake
    uint256 public constant STAKE_LOCK_PERIOD = 31 days;

    /// @notice RareBlocks contract reference
    IERC721 private rareblocks;

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

    /// @notice Contract constructor
    /// @param _rareblocks The RareBlocks Pass contract
    constructor(IERC721 _rareblocks) {
        // validate parameters
        require(address(_rareblocks) != address(0), "INVALID_RAREBLOCK");

        // set the RareBlocks contract
        rareblocks = _rareblocks;
    }

    /*///////////////////////////////////////////////////////////////
                             IERC721Receiver LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the contract to receive RareBlocks NFT
    function onERC721Received(
        address operator,
        address,
        uint256,
        bytes calldata
    ) external view override returns (bytes4) {
        // accept transfer only from RareBlocks contract
        require(msg.sender == address(rareblocks), "SENDER_NOT_RAREBLOCKS");

        // operator must be the contract itself
        require(operator == address(this), "ONLY_FROM_DIRECT_STAKE");

        return bytes4(keccak256("onERC721Received(address,address,uint256,bytes)"));
    }

    /*///////////////////////////////////////////////////////////////
                             SUBSCRIPTION ALLOW LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner has updated a whitelist entry
    /// @param user The authorized user who triggered the update whitelist
    /// @param subscription The address of the subscription
    /// @param allowed The flag that represent if the subscription is allowed or not to send funds to the contract
    event AllowedSubscriptionUpdate(address indexed user, address subscription, bool allowed);

    /// @inheritdoc IRareBlocksStaking
    function updateAllowedSubscriptions(address[] calldata subscriptions, bool[] calldata allowFlags)
        external
        override
        onlyOwner
    {
        require(subscriptions.length == allowFlags.length, "LENGHTS_MISMATCH");

        for (uint256 i = 0; i < subscriptions.length; i++) {
            // prevent change / event emission if the value is the same as before
            address subscription = subscriptions[i];
            require(subscription != address(0), "INVALID_SUBSCRIPTION");

            bool allowed = allowFlags[i];
            if (allowedSubscriptions[subscription] != allowed) {
                allowedSubscriptions[subscription] = allowed;
                emit AllowedSubscriptionUpdate(msg.sender, subscription, allowed);
            }
        }
    }

    /*///////////////////////////////////////////////////////////////
                             PAUSE STAKE/UNSTAKE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IRareBlocksStaking
    function pause() external override onlyOwner {
        _pause();
    }

    /// @inheritdoc IRareBlocksStaking
    function unpause() external override onlyOwner {
        _unpause();
    }

    /*///////////////////////////////////////////////////////////////
                             STAKE / UNSTAKE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the user has staked a RareBlocks pass
    /// @param user The authorized user who triggered the stake
    /// @param tokenId The tokenId staked
    event Staked(address indexed user, uint256 indexed tokenId);

    /// @notice Emitted after the user has bulk staked multiple RareBlocks pass
    /// @param user The authorized user who triggered the bulk stake
    /// @param tokenIds The tokenIds staked
    event StakedBulk(address indexed user, uint256[] tokenIds);

    /// @notice Emitted after the user has unstaked a RareBlocks pass
    /// @param user The authorized user who triggered the unstake
    /// @param tokenId The tokenId unstaked
    event Unstaked(address indexed user, uint256 indexed tokenId);

    /// @notice Emitted after the user has bulk unstaked multiple RareBlocks pass
    /// @param user The authorized user who triggered the bulk unstake
    /// @param tokenId The tokenIds unstaked
    event UnstakedBulk(address indexed user, uint256[] tokenId);

    /// @inheritdoc IRareBlocksStaking
    function stake(uint256 tokenId) external override whenNotPaused {
        _stake(tokenId);
    }

    /// @inheritdoc IRareBlocksStaking
    function stakeBulk(uint256[] calldata tokenIds) external override whenNotPaused {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _stake(tokenIds[i]);
        }

        emit StakedBulk(msg.sender, tokenIds);
    }

    function _stake(uint256 tokenId) internal {
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

    /// @inheritdoc IRareBlocksStaking
    function unstake(uint256 tokenId) external override whenNotPaused {
        _unstake(tokenId);
    }

    /// @inheritdoc IRareBlocksStaking
    function unstakeBulk(uint256[] calldata tokenIds) external override whenNotPaused {
        for (uint256 i = 0; i < tokenIds.length; i++) {
            _unstake(tokenIds[i]);
        }

        emit UnstakedBulk(msg.sender, tokenIds);
    }

    function _unstake(uint256 tokenId) internal {
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

    /// @inheritdoc IRareBlocksStaking
    function getStakersCount() external view override returns (uint256) {
        return stakers.length();
    }

    /// @inheritdoc IRareBlocksStaking
    function isStaker(address user) external view override returns (bool) {
        return stakers.contains(user);
    }

    /// @inheritdoc IRareBlocksStaking
    function canStake(uint256[] calldata tokenIds) external view override returns (uint256[] memory) {
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

    /// @inheritdoc IRareBlocksStaking
    function canUnstake(uint256[] calldata tokenIds) external view override returns (uint256[] memory) {
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

    /// @inheritdoc IRareBlocksStaking
    function claimableBalance() external view override returns (uint256) {
        return stakerInfos[msg.sender].amountClaimable;
    }

    /// @inheritdoc IRareBlocksStaking
    function claimPayout() external override {
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

    /// @inheritdoc IRareBlocksStaking
    function distributePayout() external override onlyOwner {
        // if there's no staker just revert
        require(totalStakedToken != 0, "NO_TOKEN_STAKED");

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

    /// @inheritdoc IRareBlocksStaking
    function getNextPayoutBalance() external view override returns (uint256) {
        return balanceNextPayout;
    }

    /*///////////////////////////////////////////////////////////////
                             RECEIVE / FALLBACK
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after someone from the allowed subscription has sent ETH to the contract
    /// @param sender The sender of the transaction
    /// @param amount The amount sent with the transaction
    event PayoutReceived(address indexed sender, uint256 amount);

    /// @notice Allow the contract to receive funds
    receive() external payable {
        // Accept payments only from whitelisted sources
        require(allowedSubscriptions[msg.sender], "SENDER_NOT_ALLOWED");

        balanceNextPayout += msg.value;

        emit PayoutReceived(msg.sender, msg.value);
    }
}
