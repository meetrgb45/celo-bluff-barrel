# Bluff and Barrel — On-Chain Deception Game

> A fully on-chain 2–4 player card bluffing game with Russian Roulette elimination and USDC stakes. Built on Celo Sepolia using commit-reveal privacy.

![Status](https://img.shields.io/badge/Status-Live%20on%20Testnet-green) ![Chain](https://img.shields.io/badge/Chain-Celo%20Sepolia-gold) ![Players](https://img.shields.io/badge/Players-2--4-blue)

---

## What is Bluff and Barrel?

A provably fair on-chain card bluffing game where:

- **Cards are private** — dealt off-chain, committed on-chain as cryptographic hashes
- **Bluffs are verified on-chain** — accused reveals hand, contract checks commitment + card validity in one tx
- **The revolver is real** — bullet position committed at game start, revealed only on spin
- **Stakes are real** — USDC wagers with automatic winner payout
- **No FHE required** — commit-reveal + trusted WS server, upgradeable to Chainlink VRF

### Game Modes

| Mode | Status | Description |
|------|--------|-------------|
| **Basic** | ✅ Live | 5 cards, bluff or call, loser spins the revolver |
| **Devil** | Coming Soon | Devil card punishes ALL other players |
| **Chaos** | Coming Soon | Shoot your opponents, Master/Chaos specials |

---

## How to Play

1. **Choose your character** (8 animal masks) and optionally **set a USDC stake**
2. **Create or join a table** — host can start with 2, 3, or 4 players
3. **Each round**: a target card is announced (Ace, King, or Queen)
4. **On your turn**: play 1–3 cards face-down, claiming they're the target (Joker is always valid)
5. **Other players**: believe you or call "LIAR!"
6. **If challenged**: you must reveal your hand on-chain — contract verifies your commitment
7. **Russian Roulette**: 6 chambers, 1 hidden bullet — spin and find out
8. **Last player alive wins** the pot (stake × players, minus 5% platform fee)

---

## Architecture

```
celo-bluff-barrel/
├── contracts/
│   ├── LiarsBarGame.sol          # Orchestrator — game state machine, USDC stake
│   ├── LiarsBarDeck.sol          # Commit-reveal card privacy
│   ├── LiarsBarRevolver.sol      # Per-player 6-chamber revolver, commit-reveal bullet
│   └── scripts/deploy.ts
├── ws-server/
│   └── server.js                 # Private card dealing + spin resolution via viem
└── frontend/
    └── src/
        ├── pages/                # Landing, Lobby, GameRoom
        ├── components/           # Cards, ChallengeOverlay, SpinAnimation, Timer
        ├── hooks/                # useMyHand, useChallenge, useSpin, useGameState, useWebSocket
        ├── stores/               # Zustand game state
        └── lib/                  # contracts.ts, wagmi.ts, gas.ts
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- MetaMask wallet
- Celo Sepolia CELO ([faucet](https://faucet.celo.org/celo-sepolia))
- Two or more wallets/browsers to play

### 1. WS Server (required — handles card dealing + spin resolution)
```bash
cd ws-server
npm install
cp .env.example .env   # fill in RESOLVER_PRIVATE_KEY + contract addresses
node server.js
```
Server runs on port 8080. Health check: http://localhost:8080/health

### 2. Frontend
```bash
cd frontend
npm install
cp .env.example .env   # fill in VITE_* contract addresses + VITE_WS_URL
npm run dev
```
Open http://localhost:5173

### 3. Deploy Contracts (if deploying fresh)
```bash
cd contracts
npm install
cp .env.example .env   # fill in PRIVATE_KEY
npx hardhat test                                     # run all 20 tests
npx hardhat run scripts/deploy.ts --network celo-sepolia
```

---

## Deployed Contracts (Celo Sepolia)

| Contract | Address |
|----------|---------|
| LiarsBarGame | `0x68F027CC052Ea3A9E4C6E6e6714703FA1B53a466` |
| LiarsBarDeck | `0xDCEc990780298E38b6Ca51e5e46b00910b5FFc06` |
| LiarsBarRevolver | `0xf44dF571c44B339331C4ae0613792D955748E6Fb` |
| USDC (testnet) | `0x01C5C0122039549AD1493B8220cABEdD739BC44E` |

Explorer: https://celo-sepolia.blockscout.com

---

## Privacy Model

### Card Privacy (Commit-Reveal)

1. WS server shuffles deck, splits into hands
2. Each player receives `{ cards, salt }` privately over WebSocket
3. Player submits `commitHand(gameRoundId, keccak256(cards, salt))` on-chain
4. On challenge: accused calls `revealChallenge(cardValues, salt)` — contract verifies commitment and checks each played card against target

### Revolver Privacy (Commit-Reveal)

1. WS server generates `bulletPosition ∈ [1,6]` and `salt` per player
2. Server submits `commitBullet(gameId, player, keccak256(position, salt))` on-chain
3. On spin: server calls `revolveer.resolveSpin(position, salt)` — contract verifies, increments chamber, emits `fired`

### Trust Model

| What | Who knows | On-chain |
|------|-----------|---------|
| Your cards | You + WS server | Commitment hash only |
| Bullet position | WS server only | Commitment hash only |
| Challenge result | Everyone | Emitted as event |
| Spin result | Everyone | Emitted as event |

**Trust assumption**: WS server is honest for card dealing and bullet generation. Server compromise → unfair games, NOT loss of funds (USDC held in contract). Upgrade path: Chainlink VRF for bullet, ZK shuffle for cards.

---

## USDC Stake System

- Creator sets stake amount (0 = free game)
- Each player deposits USDC on join (approve + transferFrom)
- Winner receives `stake × playerCount × 95%`
- 5% platform fee sent to treasury wallet
- Automatic payout on GameOver — no manual claim

---

## Tech Stack

**Contracts**: Solidity 0.8.28, Hardhat, OpenZeppelin, London EVM

**Frontend**: Vite, React 19, TypeScript, wagmi v2, viem, Zustand, Tailwind CSS, Framer Motion

**WS Server**: Node.js ESM, viem, dotenv

**Network**: Celo Sepolia (Chain ID: 11142220), Forno RPC

---

## Documentation

- [CONTRACTS.md](./CONTRACTS.md) — Contract architecture and commit-reveal design
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) — Step-by-step testing guide

---

## Celo Sepolia Network

| | |
|---|---|
| Chain ID | 11142220 |
| RPC | https://forno.celo-sepolia.celo-testnet.org |
| Explorer | https://celo-sepolia.blockscout.com |
| Faucet | https://faucet.celo.org/celo-sepolia |
| Block time | ~1 second |

---

## License

MIT
