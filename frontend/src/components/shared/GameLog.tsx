import { useEffect, useState, useRef } from 'react';
import { usePublicClient } from 'wagmi';
import { parseAbiItem } from 'viem';
import { GAME_ADDRESS } from '../../lib/contracts';
import { shortenAddress } from '../../lib/cardUtils';

interface LogEntry { msg: string; }

const EVENTS = [
  parseAbiItem('event CardsPlayed(uint256 indexed gameId, address indexed player, uint8 count)'),
  parseAbiItem('event LiarCalled(uint256 indexed gameId, address indexed accuser, address indexed accused)'),
  parseAbiItem('event ChallengeResolved(uint256 indexed gameId, bool lieConfirmed, address spinner)'),
  parseAbiItem('event SpinResult(uint256 indexed gameId, address indexed player, bool fired)'),
  parseAbiItem('event PlayerEliminated(uint256 indexed gameId, address indexed player, string cause)'),
  parseAbiItem('event GameOver(uint256 indexed gameId, address indexed winner)'),
  parseAbiItem('event RoundStarted(uint256 indexed gameId, uint8 round, uint8 targetCard)'),
];

export default function GameLog({ gameId }: { gameId: string }) {
  const publicClient = usePublicClient();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const lastBlockRef = useRef<bigint>(0n);

  useEffect(() => {
    if (!publicClient || !gameId) return;

    const fetchLogs = async () => {
      try {
        const currentBlock = await publicClient.getBlockNumber();
        const fromBlock = lastBlockRef.current === 0n ? currentBlock - 1000n : lastBlockRef.current + 1n;
        if (fromBlock > currentBlock) return;

        const allLogs = await publicClient.getLogs({
          address: GAME_ADDRESS,
          fromBlock,
          toBlock: currentBlock,
        });

        lastBlockRef.current = currentBlock;

        const newEntries: LogEntry[] = [];
        for (const log of allLogs) {
          try {
            for (const event of EVENTS) {
              try {
                const { decodeEventLog } = await import('viem');
                const decoded = decodeEventLog({ abi: [event], data: log.data, topics: log.topics });
                const args: any = decoded.args;
                const name = decoded.eventName;

                // Filter by gameId
                if (args.gameId !== undefined && BigInt(args.gameId) !== BigInt(gameId)) continue;

                let msg: string = name;
                if (name === 'CardsPlayed') msg = `🃏 ${shortenAddress(args.player)} played ${args.count} card(s)`;
                if (name === 'LiarCalled') msg = `🤥 ${shortenAddress(args.accuser)} calls LIAR on ${shortenAddress(args.accused)}!`;
                if (name === 'ChallengeResolved') msg = args.lieConfirmed ? `✗ Lie confirmed! ${shortenAddress(args.spinner)} spins` : `✓ All valid! ${shortenAddress(args.spinner)} spins`;
                if (name === 'SpinResult') msg = args.fired ? `💥 ${shortenAddress(args.player)} BANG!` : `🔫 ${shortenAddress(args.player)} *click*`;
                if (name === 'PlayerEliminated') msg = `💀 ${shortenAddress(args.player)} eliminated`;
                if (name === 'GameOver') msg = `🏆 ${shortenAddress(args.winner)} wins!`;
                if (name === 'RoundStarted') msg = `📋 Round ${args.round} — Target: ${['Ace', 'King', 'Queen'][args.targetCard]}`;

                newEntries.push({ msg });
                break;
              } catch { /* not this event */ }
            }
          } catch { /* skip unparseable */ }
        }

        if (newEntries.length > 0) {
          setLogs((prev) => [...newEntries, ...prev].slice(0, 30));
        }
      } catch (e) { console.error('[GameLog] poll error:', e); }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [publicClient, gameId]);

  return (
    <div className="bg-bar-panel rounded-xl p-4 max-h-48 overflow-y-auto">
      <h3 className="text-xs text-gray-400 mb-2">Game Log</h3>
      {logs.length === 0 ? (
        <p className="text-gray-500 text-sm">No events yet...</p>
      ) : (
        logs.map((l, i) => <p key={i} className="text-sm text-gray-300 py-0.5">{l.msg}</p>)
      )}
    </div>
  );
}
