// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GreenToken (GRT)
 * @notice ERC-20 token representing environmental impact credits.
 *         Minted by the platform (owner) as rewards for green actions.
 *         NOT a speculative cryptocurrency – it's an on-chain environmental
 *         impact certificate, similar to micro carbon credits.
 *
 * Reward Schedule:
 *   +10 GRT - Farmer lists byproduct (instead of burning)
 *   +5  GRT - Successful transaction (red point → green on map)
 *   +20 GRT - Collection event organized (with photo verification)
 *   +8  GRT - Buy byproduct & prove reuse
 */
contract GreenToken is ERC20, Ownable {
    // Action types for tracking
    string public constant ACTION_LIST_BYPRODUCT = "LIST_BYPRODUCT";
    string public constant ACTION_TRANSACTION_SUCCESS = "TRANSACTION_SUCCESS";
    string public constant ACTION_COLLECTION_EVENT = "COLLECTION_EVENT";
    string public constant ACTION_PROVE_REUSE = "PROVE_REUSE";

    // Reward amounts (in token units, 18 decimals)
    uint256 public constant REWARD_LIST_BYPRODUCT = 10 * 1e18;
    uint256 public constant REWARD_TRANSACTION_SUCCESS = 5 * 1e18;
    uint256 public constant REWARD_COLLECTION_EVENT = 20 * 1e18;
    uint256 public constant REWARD_PROVE_REUSE = 8 * 1e18;

    // Track minting events for transparency
    struct MintRecord {
        address recipient;
        uint256 amount;
        string action;
        string referenceId;
        uint256 timestamp;
    }

    MintRecord[] private _mintHistory;
    mapping(address => uint256) private _totalEarned;

    event GreenTokenMinted(
        address indexed recipient,
        uint256 amount,
        string action,
        string referenceId,
        uint256 timestamp
    );

    constructor() ERC20("Green Token", "GRT") Ownable(msg.sender) {}

    /**
     * @notice Mint GRT tokens as reward for a green action
     * @param to Recipient address
     * @param amount Amount to mint (with 18 decimals)
     * @param action Action type (e.g., LIST_BYPRODUCT)
     * @param referenceId Reference to the specific action (product ID, event ID, etc.)
     */
    function mintReward(
        address to,
        uint256 amount,
        string calldata action,
        string calldata referenceId
    ) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Amount must be > 0");

        _mint(to, amount);
        _totalEarned[to] += amount;

        _mintHistory.push(MintRecord({
            recipient: to,
            amount: amount,
            action: action,
            referenceId: referenceId,
            timestamp: block.timestamp
        }));

        emit GreenTokenMinted(to, amount, action, referenceId, block.timestamp);
    }

    /**
     * @notice Get total GRT ever earned by an address
     */
    function totalEarned(address account) external view returns (uint256) {
        return _totalEarned[account];
    }

    /**
     * @notice Get the total number of mint records
     */
    function mintHistoryCount() external view returns (uint256) {
        return _mintHistory.length;
    }

    /**
     * @notice Get a specific mint record
     */
    function getMintRecord(uint256 index)
        external
        view
        returns (
            address recipient,
            uint256 amount,
            string memory action,
            string memory referenceId,
            uint256 timestamp
        )
    {
        require(index < _mintHistory.length, "Index out of bounds");
        MintRecord storage record = _mintHistory[index];
        return (
            record.recipient,
            record.amount,
            record.action,
            record.referenceId,
            record.timestamp
        );
    }
}
