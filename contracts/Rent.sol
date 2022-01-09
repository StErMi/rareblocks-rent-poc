// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "hardhat/console.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

import "./interfaces/IStake.sol";

/// @title Rent contract
/// @author poster & SterMi
/// @notice Manage RareBlocks renting for an amount of months
contract Rent is Ownable, Pausable {
    /*///////////////////////////////////////////////////////////////
                             STORAGE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Max staker fee
    /// @dev 0 = 0%, 5000 = 50%, 10000 = 100%
    uint256 public constant STAKER_MAX_FEE = 10_000;

    /// @notice Rent price per month
    uint256 rentMontlyPrice;

    /// @notice max amount of rentable RareBlocks
    uint256 public maxRentals;

    /// @notice Number of pass currently rented
    uint256 public amountRented;

    /// @notice map of renting made by users that store the expire time for a rent
    mapping(address => uint256) public rents;

    /// @notice Staker fee profit percent
    uint256 public stakerFeePercent;

    /// @notice Staker contract
    IStake staker;

    /// @notice balance of fees that must be sent to the Staker contract
    uint256 public stakerBalance;

    /// @notice Tresury contract address
    address public tresury;

    /*///////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        uint256 _rentMontlyPrice,
        uint256 _maxRentals,
        uint256 _stakerFeePercent,
        IStake _staker,
        address _tresuryAddress
    ) Ownable() {
        // check that all the parameters are valid
        require(_rentMontlyPrice != 0, "INVALID_PRICE_PER_MONTH");
        require(_maxRentals != 0, "INVALID_MAX_RENTALS");
        require(_stakerFeePercent != 0 && _stakerFeePercent <= STAKER_MAX_FEE, "INVALID_MAX_RENTALS");
        require(address(_staker) != address(0), "INVALID_STAKER_CONTRACT");
        require(_tresuryAddress != address(0), "INVALID_TRESURY_ADDRESSS");

        rentMontlyPrice = _rentMontlyPrice;
        maxRentals = _maxRentals;
        stakerFeePercent = _stakerFeePercent;
        staker = _staker;
        tresury = _tresuryAddress;
    }

    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Allow the owner to pause the rent function
    function pauseRent() external onlyOwner {
        _pause();
    }

    /// @notice Allow the owner to unpause the rent function
    function unpauseRent() external onlyOwner {
        _unpause();
    }

    /*///////////////////////////////////////////////////////////////
                             FEE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner update the staker percentage
    /// @param user The authorized user who triggered the update
    /// @param newFeePercent The new staker fee percentage
    event StakerFeeUpdated(address indexed user, uint256 newFeePercent);

    /// @notice Sets a new fee percentage for the staker
    /// @param newFeePercent The new fee percentage.
    function setStakerFee(uint256 newFeePercent) external onlyOwner {
        require(newFeePercent != 0 && newFeePercent <= STAKER_MAX_FEE, "INVALID_MAX_RENTALS");
        stakerFeePercent = newFeePercent;

        emit StakerFeeUpdated(msg.sender, newFeePercent);
    }

    /*///////////////////////////////////////////////////////////////
                             RENT LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner update the max number of rentable rareblocks
    /// @param user The authorized user who triggered the update
    /// @param newMaxRentals The new max number of RareBlocks rentable
    event MaxRentalUpdated(address indexed user, uint256 newMaxRentals);

    /// @notice Emitted after the owner update the montly price of a rareblocks
    /// @param user The authorized user who triggered the update
    /// @param newRentMontlyPrice The price to rent a RareBlocks pass for 1 month
    event RentMonthPriceUpdated(address indexed user, uint256 newRentMontlyPrice);

    /// @notice Emitted after a user has rented a RareBlocks pass
    /// @param user The user who purchased the pass rental
    /// @param months The amount of month of the rental
    /// @param price The price paid to rent the pass
    event Rented(address indexed user, uint256 months, uint256 price);

    /// @notice Sets the max rentable pass
    /// @param newMaxRentals The new max number of RareBlocks rentable
    function setMaxRentals(uint256 newMaxRentals) external onlyOwner {
        maxRentals = newMaxRentals;

        emit MaxRentalUpdated(msg.sender, newMaxRentals);
    }

    /// @notice Sets a new montly price per rent
    /// @param newRentMontlyPrice The new rent montly price
    function setRentMontlyPrice(uint256 newRentMontlyPrice) external onlyOwner {
        require(newRentMontlyPrice != 0, "INVALID_PRICE");
        rentMontlyPrice = newRentMontlyPrice;

        emit RentMonthPriceUpdated(msg.sender, newRentMontlyPrice);
    }

    /// @notice Rent a RareBlock pass for a number of months
    /// @param months The amounth of months the user want to rent the pass
    /// @dev do we want to limit the amount of months the user can rent the pass for?
    function rent(uint256 months) external payable whenNotPaused {
        // Check that the user amount of months is valid
        require(months != 0, "INVALID_AMOUNT_OF_MONTHS");

        uint256 totalPrice = months * rentMontlyPrice;

        // check if the user has sent enough funds to rent the pass
        require(msg.value == totalPrice, "NOT_ENOUGH_FUNDS");

        // check if the user can rent a new pass
        require(amountRented + 1 <= maxRentals, "MAX_RENTALS_REACHED");

        // check that the user has not an active pass
        require(rents[msg.sender] < block.timestamp, "RENT_STILL_ACTIVE");

        // Update rentals
        amountRented += 1;
        rents[msg.sender] = block.timestamp + (31 days * months);

        // calc the current fees for the stakers
        uint256 stakersFee = (msg.value * stakerFeePercent) / STAKER_MAX_FEE;
        stakerBalance += stakersFee;

        // emit the event
        emit Rented(msg.sender, months, totalPrice);
    }

    /// @notice Check if a user has an active pass
    /// @return True if the user has an active pass and it has not expired yet
    function isRentActive() external view returns (bool) {
        return rents[msg.sender] > block.timestamp;
    }

    /*///////////////////////////////////////////////////////////////
                             TRESURY LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner pull the funds to the tresury address
    /// @param user The authorized user who triggered the withdraw
    /// @param tresury The tresury address to which the funds have been sent
    /// @param amount The amount withdrawn
    event TresuryWithdraw(address indexed user, address tresury, uint256 amount);

    /// @notice Emitted after the owner pull the funds to the tresury address
    /// @param user The authorized user who triggered the withdraw
    /// @param newTresury The new tresury address
    event TresuryUpdated(address indexed user, address newTresury);

    /// @notice Update the tresury address
    /// @param newTresury The new tresury address
    function setTresury(address newTresury) external onlyOwner {
        // check that the new tresury address is valid
        require(newTresury != address(0), "INVALID_TRESURY_ADDRESS");

        // update the tresury
        tresury = newTresury;

        // emit the event
        emit TresuryUpdated(msg.sender, newTresury);
    }

    /// @notice Withdraw funds from the contract to the tresury addresss
    function withdrawTresury() external onlyOwner {
        // calc the amount of balance that can be sent to the tresury
        uint256 amount = address(this).balance - stakerBalance;
        require(amount != 0, "NO_TRESURY");

        // emit the event
        emit TresuryWithdraw(msg.sender, tresury, amount);

        // Transfer to the tresury
        (bool success, ) = tresury.call{value: amount}("");
        require(success, "WITHDRAW_FAIL");
    }

    /*///////////////////////////////////////////////////////////////
                             STAKER LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner pull the funds to the staker contract
    /// @param user The authorized user who triggered the withdraw
    /// @param staker The staker contract address to which funds have been sent
    /// @param amount The amount withdrawn
    event StakerPayout(address indexed user, IStake staker, uint256 amount);

    /// @notice Emitted after the owner pull the funds to the staker address
    /// @param user The authorized user who triggered the withdraw
    /// @param newStaker The new staker address
    event StakerUpdated(address indexed user, address newStaker);

    /// @notice Update the staker address
    /// @param newStaker The new staker address
    function setStaker(IStake newStaker) external onlyOwner {
        // check that the new tresury address is valid
        require(address(newStaker) != address(0), "INVALID_STAKER_ADDRESS");

        // before updating the stakers reference call payout
        require(stakerBalance == 0, "STAKER_HAVE_PENDING_BALANCE");

        // update the tresury
        staker = newStaker;

        // emit the event
        emit StakerUpdated(msg.sender, address(newStaker));
    }

    /// @notice Withdraw funds from the contract to the staker addresss
    /// @dev everyone can call this function. Maybe there should be an incentive to this?
    function stakerPayout() external {
        // Get the staker balance
        uint256 amount = stakerBalance;
        require(amount != 0, "NO_STAKER_BALANCE");

        // update the staker balance
        stakerBalance = 0;

        // emit the event
        emit StakerPayout(msg.sender, staker, amount);

        // Transfer to the tresury
        (bool success, ) = address(staker).call{value: amount}("");
        require(success, "PAYOUT_FAIL");
    }
}
