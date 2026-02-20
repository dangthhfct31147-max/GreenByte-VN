// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title EscrowPayment
 * @notice Escrow smart contract for marketplace transactions.
 *         Buyer deposits funds → both parties confirm delivery → auto-release.
 *         Disputes are resolved by the contract owner (arbitrator).
 */
contract EscrowPayment is Ownable, ReentrancyGuard {
    enum EscrowStatus {
        CREATED,
        FUNDED,
        DELIVERED,
        COMPLETED,
        DISPUTED,
        REFUNDED
    }

    struct Escrow {
        string dealId;
        address buyer;
        address seller;
        uint256 amount;
        EscrowStatus status;
        uint256 createdAt;
        uint256 completedAt;
        bool exists;
    }

    // dealId => escrow
    mapping(string => Escrow) private _escrows;
    uint256 public totalEscrows;

    // Platform fee (basis points, e.g., 100 = 1%)
    uint256 public platformFeeBps = 100;

    event EscrowCreated(string indexed dealIdHash, string dealId, address buyer, address seller, uint256 amount);
    event EscrowFunded(string indexed dealIdHash, string dealId, uint256 amount);
    event DeliveryConfirmed(string indexed dealIdHash, string dealId, address confirmedBy);
    event EscrowCompleted(string indexed dealIdHash, string dealId, uint256 sellerAmount, uint256 feeAmount);
    event DisputeRaised(string indexed dealIdHash, string dealId, address raisedBy);
    event DisputeResolved(string indexed dealIdHash, string dealId, bool refundedToBuyer);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Create and fund an escrow for a deal
     * @param dealId Unique deal identifier (from database)
     * @param seller Address of the seller
     */
    function createEscrow(
        string calldata dealId,
        address seller
    ) external payable nonReentrant {
        require(bytes(dealId).length > 0, "Deal ID required");
        require(!_escrows[dealId].exists, "Escrow already exists");
        require(seller != address(0), "Invalid seller address");
        require(seller != msg.sender, "Cannot escrow with yourself");
        require(msg.value > 0, "Must send funds");

        _escrows[dealId] = Escrow({
            dealId: dealId,
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            status: EscrowStatus.FUNDED,
            createdAt: block.timestamp,
            completedAt: 0,
            exists: true
        });

        totalEscrows++;

        emit EscrowCreated(dealId, dealId, msg.sender, seller, msg.value);
        emit EscrowFunded(dealId, dealId, msg.value);
    }

    /**
     * @notice Buyer confirms delivery and releases funds to seller
     * @param dealId The deal identifier
     */
    function confirmDelivery(string calldata dealId) external nonReentrant {
        Escrow storage escrow = _escrows[dealId];
        require(escrow.exists, "Escrow not found");
        require(escrow.status == EscrowStatus.FUNDED, "Invalid escrow status");
        require(msg.sender == escrow.buyer, "Only buyer can confirm");

        uint256 fee = (escrow.amount * platformFeeBps) / 10000;
        uint256 sellerAmount = escrow.amount - fee;

        escrow.status = EscrowStatus.COMPLETED;
        escrow.completedAt = block.timestamp;

        // Transfer to seller
        (bool sellerSuccess, ) = payable(escrow.seller).call{value: sellerAmount}("");
        require(sellerSuccess, "Seller transfer failed");

        // Transfer fee to platform
        if (fee > 0) {
            (bool feeSuccess, ) = payable(owner()).call{value: fee}("");
            require(feeSuccess, "Fee transfer failed");
        }

        emit DeliveryConfirmed(dealId, dealId, msg.sender);
        emit EscrowCompleted(dealId, dealId, sellerAmount, fee);
    }

    /**
     * @notice Raise a dispute (by buyer or seller)
     * @param dealId The deal identifier
     */
    function raiseDispute(string calldata dealId) external {
        Escrow storage escrow = _escrows[dealId];
        require(escrow.exists, "Escrow not found");
        require(escrow.status == EscrowStatus.FUNDED, "Invalid escrow status");
        require(
            msg.sender == escrow.buyer || msg.sender == escrow.seller,
            "Only buyer or seller"
        );

        escrow.status = EscrowStatus.DISPUTED;
        emit DisputeRaised(dealId, dealId, msg.sender);
    }

    /**
     * @notice Resolve a dispute (only arbitrator/owner)
     * @param dealId The deal identifier
     * @param refundToBuyer True = refund buyer, False = release to seller
     */
    function resolveDispute(string calldata dealId, bool refundToBuyer)
        external
        onlyOwner
        nonReentrant
    {
        Escrow storage escrow = _escrows[dealId];
        require(escrow.exists, "Escrow not found");
        require(escrow.status == EscrowStatus.DISPUTED, "Not in dispute");

        escrow.completedAt = block.timestamp;

        if (refundToBuyer) {
            escrow.status = EscrowStatus.REFUNDED;
            (bool success, ) = payable(escrow.buyer).call{value: escrow.amount}("");
            require(success, "Refund failed");
        } else {
            uint256 fee = (escrow.amount * platformFeeBps) / 10000;
            uint256 sellerAmount = escrow.amount - fee;

            escrow.status = EscrowStatus.COMPLETED;

            (bool sellerSuccess, ) = payable(escrow.seller).call{value: sellerAmount}("");
            require(sellerSuccess, "Seller transfer failed");

            if (fee > 0) {
                (bool feeSuccess, ) = payable(owner()).call{value: fee}("");
                require(feeSuccess, "Fee transfer failed");
            }
        }

        emit DisputeResolved(dealId, dealId, refundToBuyer);
    }

    /**
     * @notice Get escrow details
     */
    function getEscrow(string calldata dealId)
        external
        view
        returns (
            address buyer,
            address seller,
            uint256 amount,
            EscrowStatus status,
            uint256 createdAt,
            uint256 completedAt
        )
    {
        Escrow storage escrow = _escrows[dealId];
        require(escrow.exists, "Escrow not found");
        return (
            escrow.buyer,
            escrow.seller,
            escrow.amount,
            escrow.status,
            escrow.createdAt,
            escrow.completedAt
        );
    }

    /**
     * @notice Update platform fee (only owner)
     */
    function setPlatformFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 500, "Fee too high (max 5%)");
        platformFeeBps = newFeeBps;
    }
}
