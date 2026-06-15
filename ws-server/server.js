import 'dotenv/config';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, encodePacked, decodeEventLog } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { randomBytes } from 'crypto';

// ── Config ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
const RPC_URL = process.env.CELO_SEPOLIA_RPC_URL || 'https://forno.celo-sepolia.celo-testnet.org';
const RESOLVER_KEY = process.env.RESOLVER_PRIVATE_KEY;
const GAME_ADDRESS = process.env.GAME_ADDRESS;
const REVOLVER_ADDRESS = process.env.REVOLVER_ADDRESS;

const celoSepolia = {
  id: 11142220,
  name: 'Celo Sepolia',
  nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

// ── ABIs ───────────────────────────────────────────────────────────────────
const GAME_ABI = parseAbi([
  'event RoundStarted(uint256 indexed gameId, uint8 round, uint8 targetCard, uint8 playerCount)',
  'event SpinTriggered(uint256 indexed gameId, address indexed player)',
  'event GameOver(uint256 indexed gameId, address indexed winner)',
  'function getPlayer(uint256 gameId, uint8 index) view returns (address addr, bool alive, uint8 points, bool usedExecute, bool usedDoubleSpin, uint8 characterId)',
  'function onSpinResolved(uint256 gameId, bool fired)',
]);

const REVOLVER_ABI = parseAbi([
  'function commitBullet(uint256 gameId, address player, bytes32 commitment)',
  'function resolveSpin(uint256 gameId, address player, uint8 position, bytes32 salt) returns (bool)',
]);

// ── Deck helpers ───────────────────────────────────────────────────────────
function buildDeck(playerCount) {
  if (playerCount === 2) return [...Array(3).fill(0), ...Array(3).fill(1), ...Array(3).fill(2), 3];
  if (playerCount === 3) return [...Array(5).fill(0), ...Array(5).fill(1), ...Array(4).fill(2), 3];
  return [...Array(6).fill(0), ...Array(6).fill(1), ...Array(6).fill(2), 3, 3];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function makeSalt() { return `0x${randomBytes(32).toString('hex')}`; }

function handCommitment(cards, salt) {
  return keccak256(encodePacked(['uint8','uint8','uint8','uint8','uint8','bytes32'], [...cards, salt]));
}

function bulletCommitment(position, salt) {
  return keccak256(encodePacked(['uint8','bytes32'], [position, salt]));
}

// ── State ──────────────────────────────────────────────────────────────────
const rooms = new Map();         // gameId → Set<ws>
const playerConnections = new Map(); // gameId → Map<lowerAddr, ws>
const bullets = new Map();       // gameId → Map<lowerAddr, {position, salt}>
const dealtHands = new Map();    // gameId → Map<lowerAddr, hand message>

// ── Chain setup ────────────────────────────────────────────────────────────
let publicClient, walletClient, account;

function setupChain() {
  if (!RESOLVER_KEY || !GAME_ADDRESS || !REVOLVER_ADDRESS) {
    console.warn('[chain] Missing env vars — relay-only mode');
    return;
  }

  account = privateKeyToAccount(RESOLVER_KEY);
  publicClient = createPublicClient({ chain: celoSepolia, transport: http(RPC_URL) });
  walletClient = createWalletClient({ account, chain: celoSepolia, transport: http(RPC_URL) });

  console.log('[chain] Resolver wallet:', account.address);

  const ROUND_STARTED = keccak256(encodePacked(['string'], ['RoundStarted(uint256,uint8,uint8,uint8)']));
  const SPIN_TRIGGERED = keccak256(encodePacked(['string'], ['SpinTriggered(uint256,address)']));
  const GAME_OVER = keccak256(encodePacked(['string'], ['GameOver(uint256,address)']));

  // Use keccak256 of event signature for topic matching
  const roundStartedTopic = GAME_ABI.find(a => a.type === 'event' && a.name === 'RoundStarted');
  const spinTriggeredTopic = GAME_ABI.find(a => a.type === 'event' && a.name === 'SpinTriggered');
  const gameOverTopic = GAME_ABI.find(a => a.type === 'event' && a.name === 'GameOver');

  let lastBlock = 0n;
  publicClient.getBlockNumber().then(b => { lastBlock = b; });

  setInterval(async () => {
    try {
      const current = await publicClient.getBlockNumber();
      if (current <= lastBlock) return;
      const from = lastBlock + 1n;
      lastBlock = current;

      const logs = await publicClient.getLogs({
        address: GAME_ADDRESS,
        fromBlock: from,
        toBlock: current,
      });

      for (const log of logs) {
        try {
          const event = decodeEventLog({ abi: GAME_ABI, data: log.data, topics: log.topics });

          if (event.eventName === 'RoundStarted') {
            const { gameId, round, playerCount } = event.args;
            const gid = gameId.toString();
            console.log(`[chain] RoundStarted game=${gid} round=${round} players=${playerCount}`);
            await dealRound(gid, gameId, Number(round), Number(playerCount));
            broadcast(gid, { type: 'stateChanged', from: 'server' });
          }

          if (event.eventName === 'SpinTriggered') {
            const { gameId, player } = event.args;
            const gid = gameId.toString();
            console.log(`[chain] SpinTriggered game=${gid} spinner=${player}`);
            broadcast(gid, { type: 'spinResolving', gameId: gid, player });
            await resolveSpin(gid, gameId, player);
            broadcast(gid, { type: 'stateChanged', from: 'server' });
          }

          if (event.eventName === 'GameOver') {
            const { gameId } = event.args;
            const gid = gameId.toString();
            console.log(`[chain] GameOver game=${gid}`);
            bullets.delete(gid);
        dealtHands.delete(gid);
          }
        } catch {} // skip undecodable logs
      }
    } catch (e) {
      console.error('[chain] poll error:', e.shortMessage || e.message);
    }
  }, 3000);

  console.log('[chain] Polling for events every 3s');
}

async function dealRound(gid, gameId, round, playerCount) {
  try {
    // Fetch alive players
    const players = [];
    for (let i = 0; i < playerCount; i++) {
      const result = await publicClient.readContract({
        address: GAME_ADDRESS, abi: GAME_ABI,
        functionName: 'getPlayer', args: [gameId, i],
      });
      if (result.alive) players.push(result.addr);
    }

    // Commit bullets on round 1
    if (round === 1) {
      const gameBullets = new Map();
      for (const addr of players) {
        const salt = makeSalt();
        const position = Math.floor(Math.random() * 6) + 1;
        const commitment = bulletCommitment(position, salt);
        gameBullets.set(addr.toLowerCase(), { position, salt });
        await walletClient.writeContract({
          address: REVOLVER_ADDRESS, abi: REVOLVER_ABI,
          functionName: 'commitBullet', args: [gameId, addr, commitment],
        });
        console.log(`[chain] commitBullet game=${gid} player=${addr.slice(0,8)} pos=${position}`);
      }
      bullets.set(gid, gameBullets);
    }

    // Deal cards
    const deck = shuffle(buildDeck(players.length));
    const gameRoundId = gameId * 1000n + BigInt(round);

    for (let i = 0; i < players.length; i++) {
      const hand = deck.slice(i * 5, i * 5 + 5);
      const salt = makeSalt();
      const commitment = handCommitment(hand, salt);
      const handMsg = { type: 'hand', gameId: gid, round, cards: hand, salt, commitment, gameRoundId: gameRoundId.toString() };
      if (!dealtHands.has(gid)) dealtHands.set(gid, new Map());
      dealtHands.get(gid).set(players[i].toLowerCase(), handMsg);
      sendToPlayer(gid, players[i], handMsg);
      console.log(`[chain] Dealt hand game=${gid} round=${round} player=${players[i].slice(0,8)}`);
    }
  } catch (e) {
    console.error('[chain] dealRound error:', e.shortMessage || e.message);
  }
}

async function resolveSpin(gid, gameId, spinnerAddr) {
  try {
    const gameBullets = bullets.get(gid);
    if (!gameBullets) { console.error('[chain] No bullet data for game', gid); return; }
    const bullet = gameBullets.get(spinnerAddr.toLowerCase());
    if (!bullet) { console.error('[chain] No bullet for player', spinnerAddr); return; }

    await new Promise(r => setTimeout(r, 1500));

    const txHash = await walletClient.writeContract({
      address: REVOLVER_ADDRESS, abi: REVOLVER_ABI,
      functionName: 'resolveSpin',
      args: [gameId, spinnerAddr, bullet.position, bullet.salt],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    // Parse SpinResolved event from receipt to get fired result
    let fired = false;
    for (const log of receipt.logs) {
      try {
        const event = decodeEventLog({
          abi: parseAbi(['event SpinResolved(uint256 indexed gameId, address indexed player, bool fired)']),
          data: log.data, topics: log.topics,
        });
        if (event.eventName === 'SpinResolved') { fired = event.args.fired; break; }
      } catch {}
    }

    console.log(`[chain] resolveSpin game=${gid} fired=${fired}`);
    await walletClient.writeContract({
      address: GAME_ADDRESS, abi: GAME_ABI,
      functionName: 'onSpinResolved', args: [gameId, fired],
    });
  } catch (e) {
    console.error('[chain] resolveSpin error:', e.shortMessage || e.message);
  }
}

// ── WS helpers ─────────────────────────────────────────────────────────────
function sendToPlayer(gid, addr, msg) {
  const room = playerConnections.get(gid);
  if (!room) return;
  const ws = room.get(addr.toLowerCase());
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(gid, msg) {
  const room = rooms.get(gid);
  if (!room) return;
  const payload = JSON.stringify(msg);
  for (const ws of room) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

// ── HTTP + WS server ────────────────────────────────────────────────────────
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', rooms: rooms.size, uptime: process.uptime() }));
  } else { res.writeHead(404); res.end(); }
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
        currentAddr = msg.address?.toLowerCase() ?? null;
        if (!rooms.has(roomId)) rooms.set(roomId, new Set());
        rooms.get(roomId).add(ws);
        if (currentAddr) {
          if (!playerConnections.has(roomId)) playerConnections.set(roomId, new Map());
          playerConnections.get(roomId).set(currentAddr, ws);
        }
        ws.send(JSON.stringify({ type: 'joined', gameId: roomId, peers: rooms.get(roomId).size }));
        // Re-send hand if already dealt (player joined late / reconnected)
        if (currentAddr && dealtHands.has(roomId)) {
          const hand = dealtHands.get(roomId).get(currentAddr);
          if (hand) ws.send(JSON.stringify(hand));
        }
        return;
      }

      if ((msg.type === 'event' || msg.type === 'stateChanged') && currentRoom) {
        const room = rooms.get(currentRoom);
        if (!room) return;
        const payload = JSON.stringify({ type: msg.type, data: msg.data, from: msg.from });
        for (const peer of room) {
          if (peer !== ws && peer.readyState === WebSocket.OPEN) peer.send(payload);
        }
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
});
