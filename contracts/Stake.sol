// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import "./mocks/RareBlocks.sol";
import "./interfaces/IRent.sol";

contract Stake is IERC721Receiver, Ownable, Pausable {
    /*///////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice RareBlocks contract reference
    RareBlocks private rareblocks;

    /// @notice Rent contract address
    IRent public rent;

    /// @notice number of staked tokens
    uint256 public totalStaked;

    /// @notice count total value that has not been distributed yet
    uint256 public valueNotDivided = 0;

    /// @notice token owned by stakers
    mapping(uint256 => address) public tokenOwners;

    // @notice token staked on date
    mapping(uint256 => uint256) public tokenStakeDate;

    /// @notice amount of payouts created for keeping track of ids
    uint256 currentPayoutIndex = 0;

    /// @notice struct for divident payout
    struct Payout {
        uint256 date; // Payout date
        mapping(address => bool) claimedBy; // TokenIds who claimed this payout already
        uint256 totalValue; // Total value of this payout
        uint256 claimablePerToken; // Amount claimable per staked token
        uint256 totalClaimed; // Count how many value has been claimed to date
    }

    // Mapping created Payouts per unique ID;
    mapping(uint256 => Payout) public payouts;

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
        address operator,
        address from,
        uint256 tokenId,
        bytes calldata
    ) external view override returns (bytes4) {
        // console.log(">>>>>>>> onERC721Received");
        require(msg.sender == address(rareblocks), "SENDER_NOT_RAREBLOCKS");

        // console.log("msg.sender -> ", msg.sender);
        // console.log("address(rareBlock) -> ", address(rareBlock));
        // console.log("operator -> ", operator);
        // console.log("from -> ", from);
        // console.log("tokenId -> ", tokenId);

        // in this case there should not be any stake record for this token, nor rent open
        // _createStake(from, tokenId, 0, false);

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
    /// @param sharePrice The share price paid by the user
    event Staked(address indexed user, uint256 tokenId, uint256 sharePrice);

    /// @notice Emitted after the user has unstaked a RareBlocks pass
    /// @param user The authorized user who triggered the unstake
    /// @param tokenId The tokenId unstaked
    /// @param sharePrice The share price sent to the user
    event Unstaked(address indexed user, uint256 tokenId, uint256 sharePrice);

    /// @notice Stake a RareBlocks pass and pay to get a staking share
    /// @param tokenId The RareBlocks tokenId to stake
    function stake(uint256 tokenId) external whenNotPaused {
        // check that the sender owns the token
        require(rareblocks.ownerOf(tokenId) == msg.sender, "TOKEN_NOT_OWNED");

        // Increase the total stake count
        totalStaked += 1;

        // Save date of staked token
        tokenStakeDate[tokenId] = now;

        // Remember the token owner for the unstake process
        tokenOwners[tokenId] = msg.sender;

        // Emit the stake event
        emit Staked(msg.sender, tokenId, sharePrice);

        // transfer the token from the owner to the stake contract
        rareblocks.safeTransferFrom(msg.sender, address(this), tokenId);
    }

    /// @notice Unstake a RareBlocks pass and get paid what is owed to you
    /// @param tokenId The RareBlocks tokenId to unstake
    function unstake(uint256 tokenId) external whenNotPaused {
        // Check if the user was the owner of the tokenId
        require(tokenOwners[tokenId] == msg.sender, "NOT_TOKEN_OWNER");

        // Token can not be unstaked within 30 days after staking to make it fair for everyone
        require(tokenStakeDate[tokenId] + 30 days < now, "STAKE_STILL_TIME_LOCKED")

        // Reset the owner of the token
        delete tokenOwners[tokenId];

        // Remove tracking of token stake date
        delete tokenStakeDate[tokenId];

        // Decrease the total stake count
        totalStaked -= 1;

        // Emit the unstake event
        emit Unstaked(msg.sender, tokenId, sharePrice);

        // Send the token to the user
        rareblocks.safeTransferFrom(address(this), msg.sender, tokenId);
    }

    // Returns the amount of staked tokens
    function getTotalStakedTokens() external view returns (uint256){
        return totalStaked;
    }

    /*///////////////////////////////////////////////////////////////
                             PAYOUT / CLAIM PAYOUT
    //////////////////////////////////////////////////////////////*/

    // This functions is called by contract owner to create a new Payout. Stakers can than claim this payout and withdraw their share per token
    function createPayout() external whenNotPaused onlyOwner{

        // Uint that's increased every time in receive() after we make a payment from the Rental contract and is reset after this functiom
        uint256 totalToPayout = valueNotDivided; 

        // Create a new claimable payout, with increasing ID so we can loop over it in the frontend
        payouts[currentPayoutIndex] = Payout({
            date: now,
            totalValue: totalToPayout,
            claimablePerToken: totalToPayout / getTotalStakedTokens()  // Gets total token staked on this Payout creation date
        })

        // Increase payout index
        currentPayoutIndex += 1;
        
        // Reset total value thats unclaimed
        valueNotDivided = 0;
    }

    function claimPayout(uint256 payoutId) external {
        // Check if user owns this token
        require(tokenOwners[tokenId] == msg.sender, "NOT_TOKEN_OWNER");

        // Get the selected Payout by payoutId
        uint256 payout = payouts[payoutId];

        // Check if user has already claimed reward for this token
        require(!payout.claimedBy[msg.sender], "REWARD_CLAIMED_ALREADY")

        // Check if the payout doesnt pay more than the total. Protection against draining the funding
        require(payout.totalValue > payout.totalClaimed, "PAYOUT_IS_EMPTY");

        // Amount of tokens owned by sender and staked before payout date
        uint256 tokenAmountEligableForPayout = 0; 
        
        // Get total minted rareblocks
        uint256 totalMintedNfts = rareblocks.getTokenCount(); 

        // Loop through amount of minted NFTs
        for (uint256 i = 0; i < totalMintedNfts; i++) {
             // Check if tokenId is staked by sender
            if(tokenOwners[i] === msg.sender){
                // Check if tokenId is staked before payout date
                if(tokenStakeDate[i] < payout.date){
                    tokenAmountEligableForPayout += 1;
                }
            }
        }
        
        // If token was staked after payout created, than not eligable for payout
        require(tokenAmountEligableForPayout > 0, "NOT_ELIGABLE");

        // Get payable amount per staked token times the amount of tokens staked by sender before payout date
        uint256 payoutAmount = payout.claimablePerToken * tokenAmountEligableForPayout;

        // Save tokenId to make sure they cannot claim this again with this tokenId
        payout.claimedBy[msg.sender] = true;

        // Increase count of total payout for the payout
        payout.totalClaimed += payoutAmount;

        // Payout share of Payout
        (bool success, ) = address(msg.sender).call{value: payoutAmount}("");
        require(success, "PAYOUT_FAIL");
    }

    /*///////////////////////////////////////////////////////////////
                             RECEIVE / FALLBACK
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        // Accept payments only from the rent contract
        require(msg.sender == address(rent), "ONLY_FROM_RENT");
        valueNotDivided = += msg.value; // Keep track of value received and hasn't been part of a divident payout yet
    }
}
