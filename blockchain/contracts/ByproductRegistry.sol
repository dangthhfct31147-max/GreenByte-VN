// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ByproductRegistry
 * @notice Immutable on-chain registry for agricultural byproduct records.
 *         Each record stores metadata hash (IPFS CID), origin, GPS, category,
 *         weight, and harvest date. Records cannot be modified or deleted.
 */
contract ByproductRegistry is Ownable {
    struct ByproductRecord {
        string productId;
        string ipfsHash;
        string origin;
        string gpsLocation;
        string category;
        uint256 weightKg;
        uint256 harvestDate;
        address registeredBy;
        uint256 timestamp;
        bool exists;
    }

    // productId => record
    mapping(string => ByproductRecord) private _records;
    // owner address => list of productIds
    mapping(address => string[]) private _ownerRecords;
    // total count
    uint256 public totalRecords;

    event ByproductRegistered(
        string indexed productIdHash,
        string productId,
        string ipfsHash,
        string origin,
        string category,
        uint256 weightKg,
        uint256 harvestDate,
        address registeredBy,
        uint256 timestamp
    );

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Register a new byproduct record on-chain
     * @dev Only the contract owner (backend wallet) can call this
     */
    function registerByproduct(
        string calldata productId,
        string calldata ipfsHash,
        string calldata origin,
        string calldata gpsLocation,
        string calldata category,
        uint256 weightKg,
        uint256 harvestDate
    ) external onlyOwner {
        require(bytes(productId).length > 0, "Product ID required");
        require(bytes(ipfsHash).length > 0, "IPFS hash required");
        require(!_records[productId].exists, "Record already exists");

        ByproductRecord memory record = ByproductRecord({
            productId: productId,
            ipfsHash: ipfsHash,
            origin: origin,
            gpsLocation: gpsLocation,
            category: category,
            weightKg: weightKg,
            harvestDate: harvestDate,
            registeredBy: msg.sender,
            timestamp: block.timestamp,
            exists: true
        });

        _records[productId] = record;
        _ownerRecords[msg.sender].push(productId);
        totalRecords++;

        emit ByproductRegistered(
            productId,
            productId,
            ipfsHash,
            origin,
            category,
            weightKg,
            harvestDate,
            msg.sender,
            block.timestamp
        );
    }

    /**
     * @notice Get a byproduct record by product ID
     */
    function getRecord(string calldata productId)
        external
        view
        returns (
            string memory ipfsHash,
            string memory origin,
            string memory gpsLocation,
            string memory category,
            uint256 weightKg,
            uint256 harvestDate,
            address registeredBy,
            uint256 timestamp
        )
    {
        ByproductRecord storage record = _records[productId];
        require(record.exists, "Record not found");

        return (
            record.ipfsHash,
            record.origin,
            record.gpsLocation,
            record.category,
            record.weightKg,
            record.harvestDate,
            record.registeredBy,
            record.timestamp
        );
    }

    /**
     * @notice Check if a record exists for a product ID
     */
    function recordExists(string calldata productId) external view returns (bool) {
        return _records[productId].exists;
    }

    /**
     * @notice Get all product IDs registered by an address
     */
    function getRecordsByOwner(address owner) external view returns (string[] memory) {
        return _ownerRecords[owner];
    }
}
