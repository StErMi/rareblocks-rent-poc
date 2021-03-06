// SPDX-License-Identifier: MIT
pragma solidity =0.8.7;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/Pausable.sol";

import "./interfaces/IRareBlocksSubscription.sol";

/// @title RareBlocksSubscription contract
/// @author poster & SterMi
/// @notice Manage RareBlocks subscription for an amount of months
contract RareBlocksSubscription is IRareBlocksSubscription, Ownable, Pausable {
    /*///////////////////////////////////////////////////////////////
                             STORAGE VARIABLES
    //////////////////////////////////////////////////////////////*/

    /// @notice Max staking fee
    /// @dev 0 = 0%, 5000 = 50%, 10000 = 100%
    uint256 public constant STAKING_MAX_FEE = 10_000;

    /// @notice Subscription price per month
    uint256 public subscriptionMonthlyPrice;

    /// @notice max amount of RareBlocks subscriptions
    uint256 public maxSubscriptions;

    /// @notice Number of pass currently subscribed
    uint256 public subscriptionCount;

    /// @notice map of subscriptions made by users that store the expire time for a subscription
    mapping(address => uint256) public subscriptions;

    /// @notice RareBlocksStaking fee profit percent
    uint256 public stakingFeePercent;

    /// @notice RareBlocksStaking contract
    address public rareBlocksStaking;

    /// @notice balance of fees that must be sent to the RareBlocksStaking contract
    uint256 public override stakingBalance;

    /// @notice Treasury contract address
    address public treasury;

    /*///////////////////////////////////////////////////////////////
                             CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/

    constructor(
        uint256 _subscriptionMonthlyPrice,
        uint256 _maxSubscriptions,
        uint256 _stakingFeePercent,
        address _rareBlocksStaking,
        address _treasuryAddress
    ) Ownable() {
        // check that all the parameters are valid
        require(_subscriptionMonthlyPrice != 0, "INVALID_PRICE_PER_MONTH");
        require(_maxSubscriptions != 0, "INVALID_MAX_SUBSCRIPTIONS");
        require(_stakingFeePercent != 0 && _stakingFeePercent <= STAKING_MAX_FEE, "INVALID_STAKING_FEE");
        require(_rareBlocksStaking != address(0), "INVALID_STAKING_CONTRACT");
        require(_treasuryAddress != address(0), "INVALID_TREASURY_ADDRESSS");

        subscriptionMonthlyPrice = _subscriptionMonthlyPrice;
        maxSubscriptions = _maxSubscriptions;
        stakingFeePercent = _stakingFeePercent;
        rareBlocksStaking = _rareBlocksStaking;
        treasury = _treasuryAddress;
    }

    /*///////////////////////////////////////////////////////////////
                             PAUSE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @inheritdoc IRareBlocksSubscription
    function pause() external override onlyOwner {
        _pause();
    }

    /// @inheritdoc IRareBlocksSubscription
    function unpause() external override onlyOwner {
        _unpause();
    }

    /*///////////////////////////////////////////////////////////////
                             FEE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner update the staking fee percentage
    /// @param user The authorized user who triggered the update
    /// @param newFeePercent The new staking fee percentage
    event StakingFeeUpdated(address indexed user, uint256 newFeePercent);

    /// @inheritdoc IRareBlocksSubscription
    function setStakingFee(uint256 newFeePercent) external override onlyOwner {
        require(newFeePercent != 0 && newFeePercent <= STAKING_MAX_FEE, "INVALID_STAKING_FEE");
        require(stakingFeePercent != newFeePercent, "SAME_FEE");

        stakingFeePercent = newFeePercent;

        emit StakingFeeUpdated(msg.sender, newFeePercent);
    }

    /*///////////////////////////////////////////////////////////////
                             SUBSCRIPTION LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner update the max number of RareBlocks subscriptions
    /// @param user The authorized user who triggered the update
    /// @param newMaxSubscriptions The new max number of RareBlocks subscriptions
    event MaxSubscriptionsUpdated(address indexed user, uint256 newMaxSubscriptions);

    /// @notice Emitted after the owner update the monthly price of a rareblocks
    /// @param user The authorized user who triggered the update
    /// @param newSubscriptionMonthlyPrice The price to subscribe to a RareBlocks pass for 1 month
    event SubscriptionMonthPriceUpdated(address indexed user, uint256 newSubscriptionMonthlyPrice);

    /// @notice Emitted after a user has subscribed to a RareBlocks pass
    /// @param user The user who purchased the pass subscription
    /// @param months The amount of month of the subscription
    /// @param price The price paid to subscribe to the pass
    event Subscribed(address indexed user, uint256 months, uint256 price);

    /// @inheritdoc IRareBlocksSubscription
    function setMaxSubscriptions(uint256 newMaxSubscriptions) external override onlyOwner {
        require(newMaxSubscriptions != maxSubscriptions, "SAME_MAX_SUBSCRIPTIONS");
        maxSubscriptions = newMaxSubscriptions;

        emit MaxSubscriptionsUpdated(msg.sender, newMaxSubscriptions);
    }

    /// @inheritdoc IRareBlocksSubscription
    function setSubscriptionMonthlyPrice(uint256 newSubscriptionMonthlyPrice) external override onlyOwner {
        require(newSubscriptionMonthlyPrice != 0, "INVALID_PRICE");
        require(subscriptionMonthlyPrice != newSubscriptionMonthlyPrice, "SAME_PRICE");

        subscriptionMonthlyPrice = newSubscriptionMonthlyPrice;

        emit SubscriptionMonthPriceUpdated(msg.sender, newSubscriptionMonthlyPrice);
    }

    /// @inheritdoc IRareBlocksSubscription
    function subscribe(uint256 months) external payable override whenNotPaused {
        // Check that the user amount of months is valid
        require(months != 0 && months <= 12, "INVALID_AMOUNT_OF_MONTHS");

        uint256 totalPrice = months * subscriptionMonthlyPrice;

        // check if the user has sent enough funds to subscribe to the pass
        require(msg.value == totalPrice, "NOT_ENOUGH_FUNDS");

        // check if the user can subscribe to a new pass
        require(subscriptionCount + 1 <= maxSubscriptions, "MAX_SUBSCRIPTIONS_REACHED");

        // check that the user has not an active pass
        require(subscriptions[msg.sender] < block.timestamp, "SUBSCRIPTION_STILL_ACTIVE");

        // Update subscriptions
        subscriptionCount += 1;
        subscriptions[msg.sender] = block.timestamp + (31 days * months);

        // calc the current fees for the RareBlocksStaking
        uint256 stakingFeeAmount = (msg.value * stakingFeePercent) / STAKING_MAX_FEE;
        stakingBalance += stakingFeeAmount;

        // emit the event
        emit Subscribed(msg.sender, months, totalPrice);
    }

    /// @inheritdoc IRareBlocksSubscription
    function isSubscriptionActive() external view override returns (bool) {
        return subscriptions[msg.sender] > block.timestamp;
    }

    /*///////////////////////////////////////////////////////////////
                             TREASURY LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner pull the funds to the treasury address
    /// @param user The authorized user who triggered the withdraw
    /// @param treasury The treasury address to which the funds have been sent
    /// @param amount The amount withdrawn
    event TreasuryWithdraw(address indexed user, address treasury, uint256 amount);

    /// @notice Emitted after the owner pull the funds to the treasury address
    /// @param user The authorized user who triggered the withdraw
    /// @param newTreasury The new treasury address
    event TreasuryUpdated(address indexed user, address newTreasury);

    /// @inheritdoc IRareBlocksSubscription
    function setTreasury(address newTreasury) external override onlyOwner {
        // check that the new treasury address is valid
        require(newTreasury != address(0), "INVALID_TREASURY_ADDRESS");
        require(treasury != newTreasury, "SAME_TREASURY_ADDRESS");

        // update the treasury
        treasury = newTreasury;

        // emit the event
        emit TreasuryUpdated(msg.sender, newTreasury);
    }

    /// @inheritdoc IRareBlocksSubscription
    function withdrawTreasury() external override onlyOwner {
        // calc the amount of balance that can be sent to the treasury
        uint256 amount = address(this).balance - stakingBalance;
        require(amount != 0, "NO_TREASURY");

        // emit the event
        emit TreasuryWithdraw(msg.sender, treasury, amount);

        // Transfer to the treasury
        (bool success, ) = treasury.call{value: amount}("");
        require(success, "WITHDRAW_FAIL");
    }

    /*///////////////////////////////////////////////////////////////
                             STAKING PAYOUT/BALANCE LOGIC
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after the owner pull the funds to the RareBlocksStaking contract
    /// @param user The authorized user who triggered the withdraw
    /// @param rareBlocksStaking The RareBlocksStaking contract address to which funds have been sent
    /// @param amount The amount withdrawn
    event StakingPayoutSent(address indexed user, address rareBlocksStaking, uint256 amount);

    /// @notice Emitted after the owner pull the funds to the RareBlocksStaking address
    /// @param user The authorized user who triggered the withdraw
    /// @param newRareBlocksStaking The new RareBlocksStaking address
    event RareBlocksStakingUpdated(address indexed user, address newRareBlocksStaking);

    /// @inheritdoc IRareBlocksSubscription
    function setRareBlocksStaking(address newRareBlocksStaking) external override onlyOwner {
        // check that the new treasury address is valid
        require(newRareBlocksStaking != address(0), "INVALID_STAKING_ADDRESS");
        require(rareBlocksStaking != newRareBlocksStaking, "SAME_STAKING_ADDRESS");

        // before updating the RareBlocksStaking reference call payout
        require(stakingBalance == 0, "PREV_STAKING_HAVE_PENDING_BALANCE");

        // update the treasury
        rareBlocksStaking = newRareBlocksStaking;

        // emit the event
        emit RareBlocksStakingUpdated(msg.sender, newRareBlocksStaking);
    }

    /// @inheritdoc IRareBlocksSubscription
    function sendStakingPayout() external override onlyOwner {
        // Get the RareBlocksStaking balance
        uint256 amount = stakingBalance;
        require(amount != 0, "NO_STAKING_BALANCE");

        // update the staking balance
        stakingBalance = 0;

        // emit the event
        emit StakingPayoutSent(msg.sender, rareBlocksStaking, amount);

        // Transfer to the treasury
        (bool success, ) = rareBlocksStaking.call{value: amount}("");
        require(success, "PAYOUT_FAIL");
    }
}
