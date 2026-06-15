// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./interfaces/ILiarsBarGame.sol";
import "./LiarsBarDeck.sol";
import "./LiarsBarRevolver.sol";

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
}

/**
 * @title LiarsBarGame — Basic Mode on Celo Sepolia
 *
 * Replaces FHE with commit-reveal:
 *  - Cards: WS server deals privately; players commitHand() on-chain.
 *  - Challenge: accused reveals full hand via revealChallenge(); verified synchronously.
 *  - Bullet: WS server commitBullet(); resolves via revolver.resolveSpin() after spin.
 *
 * Player count: min 2, max 4.
 *
 * Game flow:
 *   1. createGame → joinGame (1-3 more) → startGame (host, min 2 players)
 *   2. WS server: commits bullets, deals cards, players commitHand()
 *   3. Each turn: playCards OR callLiar OR useExecute
 *   4. callLiar → accused calls revealChallenge(60s) → ChallengeResolved → Spinning
 *   5. WS server calls revolver.resolveSpin() → SpinResolved → eliminate or new round
 *   6. Last player alive wins; USDC pot distributed (5% fee)
 */
contract LiarsBarGame is ILiarsBarGame {
    uint8 public constant MIN_PLAYERS = 2;
    uint8 public constant MAX_PLAYERS = 4;
    uint256 public constant TURN_TIMEOUT = 90;   // seconds
    uint256 public constant COMMIT_TIMEOUT = 30;  // seconds to commitHand after round start
    uint256 public constant FEE_BPS = 500;        // 5%

    struct Player {
        address addr;
        bool alive;
        uint8 points;
        bool hasUsedExecute;
        bool hasUsedDoubleSpin;
        uint8 characterId;
    }

    struct Game {
        GameState state;
        uint8 round;
        uint8 playerCount;      // fixed at startGame
        uint8 targetCard;       // 0=Ace, 1=King, 2=Queen
        uint8 currentTurnIndex;
        uint8 aliveCount;
        Player[MAX_PLAYERS] players;
        // Last claim
        address lastClaimant;
        uint8 lastClaimCount;
        uint8[] lastPlayedIndices;
        // Pending spin
        address pendingSpinner;
        bool pendingIsDoubleSpin;
        address winner;
        // Turn timer
        uint256 turnDeadline;
        // Stake
        uint256 stakeAmount;    // USDC per player (0 = free)
    }

    mapping(uint256 => Game) public games;
    uint256 public nextGameId;

    LiarsBarDeck public deck;
    LiarsBarRevolver public revolver;
    IERC20 public usdc;
    address public treasury;

    constructor(address _deck, address _revolver, address _usdc, address _treasury) {
        deck = LiarsBarDeck(_deck);
        revolver = LiarsBarRevolver(_revolver);
        usdc = IERC20(_usdc);
        treasury = _treasury;
    }

    // ── Lobby ─────────────────────────────────────────────────────────────

    function createGame(uint8 characterId, uint256 stakeAmount) external returns (uint256 gameId) {
        gameId = nextGameId++;
        Game storage g = games[gameId];
        g.state = GameState.WaitingForPlayers;
        g.players[0] = Player(msg.sender, true, 0, false, false, characterId);
        g.aliveCount = 1;
        g.stakeAmount = stakeAmount;
        if (stakeAmount > 0) {
            require(usdc.transferFrom(msg.sender, address(this), stakeAmount), "USDC failed");
        }
        emit GameCreated(gameId, msg.sender);
        emit PlayerJoined(gameId, msg.sender, 0);
    }

    function joinGame(uint256 gameId, uint8 characterId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.WaitingForPlayers) revert NotInCorrectPhase();

        uint8 idx = _playerCount(g);
        if (idx >= MAX_PLAYERS) revert GameFull();

        for (uint8 i = 0; i < idx; i++) {
            if (g.players[i].addr == msg.sender) revert AlreadyJoined();
        }

        g.players[idx] = Player(msg.sender, true, 0, false, false, characterId);
        g.aliveCount++;
        if (g.stakeAmount > 0) {
            require(usdc.transferFrom(msg.sender, address(this), g.stakeAmount), "USDC failed");
        }
        emit PlayerJoined(gameId, msg.sender, idx);
    }

    /**
     * @notice Host starts the game. Requires at least MIN_PLAYERS.
     *         After this, WS server commits bullets and deals cards.
     *         Players must call deck.commitHand() before their first turn.
     */
    function startGame(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.WaitingForPlayers) revert NotInCorrectPhase();
        uint8 count = _playerCount(g);
        if (count < MIN_PLAYERS) revert NotEnoughPlayers();
        require(msg.sender == g.players[0].addr, "Only host");

        g.playerCount = count;
        g.aliveCount = count;
        g.state = GameState.PlayerTurn;

        emit GameStarted(gameId);
        _startRound(gameId);
    }

    // ── Gameplay ──────────────────────────────────────────────────────────

    /**
     * @notice Play 1-3 cards face-down, claiming they are the target card.
     *         Player must have committed their hand this round first.
     */
    function playCards(uint256 gameId, uint8[] calldata cardIndices) external {
        Game storage g = games[gameId];
        if (g.state != GameState.PlayerTurn) revert NotInCorrectPhase();
        if (msg.sender != g.players[g.currentTurnIndex].addr) revert NotYourTurn();
        if (cardIndices.length < 1 || cardIndices.length > 3) revert InvalidCardCount();

        uint256 gameRoundId = _gameRoundId(gameId, g.round);
        require(deck.hasCommitted(gameRoundId, msg.sender), "Must commit hand first");

        deck.markCardsPlayed(gameRoundId, msg.sender, cardIndices);

        g.lastClaimant = msg.sender;
        g.lastClaimCount = uint8(cardIndices.length);
        g.lastPlayedIndices = cardIndices;

        _addPoints(gameId, g.currentTurnIndex, uint8(cardIndices.length));
        emit CardsPlayed(gameId, msg.sender, uint8(cardIndices.length));

        _advanceTurn(gameId);
    }

    /**
     * @notice Challenge the previous player's claim.
     *         Transitions to Challenging; accused has TURN_TIMEOUT to reveal.
     */
    function callLiar(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.PlayerTurn) revert NotInCorrectPhase();
        if (msg.sender != g.players[g.currentTurnIndex].addr) revert NotYourTurn();
        if (g.lastClaimant == address(0)) revert NothingToChallenge();
        if (msg.sender == g.lastClaimant) revert CannotChallengeSelf();

        g.state = GameState.Challenging;
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        emit LiarCalled(gameId, msg.sender, g.lastClaimant);
    }

    /**
     * @notice Accused reveals their full hand to resolve the challenge.
     *         Contract verifies commitment, then checks played cards against target.
     * @param cardValues  Full 5-card hand (all 5 values, even unplayed ones)
     * @param salt        Salt used when committing the hand
     */
    function revealChallenge(
        uint256 gameId,
        uint8[5] calldata cardValues,
        bytes32 salt
    ) external {
        Game storage g = games[gameId];
        if (g.state != GameState.Challenging) revert NotInCorrectPhase();
        require(msg.sender == g.lastClaimant, "Only accused");

        uint256 gameRoundId = _gameRoundId(gameId, g.round);
        bool lieConfirmed = deck.verifyClaim(
            gameRoundId,
            msg.sender,
            g.lastPlayedIndices,
            cardValues,
            salt,
            g.targetCard
        );

        address accuser = g.players[g.currentTurnIndex].addr;
        address accused = g.lastClaimant;

        if (lieConfirmed) {
            // Lie confirmed — accused spins, loses points
            g.pendingSpinner = accused;
            _deductPoints(gameId, _playerIndex(gameId, accused), g.lastClaimCount);
        } else {
            // False accusation — accuser spins
            g.pendingSpinner = accuser;
        }

        emit ChallengeResolved(gameId, lieConfirmed, g.pendingSpinner);
        g.state = GameState.Spinning;
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;
        emit SpinTriggered(gameId, g.pendingSpinner);
    }

    /**
     * @notice Player opts into double-spin before the server resolves.
     *         One-time use; spends 2 chambers instead of 1.
     */
    function useDoubleSpin(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.Spinning) revert NotInCorrectPhase();
        require(msg.sender == g.pendingSpinner, "Not the spinner");

        uint8 idx = _playerIndex(gameId, msg.sender);
        if (g.players[idx].hasUsedDoubleSpin) revert AlreadyUsedDoubleSpin();
        g.players[idx].hasUsedDoubleSpin = true;
        g.pendingIsDoubleSpin = true;

        revolver.beginDoubleSpin(gameId, msg.sender);
        emit DoubleSpinUsed(gameId, msg.sender);
    }

    /**
     * @notice Called by game contract (or server via event) after revolver.resolveSpin().
     *         Processes spin result: eliminate player or start new round.
     * @dev The server calls revolver.resolveSpin() which emits SpinResolved.
     *      Then calls this function to update game state.
     */
    function onSpinResolved(uint256 gameId, bool fired) external {
        require(
            msg.sender == address(revolver) || msg.sender == treasury,
            "Unauthorized"
        );
        Game storage g = games[gameId];
        if (g.state != GameState.Spinning) revert NotInCorrectPhase();

        if (fired) {
            _eliminatePlayer(gameId, g.pendingSpinner, "SPIN");
        } else if (g.pendingIsDoubleSpin) {
            // First spin survived — wait for second via resolveDoubleSpin path
            g.pendingIsDoubleSpin = false;
        } else {
            g.pendingSpinner = address(0);
            _startRound(gameId);
        }
    }

    /**
     * @notice Eliminate the lowest-scoring alive player (one-time, costs 5+ pts).
     */
    function useExecute(uint256 gameId) external {
        Game storage g = games[gameId];
        if (g.state != GameState.PlayerTurn) revert NotInCorrectPhase();
        if (msg.sender != g.players[g.currentTurnIndex].addr) revert NotYourTurn();

        uint8 myIdx = g.currentTurnIndex;
        if (g.players[myIdx].points < 5) revert InsufficientPoints();
        if (g.players[myIdx].hasUsedExecute) revert AlreadyUsedExecute();
        g.players[myIdx].hasUsedExecute = true;

        uint8 targetIdx = type(uint8).max;
        uint8 lowestScore = type(uint8).max;
        for (uint8 i = 0; i < g.playerCount; i++) {
            if (i == myIdx || !g.players[i].alive) continue;
            if (g.players[i].points < lowestScore) {
                lowestScore = g.players[i].points;
                targetIdx = i;
            }
        }
        require(targetIdx != type(uint8).max, "No valid target");

        emit ExecuteUsed(gameId, msg.sender, g.players[targetIdx].addr);
        _eliminatePlayer(gameId, g.players[targetIdx].addr, "EXECUTE");
    }

    /**
     * @notice Force timeout when a player doesn't act in time.
     *         Any participant can call this after deadline.
     */
    function forceTimeout(uint256 gameId) external {
        Game storage g = games[gameId];
        require(block.timestamp >= g.turnDeadline && g.turnDeadline != 0, "Not timed out");
        require(
            g.state == GameState.PlayerTurn ||
            g.state == GameState.Challenging ||
            g.state == GameState.Spinning,
            "No timeout here"
        );

        if (g.state == GameState.PlayerTurn) {
            _advanceTurn(gameId);
        } else if (g.state == GameState.Challenging) {
            // Accused refused to reveal → treat as lie confirmed, they spin
            g.pendingSpinner = g.lastClaimant;
            emit ChallengeResolved(gameId, true, g.pendingSpinner);
            g.state = GameState.Spinning;
            g.turnDeadline = block.timestamp + TURN_TIMEOUT;
            emit SpinTriggered(gameId, g.pendingSpinner);
        } else {
            // Spinning timeout → auto-eliminate (refused to pull trigger)
            _eliminatePlayer(gameId, g.pendingSpinner, "TIMEOUT");
        }
    }

    // ── View ───────────────────────────────────────────────────────────────

    function getGameState(uint256 gameId) external view returns (
        GameState state, uint8 round, uint8 targetCard,
        uint8 currentTurnIndex, uint8 aliveCount, address winner
    ) {
        Game storage g = games[gameId];
        return (g.state, g.round, g.targetCard, g.currentTurnIndex, g.aliveCount, g.winner);
    }

    function getPlayer(uint256 gameId, uint8 index) external view returns (
        address addr, bool alive, uint8 points,
        bool usedExecute, bool usedDoubleSpin, uint8 characterId
    ) {
        Player storage p = games[gameId].players[index];
        return (p.addr, p.alive, p.points, p.hasUsedExecute, p.hasUsedDoubleSpin, p.characterId);
    }

    function getLastClaim(uint256 gameId) external view returns (address claimant, uint8 count) {
        Game storage g = games[gameId];
        return (g.lastClaimant, g.lastClaimCount);
    }

    function getPendingSpinner(uint256 gameId) external view returns (address) {
        return games[gameId].pendingSpinner;
    }

    function getTurnDeadline(uint256 gameId) external view returns (uint256) {
        return games[gameId].turnDeadline;
    }

    function getStakeAmount(uint256 gameId) external view returns (uint256) {
        return games[gameId].stakeAmount;
    }

    function getPlayerCount(uint256 gameId) external view returns (uint8) {
        return games[gameId].playerCount;
    }

    // ── Internal ──────────────────────────────────────────────────────────

    function _startRound(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.round++;

        // Pseudo-random target card (0=Ace,1=King,2=Queen)
        g.targetCard = uint8(uint256(keccak256(abi.encodePacked(
            block.timestamp, block.difficulty, gameId, g.round
        ))) % 3);

        // Reset turn state
        g.lastClaimant = address(0);
        g.lastClaimCount = 0;
        delete g.lastPlayedIndices;
        g.pendingSpinner = address(0);
        g.pendingIsDoubleSpin = false;

        g.currentTurnIndex = _nextAliveIndex(g, type(uint8).max);
        g.state = GameState.PlayerTurn;
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;

        emit RoundStarted(gameId, g.round, g.targetCard, g.aliveCount);
    }

    function _eliminatePlayer(uint256 gameId, address player, string memory cause) internal {
        Game storage g = games[gameId];
        uint8 idx = _playerIndex(gameId, player);
        g.players[idx].alive = false;
        g.aliveCount--;

        emit PlayerEliminated(gameId, player, cause);

        if (g.aliveCount == 1) {
            for (uint8 i = 0; i < g.playerCount; i++) {
                if (g.players[i].alive) {
                    g.winner = g.players[i].addr;
                    g.state = GameState.GameOver;
                    if (g.stakeAmount > 0) {
                        uint256 pot = g.stakeAmount * g.playerCount;
                        uint256 fee = (pot * FEE_BPS) / 10000;
                        require(usdc.transfer(treasury, fee), "Fee transfer failed");
                        require(usdc.transfer(g.winner, pot - fee), "Winner transfer failed");
                    }
                    emit GameOver(gameId, g.winner);
                    return;
                }
            }
        } else {
            _startRound(gameId);
        }
    }

    function _advanceTurn(uint256 gameId) internal {
        Game storage g = games[gameId];
        g.currentTurnIndex = _nextAliveIndex(g, g.currentTurnIndex);
        g.turnDeadline = block.timestamp + TURN_TIMEOUT;
    }

    function _nextAliveIndex(Game storage g, uint8 current) internal view returns (uint8) {
        uint8 next = (current == type(uint8).max) ? 0 : uint8((current + 1) % g.playerCount);
        for (uint8 i = 0; i < g.playerCount; i++) {
            if (g.players[next].alive) return next;
            next = uint8((next + 1) % g.playerCount);
        }
        return 0;
    }

    function _addPoints(uint256 gameId, uint8 idx, uint8 amount) internal {
        games[gameId].players[idx].points += amount;
        emit PointsUpdated(gameId, games[gameId].players[idx].addr, int8(uint8(amount)));
    }

    function _deductPoints(uint256 gameId, uint8 idx, uint8 amount) internal {
        Player storage p = games[gameId].players[idx];
        uint8 deducted = amount > p.points ? p.points : amount;
        p.points -= deducted;
        emit PointsUpdated(gameId, p.addr, -int8(deducted));
    }

    function _playerIndex(uint256 gameId, address player) internal view returns (uint8) {
        Game storage g = games[gameId];
        for (uint8 i = 0; i < g.playerCount; i++) {
            if (g.players[i].addr == player) return i;
        }
        revert("Player not found");
    }

    function _playerCount(Game storage g) internal view returns (uint8) {
        for (uint8 i = 0; i < MAX_PLAYERS; i++) {
            if (g.players[i].addr == address(0)) return i;
        }
        return MAX_PLAYERS;
    }

    function _gameRoundId(uint256 gameId, uint8 round) internal pure returns (uint256) {
        return gameId * 1000 + round;
    }
}
