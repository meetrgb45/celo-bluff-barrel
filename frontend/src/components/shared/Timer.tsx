import { useEffect, useState } from 'react';
import { useGameStore } from '../../stores/gameStore';

const TURN_TIME = 60;

export default function Timer() {
  const state = useGameStore((s) => s.state);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const [timeLeft, setTimeLeft] = useState(TURN_TIME);

  useEffect(() => {
    setTimeLeft(TURN_TIME);
  }, [state, currentTurnIndex]);

  useEffect(() => {
    if (state === 'WaitingForPlayers' || state === 'GameOver') return;
    const interval = setInterval(() => {
      setTimeLeft((t) => Math.max(0, t - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [state, currentTurnIndex]);

  if (state === 'WaitingForPlayers' || state === 'GameOver') return null;

  const isLow = timeLeft <= 15;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ width: 80, height: 6, background: '#2a1a0a', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 3, transition: 'width 1s linear', width: `${(timeLeft / TURN_TIME) * 100}%`, background: isLow ? '#e94560' : '#c9a84c' }} />
      </div>
      <span style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: isLow ? '#e94560' : '#8b7b5a', animation: isLow ? 'pulse 1s infinite' : 'none' }}>
        {timeLeft}s
      </span>
    </div>
  );
}
