# Bluff and Barrel — Contract Architecture

## Why Commit-Reveal (not FHE)

Celo Sepolia is a standard EVM L2 (OP Stack). All on-chain state is public. Traditional on-chain card games are impossible without a privacy layer. Bluff and Barrel needs:

1. **Hidden cards** — only you see your hand
2. **Hidden bullet** — nobody knows where the bullet is
3. **Trustless challenge verification** — prove a bluff without a trusted oracle

We use **commit-reveal** — a standard EVM privacy pattern:
- **Commit phase**: a hash of the secret is stored on-chain. Nobody can read the secret.
- **Reveal phase**: the secret is published. Contract verifies it matches the hash.

This is simpler and faster than FHE (~1s on Celo vs ~30s on Fhenix), with the tradeoff that the WS server knows card/bullet values. Cards are never on-chain in plaintext.

---

## Contract Architecture

```
LiarsBarRevolver.sol    ← per-player 6-chamber revolver, commit-reveal bullet
LiarsBarDeck.sol        ← commit-reveal card hand
LiarsBarGame.sol        ← game orchestrator, imports Deck + Revolver
```

All deployed on Celo Sepolia. No external dependencies (no FHE, no VRF for MVP).

### State Machine

```
WaitingForPlayers → PlayerTurn → Challenging → Spinning → (repeat or GameOver)
```

Note: `Dealing` state removed — cards arrive via WS server, no on-chain dealing step needed.

---

## LiarsBarDeck.sol

### Storage

```solidity
// gameRoundId = gameId * 1000 + round
mapping(uint256 => mapping(address => bytes32)) public handCommitment;
mapping(uint256 => mapping(address => mapping(uint8 => bool))) public cardPlayed;
```

### Commitment Format

```solidity
// commitment = keccak256(abi.encodePacked(c0, c1, c2, c3, c4, salt))
// NOTE: must unpack uint8[5] individually — abi.encodePacked(uint8[5]) pads to 32 bytes each
bytes32 expected = keccak256(abi.encodePacked(
    cardValues[0], cardValues[1], cardValues[2], cardValues[3], cardValues[4], salt
));
```

### Key Functions

| Function | Caller | Description |
|----------|--------|-------------|
| `commitHand(gameRoundId, commitment)` | Player | Store hand hash after receiving cards from WS server |
| `markCardsPlayed(gameRoundId, player, indices)` | Game | Flag indices as played face-down |
| `verifyClaim(gameRoundId, player, indices, cardValues, salt, targetCard)` | Game | Verify commitment + check played cards are valid |
| `hasCommitted(gameRoundId, player)` | View | Check if player committed hand this round |
| `remainingCards(gameRoundId, player)` | View | Count unplayed cards |

### Card Values

```
0 = Ace
1 = King
2 = Queen
3 = Joker (always valid, wildcard)
```

### Deck Composition by Player Count

| Players | Deck | Aces | Kings | Queens | Jokers |
|---------|------|------|-------|--------|--------|
| 2 | 10 cards | 3 | 3 | 3 | 1 |
| 3 | 15 cards | 5 | 5 | 4 | 1 |
| 4 | 20 cards | 6 | 6 | 6 | 2 |

---

## LiarsBarRevolver.sol

### Storage

```solidity
// commitment = keccak256(abi.encodePacked(uint8 position, bytes32 salt))
mapping(uint256 => mapping(address => bytes32)) public bulletCommitment;
// pointer starts at 0; increments on each resolveSpin call
mapping(uint256 => mapping(address => uint8)) public chamberPointer;
```

6 chambers, 1 bullet per player. Bullet position [1-6] committed at game start. `fired = (chamberPointer == position)` on each spin.

After 5 safe clicks, chamber 6 is guaranteed to fire.

### Key Functions

| Function | Caller | Description |
|----------|--------|-------------|
| `commitBullet(gameId, player, commitment)` | WS server (treasury wallet) | Store bullet hash at game start |
| `beginSpin(gameId, player)` | Game | Validate spin can proceed |
| `resolveSpin(gameId, player, position, salt)` | WS server | Verify hash, increment pointer, compute fired |
| `resolveDoubleSpin(gameId, player, position, salt)` | WS server | Second spin for double-spin mechanic |

---

## LiarsBarGame.sol

### Player Structure

```solidity
struct Player {
    address addr;
    bool alive;
    uint8 points;       // +N on playing N cards, -N if caught lying
    bool hasUsedExecute;
    bool hasUsedDoubleSpin;
    uint8 characterId;
}
```

### Game Structure (key fields)

```solidity
struct Game {
    GameState state;
    uint8 round;
    uint8 playerCount;      // set at startGame, fixed for game lifetime
    uint8 targetCard;       // 0=Ace, 1=King, 2=Queen (random each round)
    uint8 currentTurnIndex;
    uint8 aliveCount;
    Player[4] players;
    address lastClaimant;   // who played cards most recently
    uint8 lastClaimCount;
    uint8[] lastPlayedIndices;
    address pendingSpinner;
    address winner;
    uint256 turnDeadline;   // block.timestamp + 90s
    uint256 stakeAmount;    // USDC per player
}
```

### Player Count

- Min: 2 players (`MIN_PLAYERS = 2`)
- Max: 4 players (`MAX_PLAYERS = 4`)
- Host starts game at any point once 2+ seated

### Key Functions

| Function | Description |
|----------|-------------|
| `createGame(characterId, stakeAmount)` | Create table, optionally stake USDC |
| `joinGame(gameId, characterId)` | Join table, pay stake if set |
| `startGame(gameId)` | Host starts (min 2 players) — triggers WS to commit bullets and deal |
| `playCards(gameId, cardIndices)` | Play 1-3 cards face-down, claiming target |
| `callLiar(gameId)` | Challenge previous claim — starts Challenging phase |
| `revealChallenge(gameId, cardValues, salt)` | Accused reveals full hand — verified on-chain synchronously |
| `useDoubleSpin(gameId)` | Opt into spending 2 chambers instead of 1 (one-time) |
| `useExecute(gameId)` | Spend 5+ points to eliminate lowest scorer instantly (one-time) |
| `forceTimeout(gameId)` | Any player calls after 90s deadline to punish non-actor |
| `onSpinResolved(gameId, fired)` | Called by WS server after resolving spin to update game state |

### Turn Timer

- 90 seconds per turn (`TURN_TIMEOUT = 90`)
- `turnDeadline` set on every state change
- Any player can call `forceTimeout()` after deadline:
  - `PlayerTurn`: skip the idle player's turn
  - `Challenging`: accused didn't reveal → treated as lie
  - `Spinning`: spinner didn't act → auto-eliminated

### Points System

- +N points when playing N cards (unchallenged)
- -N points when caught lying (N = cards played)
- `useExecute`: spend 5+ points to instantly eliminate lowest scorer

---

## USDC Stake System

```
stakeAmount = 0        → free game
stakeAmount = 1_000_000 → 1 USDC (6 decimals)
```

- Creator sets stake; each player pays on join
- Contract holds funds in escrow
- On GameOver: winner receives `stakeAmount × playerCount × 95%`
- Treasury receives 5% (`FEE_BPS = 500`)
- Checks: `require(usdc.transfer(...), "transfer failed")`

---

## Challenge Flow (Detailed)

```
Player A plays cards
  ↓
Player B calls callLiar()
  → state = Challenging, deadline set
  ↓
Player A (accused) calls revealChallenge(gameId, [c0,c1,c2,c3,c4], salt)
  → contract verifies: keccak256(c0,c1,c2,c3,c4,salt) == handCommitment[gameRoundId][A]
  → contract checks: for each played index i, cardValues[i] == targetCard || cardValues[i] == JOKER
  → lieConfirmed = true if any played card fails check
  ↓
ChallengeResolved(gameId, lieConfirmed, pendingSpinner) emitted
  → state = Spinning
  ↓
WS server detects SpinTriggered event
  → calls revolver.resolveSpin(gameId, spinner, position, salt)
  → SpinResolved(gameId, spinner, fired) emitted
  ↓
WS server calls game.onSpinResolved(gameId, fired)
  → fired=true: eliminate player, new round or GameOver
  → fired=false: new round
```

---

## Security Properties

| Property | Implementation |
|----------|---------------|
| Card privacy | Commitment hash on-chain; plaintext only in player's browser + WS server memory |
| Bullet privacy | Commitment hash on-chain; position only in WS server memory |
| No fake reveals | `keccak256(cardValues, salt) == storedCommitment` enforced in contract |
| No fake bullets | `keccak256(position, salt) == bulletCommitment` enforced in contract |
| No griefing | 90s timeout with `forceTimeout()` callable by any participant |
| Funds safety | USDC held in contract escrow; server compromise → unfair game, NOT lost funds |
| Access control | `onSpinResolved` restricted to `treasury` (server wallet) or revolver contract |

## Trust Assumptions (MVP)

The WS server:
- Knows each player's card values
- Knows each player's bullet position
- Could cheat by dealing known-favorable hands or refusing to resolve spins

**Mitigation**: Server is open source. Players can verify dealing logic independently.

**Upgrade path**:
1. **Chainlink VRF** on Celo → random bullet position with cryptographic proof
2. **ZK mental poker** (Noir/Circom) → trustless card shuffle without server

---

## Gas Estimates (Celo Sepolia)

| Operation | Estimated gas | Notes |
|-----------|--------------|-------|
| `createGame` | ~100k | USDC transferFrom if staked |
| `joinGame` | ~80k | USDC transferFrom if staked |
| `startGame` | ~60k | Sets state, emits RoundStarted |
| `commitHand` | ~50k | Stores 32-byte hash |
| `playCards` | ~80k | Marks cards, updates state |
| `callLiar` | ~50k | State transition only |
| `revealChallenge` | ~100k | Hash verify + card check |
| `resolveSpin` (server) | ~80k | Hash verify + pointer increment |
| `onSpinResolved` | ~60k | State update or elimination |

All transactions on Celo Sepolia cost ~$0.0001–0.001 CELO.
