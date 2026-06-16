# Bluff and Barrel — Testing Guide

## Prerequisites

1. **2+ browser windows/tabs** each with a different MetaMask account (minimum 2, up to 4)
2. **Celo Sepolia CELO** on all accounts ([faucet](https://faucet.celo.org/celo-sepolia) or [Google Cloud faucet](https://cloud.google.com/application/web3/faucet/celo/sepolia))
3. **MetaMask** connected to Celo Sepolia (Chain ID: 11142220)
4. **WS server running** — required for card dealing and spin resolution
5. **Separate resolver wallet** — ideally a different private key from your player wallet (avoids nonce conflicts)

### Start the servers

```bash
# Terminal 1: WebSocket server (REQUIRED)
cd ws-server
node server.js
# Should print: [chain] Resolver wallet: 0x... and [chain] Polling for events every 3s

# Terminal 2: Frontend
cd frontend
npm run dev
# Opens at http://localhost:5173
```

---

## Step-by-Step Testing

### 1. Landing Page

- Three mode cards visible: **Basic** (PLAY NOW), **Devil** (SOON), **Chaos** (SOON)
- "Built on Celo" section describes commit-reveal privacy
- Click **PLAY NOW** on Basic Mode

### 2. Lobby — Connect & Configure

- Connect MetaMask (click wallet connector)
- If on wrong chain → red banner appears at top → click **Switch to Celo Sepolia**
- Choose your character with `<` `>` arrows (choice persists via localStorage)
- Optionally enter a USDC stake amount (leave empty for free game)

### 3. Create a Table (Player 1)

- Click **New Table**
- Sign MetaMask transaction
- Redirected to GameRoom with your Table ID in the URL (e.g. `/game/basic/7`)
- See "2–4 players" waiting screen

### 4. Share the invite

- Click **Copy Invite Link** button
- Send the link to Player 2 (contains `?join=<id>`)

### 5. Join the Table (Player 2+)

- Open the invite link in a separate browser/account
- Lobby shows "You're invited to Table #N"
- Click **Sit Down** and sign

### 6. Start the Game (Player 1 / host only)

- Once 2+ players seated, host sees **Deal the Cards** button
- Click and sign — triggers `startGame()` tx
- WS server detects `RoundStarted` event, commits bullets, deals cards (~5-10s on Celo Sepolia)

### 7. View Your Cards

- Cards appear face-up within a few seconds of WS server dealing
- Each player sees their own unique hand (Ace, King, Queen, Joker)
- If cards stay face-down: WS server may not be connected — check server terminal for `[ws] sent hand to 0x...`

### 8. Play Cards

- Select 1–3 cards by clicking (selected cards lift up)
- Click **Play [N] as [Target]** — plays face-down on the table
- You must have committed your hand first (auto-done when hand received)

### 9. Call LIAR

- After someone plays, the next player can click **LIAR!**
- Challenge overlay appears: accuser vs accused animation

### 10. Challenge Resolution

- **Accused**: click **Reveal your hand** (or it auto-reveals after 3s)
- Contract verifies `keccak256(cardValues, salt)` matches stored commitment
- Played cards are checked: all must match target card or be Joker
- Verdict: `CAUGHT LYING!` or `ALL VALID`
- Loser faces the revolver

### 11. Revolver Spin

- WS server automatically calls `resolveSpin()` after detecting `SpinTriggered` event
- Result: **CLICK** (survived, new round) or **BANG!** (eliminated)
- Chamber pointer increments each spin — after 5 safe clicks, 6th is guaranteed

### 12. Game Over

- Last player standing wins
- Winner shown with crown, character image, and wallet address
- Eliminated players shown below
- If staked: winner auto-receives USDC (stake × players × 95%)
- Click **Another Round** → back to lobby

---

## What to Test

### Core Flow (min 2 players)
- [ ] Two wallets create and join a game
- [ ] Start button appears for host after 2nd player joins
- [ ] WS server logs `[chain] Dealt hand` for both players
- [ ] Cards appear face-up in browser (not stuck as back1.png)
- [ ] `commitHand` tx signed successfully (check MetaMask nonce — if "nonce too low", reset MetaMask account in Settings → Advanced)
- [ ] Playing cards moves them to the table (face-down)
- [ ] LIAR challenge triggers overlay
- [ ] Accused's card values shown after reveal
- [ ] Correct verdict (valid vs lie)
- [ ] Revolver fires or clicks based on committed bullet position
- [ ] Game ends when 1 player alive
- [ ] New round starts after click (new hand dealt)

### 4-Player Game
- [ ] 4 players join successfully
- [ ] All 4 hands dealt correctly (server log shows 4 `[ws] sent hand`)
- [ ] Turn order cycles correctly
- [ ] Players eliminated one by one until winner

### Stake System
- [ ] Create table with USDC stake (e.g. 0.1 USDC)
- [ ] Joining requires USDC approval + transfer
- [ ] Winner receives pot minus 5% on GameOver

### Timeout / Griefing Protection
- [ ] If accused doesn't reveal within 90s, anyone can call `forceTimeout()` — accused is treated as having lied

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| Cards stay face-down | WS server not connected or hand message missed | Check server terminal — restart server; on reconnect it re-sends the hand |
| "nonce too low" error | Resolver wallet and player wallet are same key — server txs advance nonce unknown to MetaMask | MetaMask → Settings → Advanced → Clear activity and nonce data |
| "Wrong network" banner | MetaMask on different chain | Click **Switch to Celo Sepolia** in banner |
| Start button missing | Poll hasn't populated players yet | Wait 2-3 seconds — polling runs every 2s |
| Challenge always fires | Normal — bullet position is random 1-6; you may hit it early | Expected behavior; game has correct ~1/6 fire rate per spin |
| `Already committed` error | Hand received twice (reconnect) | Harmless — hand is already committed, cards will show |
| Tx fails with gas error | Wrong chain or stale nonce | Check chain ID, reset MetaMask if needed |

---

## Contract Interaction (Manual Testing)

You can interact directly via Blockscout's Write Contract tab:

**Game contract**: https://celo-sepolia.blockscout.com/address/0x68F027CC052Ea3A9E4C6E6e6714703FA1B53a466

Key functions to test manually:
- `forceTimeout(gameId)` — call when spinner/challenger times out
- `getGameState(gameId)` — read current state (0=Waiting, 1=PlayerTurn, 2=Challenging, 3=Spinning, 4=GameOver)
- `getPlayer(gameId, index)` — read player address, alive status, points
- `getPlayerCount(gameId)` — number of players in game

---

## Commitment Format Reference

The frontend and server use identical `keccak256` encoding:

```typescript
// Card hand commitment (must match contract's verifyClaim)
keccak256(encodePacked(['uint8','uint8','uint8','uint8','uint8','bytes32'],
  [cards[0], cards[1], cards[2], cards[3], cards[4], salt]))

// Bullet commitment (must match contract's resolveSpin)
keccak256(encodePacked(['uint8','bytes32'], [position, salt]))
```

**Important**: `abi.encodePacked(uint8[5])` in Solidity pads each element to 32 bytes. The correct encoding unpacks the array into 5 individual `uint8` values.

---

## WS Server Logs Reference

```
[chain] Resolver wallet: 0x3Ba...        — server started with valid key
[chain] Polling for events every 3s      — using getLogs (Forno doesn't support filters)
[chain] RoundStarted game=N round=1      — detected on-chain event
[chain] dealRound start game=N           — beginning card deal
[chain] commitBullet game=N player=0x..  — bullet committed for player
[ws] sent hand to 0x...                  — cards sent to player's WS connection
[chain] Dealt hand game=N round=1        — hand sent successfully
[chain] SpinTriggered game=N spinner=    — spin detected
[chain] resolveSpin game=N fired=true    — spin resolved
[chain] GameOver game=N                  — game complete, cleanup done
```

If you see `[ws] no connection for 0x...` — the player hasn't connected to WS yet. The hand is cached in `dealtHands` and will be re-sent when they join.
