// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "./mocks/RareBlocks.sol";
import "./interfaces/IRent.sol";

struct UserStake {
    address owner;
    uint256 stakeTime;
}

struct Payout {
    uint256 balance;
    uint256 payoutTime;
    uint256 totalStakes;
    /// @dev can we create an external mapping for this? like mapping(kekkak(payoutid_tokenid)=>bool) claims;
    /// instead of having inside the payout?
    mapping(uint256 => bool) done;
    uint256 claimablePerStake;
}

contract Stake is IERC721Receiver, Ownable, Pausable {
    /*///////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Payout identifier
    uint256 public payoutId;

    /// @notice History of payouts
    mapping(uint256 => Payout) public payouts;

    /// @notice RareBlocks contract reference
    RareBlocks private rareblocks;

    /// @notice Rent contract address
    IRent public rent;

    /// @notice number of token eligible for current payout
    uint256 public totalStakedToken;

    /// @notice number of token eligible only for the next cycle of payout
    uint256 public totalStakedTokenNextCycle;

    /// @notice token owned by stakers
    mapping(uint256 => UserStake) public stakes;

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
                             STAKE /UNSTAKE LOGIC
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
    /// @dev -------> TODO should if (payoutId == 0) be replaced by if (payoutId == 0 && getStakedBalance() == 0?)
    function stake(uint256 tokenId) external whenNotPaused {
        // check that the sender owns the token
        require(rareblocks.ownerOf(tokenId) == msg.sender, "TOKEN_NOT_OWNED");

        if (payoutId == 0) {
            // no payout have been done yet, stakers can directly enter the next payout
            totalStakedToken += 1;
        } else {
            // the current stake will be payed by the next payout cycle
            totalStakedTokenNextCycle += 1;
        }

        // update the user's stake information
        stakes[tokenId] = UserStake({owner: msg.sender, stakeTime: block.timestamp});

        // Emit the stake event
        emit Staked(msg.sender, tokenId);

        // transfer the token from the owner to the stake contract
        rareblocks.safeTransferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice Unstake a RareBlocks pass and get paid what is owed to you
    /// @param tokenId The RareBlocks tokenId to unstake
    /// @dev -------> TODO if the user unstake without gathering all the payouts those funds will be stuck forever
    /// @dev should the user be able to unstake even if the contract is paused?
    function unstake(uint256 tokenId) external whenNotPaused {
        // Check if the user was the owner of the tokenId
        require(stakes[tokenId].owner == msg.sender, "NOT_TOKEN_OWNER");

        if (payoutId == 0 || stakes[tokenId].stakeTime < payouts[payoutId].payoutTime) {
            // there has been no payout yet or user has staked before the last payout
            totalStakedToken -= 1;
        } else {
            totalStakedTokenNextCycle -= 1;
        }

        // Reset the stake information
        delete stakes[tokenId];

        // Emit the unstake event
        emit Unstaked(msg.sender, tokenId);

        // Send the token to the user
        rareblocks.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    /// @notice Get the total amount of staked tokens
    /// @return The total amount of staked tokens
    function getTotalStakedTokens() public view returns (uint256) {
        return totalStakedToken + totalStakedTokenNextCycle;
    }

    /// @notice Get the total balance owed to stakers
    /// @return The balance withdrawable by stakers
    function getStakedBalance() public view returns (uint256) {
        uint256 stakerBalanceOnRent = 0;

        // Contract can start with rent contract not initialized
        if (address(rent) != address(0)) {
            stakerBalanceOnRent = rent.stakerBalance();
        }
        return address(this).balance + stakerBalanceOnRent;
    }

    /*///////////////////////////////////////////////////////////////
                             PAYOUT LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner has created a Payout snapshot
    /// @param user The authorized user who triggered the payout creation
    /// @param payoutId The ID of the payout
    /// @param payoutBalance The balance of the payout
    /// @param payoutTime The timestamp creation of the payout
    /// @param totalStakes The total number of staked token eligible for the payout
    /// @param claimablePerStake The amount of ETH that a token owner can claim per token
    event PayoutCreated(
        address indexed user,
        uint256 indexed payoutId,
        uint256 payoutBalance,
        uint256 payoutTime,
        uint256 totalStakes,
        uint256 claimablePerStake
    );

    /// @notice Emitted after the staker has claimed the payout for a token
    /// @param user The authorized user who triggered the payout creation
    /// @param payoutId The ID of the payout
    /// @param tokenId The ID of the token
    /// @param claimAmount The amount sent to the staker
    event PayoutClaimed(address indexed user, uint256 indexed payoutId, uint256 indexed tokenId, uint256 claimAmount);

    /// @notice Create a new Payout snapshot
    /// @return The ID of the payout snapshot created
    /// @dev can I remove the require given that the tx should revert because of panic error (division by zero)
    function createPayout() external onlyOwner whenNotPaused returns (uint256) {
        // because at the moment users can rent even without token staked
        // we need to check if there's at least one staked token before creating the payout
        // otherwise this will fail (probably it's useless because it should go in panic error because of div by zero)
        require(totalStakedToken != 0, "NO_TOKEN_STAKED");

        // Pulls funds from the Rent contract
        rent.stakerPayout();

        // get the updated balance of the stake contract
        uint256 balanceSnapshot = address(this).balance;

        // Create the payout with the current snapshot
        uint256 currentPayoutID = payoutId;
        uint256 claimablePerStake = balanceSnapshot / totalStakedToken;
        uint256 payoutTime = block.timestamp;

        // have to use this syntax because of nested mapping
        Payout storage newPayout = payouts[currentPayoutID];
        newPayout.balance = balanceSnapshot;
        newPayout.payoutTime = payoutTime;
        newPayout.totalStakes = totalStakedToken;
        newPayout.claimablePerStake = claimablePerStake;

        // increase the payout ID
        payoutId += 1;

        // move the next cycle token payout to the total staked token count and reset it
        totalStakedToken += totalStakedTokenNextCycle;
        totalStakedTokenNextCycle = 0;

        // emit the payout cration event
        emit PayoutCreated(
            msg.sender,
            currentPayoutID,
            balanceSnapshot,
            payoutTime,
            totalStakedToken,
            claimablePerStake
        );

        return currentPayoutID;
    }

    /// @notice Send the claim of a payout to an elegible staker
    /// @param _payoutId The ID of the Payout
    /// @param tokenId The ID of the Token
    /// @dev We should really batle test this to understand if there's a reason to drain the payout / contract balance
    function claimTokenPayout(uint256 _payoutId, uint256 tokenId) external {
        // Get the stake info
        UserStake memory stakeInfo = stakes[tokenId];

        // Check if the sender is also the stake owner
        require(stakeInfo.owner == msg.sender, "NOT_TOKEN_OWNER");

        // Get the payout info
        Payout storage payout = payouts[_payoutId];

        // Check if the payout exists
        require(payout.payoutTime != 0, "PAYOUT_NOT_FOUND");

        // Check if the stake is eligible for the payout
        // At this point we know the user has staked the token
        // if the payoutId is 0 it means it's the first one so he's in the batch for sure
        // otherwise we check that the stake was staked before the previous payout
        require(payoutId == 0 || stakeInfo.stakeTime < payouts[_payoutId - 1].payoutTime, "STAKE_TIME_NOT_ELIGIBLE");

        // check if the user has not already claimed
        require(!payout.done[tokenId], "CLAIM_ALREADY_SENT");

        // Update the payout info
        payout.done[tokenId] = true;

        // Transfer to the staker
        (bool success, ) = stakeInfo.owner.call{value: payout.claimablePerStake}("");
        require(success, "CLAIM_FAIL");

        // Emit the payout event
        emit PayoutClaimed(msg.sender, _payoutId, tokenId, payout.claimablePerStake);
    }

    /*///////////////////////////////////////////////////////////////
                             RECEIVE / FALLBACK
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        // Accept payments only from the rent contract
        require(msg.sender == address(rent), "ONLY_FROM_RENT");
    }
}
