// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/ILiarsBarGame.sol";

/**
 * @title LiarsBarRevolver
 * @notice Commit-reveal 6-chamber revolver. Bullet position is committed by the
 *         WS server at game start; revealed only when the spin fires or survives.
 *
 * Trust model: WS server knows bullet position. Server compromise → unfair games
 * but NOT loss of funds (USDC held in LiarsBarGame). Upgrade path: Chainlink VRF.
 *
 * Per-player state — each player has their own revolver for the whole game.
 * Chamber pointer starts at 0 and increments on each spin. After 5 clicks,
 * the 6th spin is guaranteed to fire.
 */
contract LiarsBarRevolver is ILiarsBarGame {
    uint8 public constant CHAMBERS = 6;

    // gameId => player => bullet commitment  keccak256(abi.encodePacked(uint8 pos, bytes32 salt))
    mapping(uint256 => mapping(address => bytes32)) public bulletCommitment;
    // gameId => player => current chamber pointer (0=not spun yet, 1-6=spun N times)
    mapping(uint256 => mapping(address => uint8)) public chamberPointer;
    // gameId => player => double-spin pending (second spin still outstanding)
    mapping(uint256 => mapping(address => bool)) public pendingDoubleSpin;

    address public gameContract;
    address public owner;

    modifier onlyGame() {
        require(msg.sender == gameContract, "Only game");
        _;
    }

    modifier onlyOwnerOrGame() {
        require(msg.sender == owner || msg.sender == gameContract, "Unauthorized");
        _;
    }

    constructor(address _gameContract) {
        owner = msg.sender;
        gameContract = _gameContract;
    }

    function setGameContract(address _gameContract) external onlyOwnerOrGame {
        gameContract = _gameContract;
    }

    // ── WS server calls this at game start ────────────────────────────────

    /**
     * @notice Commit bullet position for a player. Called by WS server wallet.
     *         commitment = keccak256(abi.encodePacked(uint8 position, bytes32 salt))
     *         where position ∈ [1,6]
     */
    function commitBullet(
        uint256 gameId,
        address player,
        bytes32 commitment
    ) external onlyOwnerOrGame {
        require(bulletCommitment[gameId][player] == bytes32(0), "Already committed");
        require(commitment != bytes32(0), "Empty commitment");
        bulletCommitment[gameId][player] = commitment;
    }

    // ── Called by game contract when a spin is triggered ─────────────────

    /**
     * @notice Advance chamber pointer. Game moves to Spinning state.
     *         WS server will call resolveSpin() after this.
     */
    function beginSpin(uint256 gameId, address player) external view onlyGame {
        require(chamberPointer[gameId][player] < CHAMBERS, "Revolver exhausted");
        require(bulletCommitment[gameId][player] != bytes32(0), "Bullet not committed");
    }

    /**
     * @notice Begin double spin — game marks pending, server resolves twice.
     */
    function beginDoubleSpin(uint256 gameId, address player) external onlyGame {
        require(chamberPointer[gameId][player] + 1 < CHAMBERS, "Not enough chambers");
        require(bulletCommitment[gameId][player] != bytes32(0), "Bullet not committed");
        pendingDoubleSpin[gameId][player] = true;
    }

    // ── WS server resolves the spin ───────────────────────────────────────

    /**
     * @notice Reveal bullet position and resolve spin.
     *         WS server calls this after SpinTriggered event.
     * @param position  bullet position [1-6] as committed
     * @param salt      salt used in the commitment
     * @return fired    true if this chamber contains the bullet
     */
    function resolveSpin(
        uint256 gameId,
        address player,
        uint8 position,
        bytes32 salt
    ) external onlyOwnerOrGame returns (bool fired) {
        require(position >= 1 && position <= CHAMBERS, "Invalid position");
        bytes32 expected = keccak256(abi.encodePacked(position, salt));
        require(expected == bulletCommitment[gameId][player], "Bad bullet reveal");
        require(chamberPointer[gameId][player] < CHAMBERS, "Revolver exhausted");

        chamberPointer[gameId][player]++;
        fired = (chamberPointer[gameId][player] == position);

        emit SpinResolved(gameId, player, fired);
    }

    /**
     * @notice Resolve the second spin of a double-spin sequence.
     *         Only valid if pendingDoubleSpin is set.
     */
    function resolveDoubleSpin(
        uint256 gameId,
        address player,
        uint8 position,
        bytes32 salt
    ) external onlyOwnerOrGame returns (bool fired) {
        require(pendingDoubleSpin[gameId][player], "No double spin pending");
        require(position >= 1 && position <= CHAMBERS, "Invalid position");
        bytes32 expected = keccak256(abi.encodePacked(position, salt));
        require(expected == bulletCommitment[gameId][player], "Bad bullet reveal");
        require(chamberPointer[gameId][player] < CHAMBERS, "Revolver exhausted");

        pendingDoubleSpin[gameId][player] = false;
        chamberPointer[gameId][player]++;
        fired = (chamberPointer[gameId][player] == position);

        emit SpinResolved(gameId, player, fired);
    }

    // ── View ──────────────────────────────────────────────────────────────

    function getChamberPointer(uint256 gameId, address player) external view returns (uint8) {
        return chamberPointer[gameId][player];
    }

    function isBulletCommitted(uint256 gameId, address player) external view returns (bool) {
        return bulletCommitment[gameId][player] != bytes32(0);
    }
}
