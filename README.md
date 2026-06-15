# Bluff & Barrel — Celo Sepolia

4-player elimination card bluffing game on [Celo Sepolia](https://celo-sepolia.blockscout.com). Basic Mode.

## How it works

Cards are dealt privately by the WS server and committed on-chain via `keccak256` hashes. Challenges are resolved synchronously on-chain. Revolver spins are committed by the server and resolved after each trigger — no FHE required.

## Stack

- **Contracts** — Hardhat + Solidity 0.8.28, commit-reveal privacy
- **WS Server** — Node.js, ethers v6, handles dealing + spin resolution
- **Frontend** — React + Viem + Wagmi, Celo Sepolia chain

## Setup

### Contracts

```bash
cd contracts
cp .env.example .env   # fill in PRIVATE_KEY, TREASURY_ADDRESS
npm install
npx hardhat test
npx hardhat run scripts/deploy.ts --network celo-sepolia
```

### WS Server

```bash
cd ws-server
cp .env.example .env   # fill in RESOLVER_PRIVATE_KEY + deployed contract addresses
npm install
node server.js
```

### Frontend

```bash
cd frontend
cp .env.example .env   # fill in VITE_* contract addresses + VITE_WS_URL
npm install
npm run dev
```

## Testnet

| | |
|---|---|
| Chain ID | 11142220 |
| RPC | https://forno.celo-sepolia.celo-testnet.org |
| Explorer | https://celo-sepolia.blockscout.com |
| Faucet | https://faucet.celo.org/celo-sepolia |

## Game Rules (Basic Mode)

- 2–4 players, each gets 5 cards (Ace/King/Queen/Joker)
- Each round a target card is revealed; players play 1–3 cards face-down claiming they're the target
- Any player can call **Liar** — accused must reveal their hand on-chain
- Caught lying or false accusation → spin the revolver (6 chambers, 1 bullet)
- Last player standing wins
