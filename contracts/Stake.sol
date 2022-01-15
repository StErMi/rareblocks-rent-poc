// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

import "./mocks/RareBlocks.sol";
import "./interfaces/IRent.sol";

contract Stake is IERC721Receiver, Ownable, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

    /*///////////////////////////////////////////////////////////////
                             STATE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice RareBlocks contract reference
    RareBlocks private rareblocks;

    /// @notice Rent contract address
    IRent public rent;

    /// @notice number of shares owned by stakers
    uint256 public totalShares;

    /// @notice shares owned by an address
    mapping(address => uint256) public userShares;

    /// @notice token owned by stakers
    mapping(uint256 => address) public tokenOwners;

    /// @notice Set of stakers
    EnumerableSet.AddressSet private stakers;

    /// @notice Total accrued claims to be distributed to stakers
    uint256 public totalAccruedClaimAmount;

    /// @notice User claims to be redemed
    mapping(address => uint256) public userClaims;

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
    /// @param sharePrice The share price paid by the user
    event Staked(address indexed user, uint256 tokenId, uint256 sharePrice);

    /// @notice Emitted after the user has unstaked a RareBlocks pass
    /// @param user The authorized user who triggered the unstake
    /// @param tokenId The tokenId unstaked
    /// @param sharePrice The share price sent to the user
    /// @param claimAmount The amount of accrued claim amount withdrawn with stake
    event Unstaked(address indexed user, uint256 tokenId, uint256 sharePrice, uint256 claimAmount);

    /// @notice Stake a RareBlocks pass and pay to get a staking share
    /// @param tokenId The RareBlocks tokenId to stake
    function stake(uint256 tokenId) external payable whenNotPaused {
        // check that the sender owns the token
        require(rareblocks.ownerOf(tokenId) == msg.sender, "TOKEN_NOT_OWNED");

        // get the current share price
        // @dev if the totalShares is zero it means that no one staked or everyone has withdrawn
        uint256 sharePrice = 0;
        if (totalShares != 0) {
            // We need to remove the `msg.value` from the total balance to calculate the correct share price value
            sharePrice = (getStakedBalance() - msg.value) / totalShares;
        }

        // Check that the user has sent the correct amount
        require(msg.value == sharePrice, "NOT_ENOUGH_FUNDS");

        // Increase the total share count
        totalShares += 1;

        // Add a share to the account
        userShares[msg.sender] += 1;

        // Remember the token owner for the unstake process
        tokenOwners[tokenId] = msg.sender;

        // Add the user to the set of stakers
        stakers.add(msg.sender);

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

        // Get the current share value
        uint256 sharePrice = getSharePrice();

        // Reset the owner of the token
        delete tokenOwners[tokenId];

        // Decrease the number of shares owned by the user
        userShares[msg.sender] -= 1;

        // Decrease the total share count
        totalShares -= 1;

        // remove the user from the list of stakers if he does not own 0 shares
        if (userShares[msg.sender] == 0) {
            stakers.remove(msg.sender);
        }

        // get the userClaim amount
        uint256 claimAmount = userClaims[msg.sender];

        if (claimAmount != 0) {
            // update the user claims
            userClaims[msg.sender] = 0;

            // update total accrued claim
            totalAccruedClaimAmount -= claimAmount;
        }

        // Emit the unstake event
        emit Unstaked(msg.sender, tokenId, sharePrice, claimAmount);

        // Send the token to the user
        rareblocks.safeTransferFrom(address(this), msg.sender, tokenId);

        // Send the share value to the user
        (bool success, ) = msg.sender.call{value: (sharePrice + claimAmount)}("");
        require(success, "UNSTAKE_PAYOUT_FAIL");
    }

    /// @notice Get the total balance owed to stakers
    /// @return The balance withdrawable by stakers
    function getStakedBalance() public view returns (uint256) {
        uint256 stakerBalanceOnRent = 0;

        // Contract can start with rent contract not initialized
        if (address(rent) != address(0)) {
            stakerBalanceOnRent = rent.stakerBalance();
        }
        return address(this).balance + stakerBalanceOnRent - totalAccruedClaimAmount;
    }

    /*///////////////////////////////////////////////////////////////
                             SHARE / PAYOUT LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the user has withdrawn a claim
    /// @param user The authorized user who withdrawn the claim
    /// @param claimAmount The total claim amount withdrawn by the user
    event ClaimWithdraw(address indexed user, uint256 claimAmount);

    /// @notice Emitted after a user has distributed share claims to the stakers
    /// @param user The authorized user who distributed the shares to the stakers
    /// @param sharePrice The share price at the moment of distribution
    /// @param claimAmountDistributed The total amount the user can claim from this distribution
    event DistributeClaims(address indexed user, uint256 sharePrice, uint256 claimAmountDistributed);

    /// @notice Allow the user to claim a distributed share reward if available
    function withdrawClaim() external {
        // check if the user has claims
        uint256 claimAmount = userClaims[msg.sender];
        require(claimAmount != 0, "NO_CLAIM_TO_WITHDRAW");

        // update the user claims
        userClaims[msg.sender] = 0;

        // update total accrued claim
        totalAccruedClaimAmount -= claimAmount;

        // emit the event
        emit ClaimWithdraw(msg.sender, claimAmount);

        // Send claim to the user
        (bool success, ) = msg.sender.call{value: claimAmount}("");
        require(success, "CLAIM_PAYOUT_FAIL");
    }

    /// @notice Allow the owner to distribute the current share value to stakers resetting the share value
    /// @dev I need to loop throw the list of stakers, know how many stakes they have and distribute to them
    /// @dev because RareBlocks have a max cap of 500 it could be safe to do that in a loop (gas revert problem)
    function distributeClaims() external onlyOwner {
        // if there's no staker just revert
        require(totalShares != 0, "NO_STAKERS");

        // Pull the balance from the rent contract if there's any left
        uint256 rentBalance = rent.stakerBalance();
        if (rentBalance != 0) {
            rent.stakerPayout();
        }

        // check if after pulling balance from the rent contract there's still balance
        // left to distribute to stakers
        uint256 availableBalance = address(this).balance - totalAccruedClaimAmount;
        require(availableBalance != 0, "NO_BALANCE_TO_DISTRIBUTE");

        // calc locally the value to distribute to addresses
        uint256 claimValue = availableBalance / totalShares;

        // loop all the stakers
        uint256 accumulatedClaims = 0;
        address[] memory stakersSet = stakers.values();
        uint256 stakersCount = stakersSet.length;
        for (uint256 i = 0; i < stakersCount; i++) {
            address stakerAddress = stakersSet[i];
            if (stakerAddress != address(0)) {
                uint256 totalClaim = claimValue * userShares[stakerAddress];
                userClaims[stakerAddress] += totalClaim;
                accumulatedClaims += totalClaim;
            }
        }

        // update the total amount claimable by the users
        totalAccruedClaimAmount += accumulatedClaims;

        // emit the event
        emit DistributeClaims(msg.sender, claimValue, accumulatedClaims);
    }

    function getSharePrice() public view returns (uint256) {
        if (totalShares == 0) return 0;

        return getStakedBalance() / totalShares;
    }

    /*///////////////////////////////////////////////////////////////
                             RECEIVE / FALLBACK
    //////////////////////////////////////////////////////////////*/

    receive() external payable {
        // Accept payments only from the rent contract
        require(msg.sender == address(rent), "ONLY_FROM_RENT");
    }
}
