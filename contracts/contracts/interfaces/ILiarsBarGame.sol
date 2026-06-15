// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ILiarsBarGame {
    enum GameState {
        WaitingForPlayers,
        PlayerTurn,
        Challenging,
        Spinning,
        GameOver
    }

    // ── Events ──────────────────────────────────────────────────────────
    event GameCreated(uint256 indexed gameId, address indexed host);
    event PlayerJoined(uint256 indexed gameId, address indexed player, uint8 index);
    event GameStarted(uint256 indexed gameId);
    event RoundStarted(uint256 indexed gameId, uint8 round, uint8 targetCard, uint8 playerCount);
    event CardsPlayed(uint256 indexed gameId, address indexed player, uint8 count);
    event LiarCalled(uint256 indexed gameId, address indexed accuser, address indexed accused);
    event ChallengeResolved(uint256 indexed gameId, bool lieConfirmed, address indexed spinner);
    event SpinTriggered(uint256 indexed gameId, address indexed player);
    event SpinResolved(uint256 indexed gameId, address indexed player, bool fired);
    event PlayerEliminated(uint256 indexed gameId, address indexed player, string cause);
    event GameOver(uint256 indexed gameId, address indexed winner);
    event PointsUpdated(uint256 indexed gameId, address indexed player, int8 delta);
    event ExecuteUsed(uint256 indexed gameId, address indexed executor, address indexed target);
    event DoubleSpinUsed(uint256 indexed gameId, address indexed player);

    // ── Errors ───────────────────────────────────────────────────────────
    error NotInCorrectPhase();
    error NotYourTurn();
    error GameFull();
    error AlreadyJoined();
    error NotEnoughPlayers();
    error InvalidCardCount();
    error NothingToChallenge();
    error CannotChallengeSelf();
    error InsufficientPoints();
    error AlreadyUsedExecute();
    error AlreadyUsedDoubleSpin();
    error InvalidReveal();
}
