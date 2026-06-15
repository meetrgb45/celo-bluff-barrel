import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { ethers } from 'ethers';
import { randomBytes } from 'crypto';

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const RPC_URL = process.env.CELO_SEPOLIA_RPC_URL || 'https://forno.celo-sepolia.celo-testnet.org';
const RESOLVER_KEY = process.env.RESOLVER_PRIVATE_KEY;
const GAME_ADDRESS = process.env.GAME_ADDRESS;
const DECK_ADDRESS = process.env.DECK_ADDRESS;
const REVOLVER_ADDRESS = process.env.REVOLVER_ADDRESS;

// ── ABIs (minimal) ────────────────────────────────────────────────────────────
const GAME_ABI = [
  'event RoundStarted(uint256 indexed gameId, uint8 round, uint8 targetCard, uint8 playerCount)',
  'event SpinTriggered(uint256 indexed gameId, address indexed player)',
  'event GameOver(uint256 indexed gameId, address indexed winner)',
  'function getGameState(uint256) view returns (uint8,uint8,uint8,uint8,uint8,address)',
  'function getPlayer(uint256,uint8) view returns (address,bool,uint8,bool,bool,uint8)',
  'function onSpinResolved(uint256,bool) nonpayable',
];

const REVOLVER_ABI = [
  'function commitBullet(uint256,address,bytes32) nonpayable',
  'function resolveSpin(uint256,address,uint8,bytes32) nonpayable returns (bool)',
];

const DECK_ABI = [
  'function hasCommitted(uint256,address) view returns (bool)',
];

// ── Deck composition by player count ─────────────────────────────────────────
// 0=Ace, 1=King, 2=Queen, 3=Joker
function buildDeck(playerCount) {
  if (playerCount === 2) return [...Array(3).fill(0), ...Array(3).fill(1), ...Array(3).fill(2), ...Array(1).fill(3)];
  if (playerCount === 3) return [...Array(5).fill(0), ...Array(5).fill(1), ...Array(4).fill(2), ...Array(1).fill(3)];
  return [...Array(6).fill(0), ...Array(6).fill(1), ...Array(6).fill(2), ...Array(2).fill(3)]; // 4p
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeSalt() {
  return '0x' + randomBytes(32).toString('hex');
}

/** keccak256(abi.encodePacked(c0,c1,c2,c3,c4, salt)) — matches Solidity contract */
function handCommitment(cards, salt) {
  return ethers.keccak256(
    ethers.solidityPacked(['uint8','uint8','uint8','uint8','uint8','bytes32'], [...cards, salt])
  );
}

/** keccak256(abi.encodePacked(uint8 pos, bytes32 salt)) */
function bulletCommitment(position, salt) {
  return ethers.keccak256(ethers.solidityPacked(['uint8','bytes32'], [position, salt]));
}

// ── State ─────────────────────────────────────────────────────────────────────
// rooms: Map<gameId, Set<ws>>
const rooms = new Map();
// per-game server state
// bullets: Map<gameId, Map<playerAddr, {position, salt}>>
const bullets = new Map();
// track active games for cleanup
const activeGames = new Set();

// ── Blockchain setup ──────────────────────────────────────────────────────────
let provider, resolver, gameContract, revolverContract, deckContract;

function setupChain() {
  if (!RESOLVER_KEY || !GAME_ADDRESS || !REVOLVER_ADDRESS || !DECK_ADDRESS) {
    console.warn('[chain] Missing env vars — chain integration disabled (relay-only mode)');
    return;
  }
  provider = new ethers.JsonRpcProvider(RPC_URL);
  resolver = new ethers.Wallet(RESOLVER_KEY, provider);
  gameContract = new ethers.Contract(GAME_ADDRESS, GAME_ABI, resolver);
  revolverContract = new ethers.Contract(REVOLVER_ADDRESS, REVOLVER_ABI, resolver);
  deckContract = new ethers.Contract(DECK_ADDRESS, DECK_ABI, resolver);

  console.log('[chain] Resolver wallet:', resolver.address);

  // Listen for RoundStarted → deal cards
  gameContract.on('RoundStarted', async (gameId, round, targetCard, playerCount, event) => {
    const gid = gameId.toString();
    console.log(`[chain] RoundStarted game=${gid} round=${round} players=${playerCount}`);
    await dealRound(gid, Number(gameId), Number(round), Number(playerCount));
    broadcast(gid, { type: 'stateChanged', from: 'server' });
  });

  // Listen for SpinTriggered → resolve spin
  gameContract.on('SpinTriggered', async (gameId, player, event) => {
    const gid = gameId.toString();
    console.log(`[chain] SpinTriggered game=${gid} spinner=${player}`);
    broadcast(gid, { type: 'spinResolving', gameId: gid, player });
    await resolveSpin(gid, Number(gameId), player);
    broadcast(gid, { type: 'stateChanged', from: 'server' });
  });

  // Listen for GameOver → clean up
  gameContract.on('GameOver', (gameId, winner) => {
    const gid = gameId.toString();
    console.log(`[chain] GameOver game=${gid} winner=${winner}`);
    bullets.delete(gid);
    activeGames.delete(gid);
  });

  console.log('[chain] Listening for on-chain events');
}

async function dealRound(gid, gameId, round, playerCount) {
  try {
    // Fetch alive player addresses
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const [addr, alive] = await gameContract.getPlayer(BigInt(gameId), i);
      if (alive) players.push(addr);
    }

    // Commit bullets for new game (round 1 only)
    if (round === 1) {
      const gameBullets = new Map();
      for (const addr of players) {
        const salt = makeSalt();
        const position = Math.floor(Math.random() * 6) + 1; // 1-6
        const commitment = bulletCommitment(position, salt);
        gameBullets.set(addr.toLowerCase(), { position, salt });
        await revolverContract.commitBullet(BigInt(gameId), addr, commitment);
        console.log(`[chain] commitBullet game=${gid} player=${addr.slice(0,8)} pos=${position}`);
      }
      bullets.set(gid, gameBullets);
    }

    // Deal and send cards privately to each player
    const deck = shuffle(buildDeck(players.length));
    const gameRoundId = BigInt(gameId) * 1000n + BigInt(round);

    for (let i = 0; i < players.length; i++) {
      const hand = deck.slice(i * 5, i * 5 + 5);
      const salt = makeSalt();
      const commitment = handCommitment(hand, salt);

      // Send hand privately to this player's WS connection
      sendToPlayer(gid, players[i], {
        type: 'hand',
        gameId: gid,
        round,
        cards: hand,
        salt,
        commitment,
        gameRoundId: gameRoundId.toString(),
      });
      console.log(`[chain] Dealt hand game=${gid} round=${round} player=${players[i].slice(0,8)} hand=${hand}`);
    }
  } catch (err) {
    console.error('[chain] dealRound error:', err.message);
  }
}

async function resolveSpin(gid, gameId, spinnerAddr) {
  try {
    const gameBullets = bullets.get(gid);
    if (!gameBullets) {
      console.error('[chain] No bullet data for game', gid);
      return;
    }
    const bullet = gameBullets.get(spinnerAddr.toLowerCase());
    if (!bullet) {
      console.error('[chain] No bullet for player', spinnerAddr);
      return;
    }

    // Small delay to let UI show animation
    await new Promise(r => setTimeout(r, 1500));

    const tx = await revolverContract.resolveSpin(
      BigInt(gameId), spinnerAddr, bullet.position, bullet.salt
    );
    const receipt = await tx.wait();

    // Parse SpinResolved event to get fired result
    const spinResolvedTopic = ethers.id('SpinResolved(uint256,address,bool)');
    let fired = false;
    for (const log of receipt.logs) {
      if (log.topics[0] === spinResolvedTopic) {
        fired = ethers.AbiCoder.defaultAbiCoder().decode(['bool'], log.data)[0];
        break;
      }
    }

    console.log(`[chain] resolveSpin game=${gid} fired=${fired}`);
    await gameContract.onSpinResolved(BigInt(gameId), fired);
  } catch (err) {
    console.error('[chain] resolveSpin error:', err.message);
  }
}

// ── WS helpers ────────────────────────────────────────────────────────────────
// playerConnections: Map<gameId, Map<lowerAddr, ws>>
const playerConnections = new Map();

function sendToPlayer(gid, addr, msg) {
  const room = playerConnections.get(gid);
  if (!room) return;
  const ws = room.get(addr.toLowerCase());
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcast(gid, msg) {
  const room = rooms.get(gid);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// ── HTTP + WS server ──────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
  } else {
    res.writeHead(404);
    res.end();
  }
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  let currentRoom = null;
  let currentAddr = null;

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      if (msg.type === 'join') {
        const roomId = String(msg.gameId);
        currentRoom = roomId;
        currentAddr = msg.address ? msg.address.toLowerCase() : null;

        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);

        if (currentAddr) {
          if (!playerConnections.has(roomId)) playerConnections.set(roomId, new Map());
          playerConnections.get(roomId).set(currentAddr, ws);
        }

        ws.send(JSON.stringify({ type: 'joined', gameId: roomId, peers: rooms.get(roomId).size }));
        return;
      }

      if (msg.type === 'event' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        const payload = JSON.stringify({ type: 'event', data: msg.data });
        for (const peer of room) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(payload);
        }
        return;
      }

      if (msg.type === 'stateChanged' && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        const payload = JSON.stringify({ type: 'stateChanged', from: msg.from });
        for (const peer of room) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(payload);
        }
        return;
      }
    } catch {}
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    rooms.get(currentRoom)?.delete(ws);
    if (currentAddr) playerConnections.get(currentRoom)?.delete(currentAddr);
    if (rooms.get(currentRoom)?.size === 0) {
      rooms.delete(currentRoom);
      playerConnections.delete(currentRoom);
    }
  });
});

setupChain();
server.listen(PORT, () => {
  console.log(`WS server running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
