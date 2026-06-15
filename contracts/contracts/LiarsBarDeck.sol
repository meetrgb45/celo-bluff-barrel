// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title LiarsBarDeck
 * @notice Commit-reveal card privacy. No FHE — cards are dealt privately by the WS
 *         server and committed on-chain as keccak256(cardValues, salt) hashes.
 *
 * Card values: 0=Ace, 1=King, 2=Queen, 3=Joker
 * Deck per player count:
 *   2p → 10 cards (3A,3K,3Q,1J)
 *   3p → 15 cards (5A,5K,4Q,1J)
 *   4p → 20 cards (6A,6K,6Q,2J)
 *
 * Commitment: keccak256(abi.encodePacked(uint8[5] cardValues, bytes32 salt))
 */
contract LiarsBarDeck {
    uint8 public constant HAND_SIZE = 5;
    uint8 public constant JOKER = 3;

    // gameRoundId = gameId * 1000 + round
    // gameRoundId => player => commitment hash (0 = not committed yet)
    mapping(uint256 => mapping(address => bytes32)) public handCommitment;
    // gameRoundId => player => card index => played face-down
    mapping(uint256 => mapping(address => mapping(uint8 => bool))) public cardPlayed;

    address public gameContract;

    modifier onlyGame() {
        require(msg.sender == gameContract, "Only game");
        _;
    }

    constructor(address _gameContract) {
        gameContract = _gameContract;
    }

    function setGameContract(address _gameContract) external {
        require(gameContract == address(0) || gameContract == msg.sender, "Unauthorized");
        gameContract = _gameContract;
    }

    // ── Called by player after receiving hand from WS server ─────────────

    /**
     * @notice Commit hand hash. Player calls this immediately after receiving
     *         cards from the WS server.
     * @param gameRoundId  gameId * 1000 + round
     * @param commitment   keccak256(abi.encodePacked(cardValues, salt))
     *                     where cardValues is uint8[5] and salt is bytes32
     */
    function commitHand(uint256 gameRoundId, bytes32 commitment) external {
        require(handCommitment[gameRoundId][msg.sender] == bytes32(0), "Already committed");
        require(commitment != bytes32(0), "Empty commitment");
        handCommitment[gameRoundId][msg.sender] = commitment;
    }

    // ── Called by game contract ───────────────────────────────────────────

    /**
     * @notice Mark card indices as played face-down (no reveal yet).
     */
    function markCardsPlayed(
        uint256 gameRoundId,
        address player,
        uint8[] calldata indices
    ) external onlyGame {
        for (uint8 i = 0; i < indices.length; i++) {
            require(indices[i] < HAND_SIZE, "Bad index");
            require(!cardPlayed[gameRoundId][player][indices[i]], "Already played");
            cardPlayed[gameRoundId][player][indices[i]] = true;
        }
    }

    /**
     * @notice Verify that the accused's played cards are all valid (match target or Joker).
     *         Called synchronously during challenge resolution.
     * @param gameRoundId  gameId * 1000 + round
     * @param player       accused player
     * @param indices      which card slots were played (0-4)
     * @param cardValues   full 5-card hand revealed by accused
     * @param salt         salt used in the commitment
     * @param targetCard   round target (0=Ace,1=King,2=Queen)
     * @return lieConfirmed  true if any played card is NOT target AND NOT Joker
     */
    function verifyClaim(
        uint256 gameRoundId,
        address player,
        uint8[] calldata indices,
        uint8[5] calldata cardValues,
        bytes32 salt,
        uint8 targetCard
    ) external view onlyGame returns (bool lieConfirmed) {
        // Verify commitment — must unpack array individually because
        // abi.encodePacked(uint8[5]) pads each element to 32 bytes,
        // but abi.encodePacked(uint8, uint8, ...) gives tight 1-byte packing.
        bytes32 expected = keccak256(abi.encodePacked(
            cardValues[0], cardValues[1], cardValues[2], cardValues[3], cardValues[4], salt
        ));
        require(expected == handCommitment[gameRoundId][player], "Bad reveal");

        // Check each played card
        for (uint8 i = 0; i < indices.length; i++) {
            uint8 val = cardValues[indices[i]];
            if (val != targetCard && val != JOKER) {
                lieConfirmed = true;
                break;
            }
        }
    }

    // ── View ──────────────────────────────────────────────────────────────

    function remainingCards(uint256 gameRoundId, address player) external view returns (uint8 count) {
        for (uint8 i = 0; i < HAND_SIZE; i++) {
            if (!cardPlayed[gameRoundId][player][i]) count++;
        }
    }

    function hasCommitted(uint256 gameRoundId, address player) external view returns (bool) {
        return handCommitment[gameRoundId][player] != bytes32(0);
    }
}
