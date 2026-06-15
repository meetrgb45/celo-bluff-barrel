import { useEffect } from 'react';
import { usePublicClient } from 'wagmi';
import { GAME_ADDRESS, GAME_ABI, REVOLVER_ADDRESS, REVOLVER_ABI } from '../lib/contracts';
import { useGameStore, getStateMap } from '../stores/gameStore';

export function useGameState() {
  const publicClient = usePublicClient();
  const gameId = useGameStore((s) => s.gameId);
  const updateFromChain = useGameStore((s) => s.updateFromChain);
  const setPlayers = useGameStore((s) => s.setPlayers);
  const setLastClaim = useGameStore((s) => s.setLastClaim);
  const setChamberPointers = useGameStore((s) => s.setChamberPointers);
  const setPendingSpinner = useGameStore((s) => s.setPendingSpinner);
  const setStakeAmount = useGameStore((s) => s.setStakeAmount);

  useEffect(() => {
    if (gameId === null || !publicClient) return;

    const poll = async () => {
      try {
        const [state, round, targetCard, currentTurnIndex, aliveCount, winner] =
          await publicClient.readContract({
            address: GAME_ADDRESS, abi: GAME_ABI,
            functionName: 'getGameState', args: [BigInt(gameId)],
          }) as [number, number, number, number, number, string];

        updateFromChain({ state, round, targetCard, currentTurnIndex, aliveCount, winner });

        // Player count (min 2, max 4)
        let playerCount = 4;
        try {
          playerCount = Number(await publicClient.readContract({
            address: GAME_ADDRESS, abi: GAME_ABI,
            functionName: 'getPlayerCount', args: [BigInt(gameId)],
          }));
        } catch {}

        // Players
        const players = await Promise.all(
          Array.from({ length: playerCount }, (_, i) =>
            publicClient.readContract({
              address: GAME_ADDRESS, abi: GAME_ABI,
              functionName: 'getPlayer', args: [BigInt(gameId), i],
            }).then((r: any) => ({
              addr: r[0] as string,
              alive: r[1] as boolean,
              points: Number(r[2]),
              usedExecute: r[3] as boolean,
              usedDoubleSpin: r[4] as boolean,
              characterId: Number(r[5]),
            }))
          )
        );
        setPlayers(players);

        // Last claim
        const [claimant, count] = await publicClient.readContract({
          address: GAME_ADDRESS, abi: GAME_ABI,
          functionName: 'getLastClaim', args: [BigInt(gameId)],
        }) as [string, number];
        setLastClaim(claimant, Number(count));

        // Chamber pointers
        const pointers: Record<string, number> = {};
        for (const p of players) {
          if (p.addr === '0x0000000000000000000000000000000000000000') continue;
          try {
            const ptr = await publicClient.readContract({
              address: REVOLVER_ADDRESS, abi: REVOLVER_ABI,
              functionName: 'getChamberPointer', args: [BigInt(gameId), p.addr as `0x${string}`],
            });
            pointers[p.addr.toLowerCase()] = Number(ptr);
          } catch {}
        }
        setChamberPointers(pointers);

        // Pending spinner
        try {
          const spinner = await publicClient.readContract({
            address: GAME_ADDRESS, abi: GAME_ABI,
            functionName: 'getPendingSpinner', args: [BigInt(gameId)],
          }) as string;
          setPendingSpinner(spinner);
        } catch {}

        // Stake
        try {
          const stake = await publicClient.readContract({
            address: GAME_ADDRESS, abi: GAME_ABI,
            functionName: 'getStakeAmount', args: [BigInt(gameId)],
          }) as bigint;
          setStakeAmount(stake);
        } catch {}

      } catch (e) { console.error('[useGameState] poll error:', e); }
    };

    poll();
    const interval = setInterval(poll, 3000);
    const onWsChange = () => poll();
    window.addEventListener('ws-state-changed', onWsChange);
    return () => { clearInterval(interval); window.removeEventListener('ws-state-changed', onWsChange); };
  }, [gameId, publicClient, updateFromChain, setPlayers, setLastClaim, setChamberPointers, setPendingSpinner, setStakeAmount]);
}
