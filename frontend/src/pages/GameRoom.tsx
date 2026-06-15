import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAccount, usePublicClient, useWriteContract } from 'wagmi';
import { useGameStore } from '../stores/gameStore';
import { useGameState } from '../hooks/useGameState';
import { useMyHand } from '../hooks/useMyHand';
import { useChallenge } from '../hooks/useChallenge';
import { useSpin } from '../hooks/useSpin';
import { useAutoAction } from '../hooks/useAutoAction';
import { useWebSocket } from '../hooks/useWebSocket';
import { GAME_ADDRESS, GAME_ABI } from '../lib/contracts';
import { getGasOverrides } from '../lib/gas';
import { sounds, isMuted, toggleMute } from '../lib/sounds';
import { shortenAddress, targetName } from '../lib/cardUtils';
import { CHARACTERS } from '../lib/characters';
import SpinAnimation from '../components/revolver/SpinAnimation';
import ChallengeOverlay from '../components/game/ChallengeOverlay';
import Timer from '../components/shared/Timer';

type GameMode = 'basic';

export default function GameRoom() {
  const { id, mode: modeParam } = useParams<{ id: string; mode: string }>();
  const mode = (modeParam || 'basic') as GameMode;
  const navigate = useNavigate();
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const setGameId = useGameStore((s) => s.setGameId);
  const stakeAmount = useGameStore((s) => s.stakeAmount);
  const state = useGameStore((s) => s.state);
  const players = useGameStore((s) => s.players);
  const round = useGameStore((s) => s.round);
  const currentTurnIndex = useGameStore((s) => s.currentTurnIndex);
  const targetCard = useGameStore((s) => s.targetCard);
  const myHand = useGameStore((s) => s.myHand);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const playedCards = useGameStore((s) => s.playedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const markCardsPlayed = useGameStore((s) => s.markCardsPlayed);
  const lastClaimant = useGameStore((s) => s.lastClaimant);
  const lastClaimCount = useGameStore((s) => s.lastClaimCount);
  const chamberPointers = useGameStore((s) => s.chamberPointers);
  const resetPlayedCards = useGameStore((s) => s.resetPlayedCards);

  const myPlayer = players.find((p) => p.addr?.toLowerCase() === address?.toLowerCase());
  const myIndex = players.findIndex((p) => p.addr?.toLowerCase() === address?.toLowerCase());
  const prevRoundRef = useRef(0);
  const challengeResolvedRef = useRef(false);
  const handDecryptedRef = useRef(0);
  // Hand comes from WS server via useWebSocket → useMyHand.receiveHand

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [muted, setMuted] = useState(isMuted());
  const [triggered, setTriggered] = useState(false);
  const [challengePhase, setChallengePhase] = useState<'accusation' | 'revealing' | 'verdict-lie' | 'verdict-valid' | null>(null);
  const [challengeAccuser, setChallengeAccuser] = useState(0);
  const [challengeAccused, setChallengeAccused] = useState(0);
  const prevStateRef = useRef(state);

  const { receiveHand } = useMyHand();
  const { revealChallenge, isPending: resolving } = useChallenge();
  const { useDoubleSpin: triggerDoubleSpin, forceTimeout, isPending: spinning } = useSpin();
  const outcome = null;
  const clearOutcome = () => {};
  const isMySpinTurn = false;
  useGameState();
  useAutoAction();
  const { sendStateChanged } = useWebSocket({ address });
  const notifyStateChanged = sendStateChanged;

  useEffect(() => { if (id) { setGameId(Number(id)); } }, [id, setGameId]);

  // Reset triggered when state changes
  useEffect(() => { setTriggered(false); }, [state]);

  // Sound on game over
  useEffect(() => { if (state === 'GameOver') sounds.gameOver(); }, [state]);

  useEffect(() => {
    if (round > 0 && round !== prevRoundRef.current) {
      prevRoundRef.current = round;
      challengeResolvedRef.current = false;
      handDecryptedRef.current = 0;
      resetPlayedCards();
    }
  }, [round, resetPlayedCards]);

  // Auto-decrypt: keep trying until hand is decrypted
  useEffect(() => {
    if (!myPlayer?.alive || round === 0) return;
    if (state !== 'PlayerTurn' && state !== 'Challenging' && state !== 'Spinning') return;
    if (handDecryptedRef.current === round) return;

    handDecryptedRef.current = round;
    const attempt = () => setTimeout((() => {}), 3000);
    attempt();

    // Retry after 15s if still null
    const retry = setTimeout(() => {
      const hand = useGameStore.getState().myHand;
      if (hand.every(c => c === null)) {
        handDecryptedRef.current = 0; // allow re-trigger
      }
    }, 18000);
    return () => clearTimeout(retry);
  }, [state, round, myPlayer?.alive]);

  const iAmChallenger = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();
  useEffect(() => {
    if (state === 'Challenging' && iAmChallenger && !challengeResolvedRef.current) {
      challengeResolvedRef.current = true;
      setTimeout(revealChallenge, 3000);
    }
    // Non-accuser: if we detect Challenging state and overlay isn't showing, show it
    if (state === 'Challenging' && !challengePhase) {
      const accuserIdx = currentTurnIndex;
      const accusedIdx = players.findIndex(p => p.addr?.toLowerCase() === lastClaimant?.toLowerCase());
      setChallengeAccuser(accuserIdx);
      setChallengeAccused(accusedIdx >= 0 ? accusedIdx : 0);
      setChallengePhase('revealing');
      // Hard timeout: dismiss after 30s if still stuck
      setTimeout(() => {
        if (useGameStore.getState().state === 'Challenging') setChallengePhase(null);
      }, 30000);
    }
  }, [state, iAmChallenger, challengePhase, currentTurnIndex, lastClaimant, players]);

  // Drive challenge overlay phases based on state transitions
  useEffect(() => {
    if (prevStateRef.current === 'PlayerTurn' && state === 'Challenging') {
      const accuserIdx = currentTurnIndex;
      const accusedIdx = players.findIndex(p => p.addr?.toLowerCase() === lastClaimant?.toLowerCase());
      setChallengeAccuser(accuserIdx);
      setChallengeAccused(accusedIdx >= 0 ? accusedIdx : 0);
      setChallengePhase('accusation');
      sounds.gong();
      setTimeout(() => { setChallengePhase('revealing'); sounds.cardFlip(); }, 2000);
    }
    if ((prevStateRef.current === 'Challenging' && state === 'Spinning') ||
        (challengePhase === 'revealing' && state === 'Spinning')) {
      // Verdict: check pendingSpinner to determine who was caught
      const pendingSpinner = useGameStore.getState().pendingSpinner;
      const spinnerIsAccused = pendingSpinner?.toLowerCase() === players[challengeAccused]?.addr?.toLowerCase();
      setChallengePhase(spinnerIsAccused ? 'verdict-lie' : 'verdict-valid');
      setTimeout(() => setChallengePhase(null), 4000);
    }
    // If state moved past Spinning and overlay is still showing, dismiss it
    if ((state === 'PlayerTurn' || state === 'GameOver') && challengePhase) {
      setChallengePhase(null);
    }
    prevStateRef.current = state;
  }, [state, currentTurnIndex, lastClaimant, players, challengeAccused, challengePhase]);

  const isMyTurn = players[currentTurnIndex]?.addr?.toLowerCase() === address?.toLowerCase();
  const playerCount = players.filter((p) => p.addr !== '0x0000000000000000000000000000000000000000').length;
  const isHost = players[0]?.addr?.toLowerCase() === address?.toLowerCase();
  const canStart = state === 'WaitingForPlayers' && isHost && playerCount === 4;
  const hasClaimToChallenge = lastClaimant && lastClaimant !== '0x0000000000000000000000000000000000000000' && lastClaimant.toLowerCase() !== address?.toLowerCase();
  const hasCardsLeft = playedCards.length < (mode === 'chaos' ? 3 : 5);

  const startGame = async () => {
    setError(''); setLoading(true);
    try {
      const gas = await getGasOverrides(publicClient!);
      const hash = await writeContractAsync({ address: GAME_ADDRESS, abi: GAME_ABI, functionName: 'startGame', args: [BigInt(id!)], ...gas });
      await publicClient!.waitForTransactionReceipt({ hash });
      notifyStateChanged();
      sounds.gameStart();
    } catch (e: any) { setError(e.shortMessage || e.message); }
    setLoading(false);
  };

  const playCards = async () => {
    if (selectedCards.length === 0) return;
    setError('');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gas = await getGasOverrides(publicClient!);
        if (mode === 'chaos') {
          await writeContractAsync({ address: GAME_ADDRESS, abi: GAME_ABI, functionName: 'playCard', args: [BigInt(id!), selectedCards[0]], ...gas });
        } else {
          await writeContractAsync({ address: GAME_ADDRESS, abi: GAME_ABI, functionName: 'playCards', args: [BigInt(id!), selectedCards.map((i) => i)], ...gas });
        }
        markCardsPlayed(selectedCards);
        notifyStateChanged();
        sounds.cardsFlip();
        return;
      } catch (e: any) {
        const msg = e.shortMessage || e.message || '';
        if (/user rejected|denied/i.test(msg)) { setError(''); return; }
        if (attempt < 2 && /gas|fee|insufficient/i.test(msg)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        setError(msg || 'Transaction failed');
      }
    }
  };

  const callLiar = async () => {
    setError('');
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const gas = await getGasOverrides(publicClient!);
        await writeContractAsync({ address: GAME_ADDRESS, abi: GAME_ABI, functionName: 'callLiar', args: [BigInt(id!)], ...gas });
        notifyStateChanged();
        sounds.liar();
        return;
      } catch (e: any) {
        const msg = e.shortMessage || e.message || '';
        if (/user rejected|denied/i.test(msg)) { setError(''); return; }
        if (attempt < 2 && /gas|fee|insufficient/i.test(msg)) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        setError(msg || 'Transaction failed');
      }
    }
  };

  // Get opponents (everyone except me)
  const opponents = players.filter((_, i) => i !== myIndex).filter(p => p.addr !== '0x0000000000000000000000000000000000000000');


  const myCharacter = useGameStore((s) => s.myCharacter);

  // Characters from chain — each player's characterId is stored on-chain
  const charForSeat = (seatIdx: number) => {
    const player = players[seatIdx];
    if (player && player.addr !== '0x0000000000000000000000000000000000000000') {
      return CHARACTERS[player.characterId % CHARACTERS.length];
    }
    return CHARACTERS[seatIdx % CHARACTERS.length];
  };

  const CHARS = [0,1,2,3].map(i => charForSeat(i).img);
  const CHAR_NAMES = [0,1,2,3].map(i => charForSeat(i).name);
  const CHARS_DEAD = [0,1,2,3].map(i => charForSeat(i).dead);
  // Basic: 0=Ace,1=King,2=Queen,3=Joker,4=Devil | Chaos: 0=King,1=Queen,2=Master,3=Chaos
  const CARD_IMGS = mode === 'chaos'
    ? ['/playing_card/king1.png', '/playing_card/queen1.png', '/playing_card/master1.png', '/playing_card/chaos1.png']
    : ['/playing_card/ace1.png', '/playing_card/king1.png', '/playing_card/queen1.png', '/playing_card/joker1.png', '/playing_card/devil1.png'];

  const RULES: Record<string, string[]> = {
    basic: ['Play 1-3 cards, claim they match the table card', 'Jokers are wild (always valid)', 'Call LIAR to challenge — loser faces Roulette', 'Last player standing wins'],
    devil: ['Same as Basic + one Devil Card in deck', 'Devil can only be played alone', 'If Devil is revealed on challenge, ALL others face Roulette'],
    chaos: ['12 cards, 3 per player, play 1 per turn', 'Winner of challenge shoots an opponent', 'Master: accused shoots someone', 'Chaos: everyone shoots simultaneously'],
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <SpinAnimation outcome={outcome} spinning={spinning} onDismiss={clearOutcome} />
      <ChallengeOverlay phase={challengePhase} accuserIndex={challengeAccuser} accusedIndex={challengeAccused} onDismiss={() => setChallengePhase(null)} />

      {/* Nav */}
      <nav style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 1rem', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid #3a2a1a', zIndex: 100 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.7rem', color: '#8b7b5a', letterSpacing: '0.1em' }}>TABLE #{id}</span>
          {mode !== 'basic' && <span style={{ fontSize: '0.55rem', padding: '0.1rem 0.4rem', borderRadius: '0.2rem', background: mode === 'devil' ? '#e9456030' : '#a855f730', color: mode === 'devil' ? '#e94560' : '#a855f7', border: `1px solid ${mode === 'devil' ? '#e94560' : '#a855f7'}` }}>{mode.toUpperCase()}</span>}
          {stakeAmount > 0n && <span style={{ fontSize: '0.6rem', padding: '0.1rem 0.4rem', borderRadius: '0.2rem', background: '#22c55e20', color: '#22c55e', border: '1px solid #22c55e' }}>{Number(stakeAmount) / 1e6} USDC x4</span>}
        </div>
        {state !== 'WaitingForPlayers' && state !== 'GameOver' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <span style={{ fontSize: '0.85rem', color: '#c9a84c' }}>Round {round}</span>
            <img src="/hourglass.png" alt="" className="hourglass-spin" style={{ width: 20, height: 20 }} />
            <Timer />
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.65rem', color: '#c9a84c', fontFamily: 'monospace' }}>{address ? shortenAddress(address) : ''}</span>
          <button onClick={() => setMuted(toggleMute())} style={{ width: 22, height: 22, borderRadius: '50%', background: 'none', border: '1.5px solid #5a4a3a', color: muted ? '#e94560' : '#8b7b5a', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{muted ? '♪' : '♫'}</button>
          <button onClick={() => setShowRules(true)} style={{ width: 22, height: 22, borderRadius: '50%', background: 'none', border: '1.5px solid #5a4a3a', color: '#8b7b5a', fontSize: '0.7rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>?</button>
        </div>
      </nav>

      {/* Opponents */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '2.5rem', padding: '1rem 1.5rem', zIndex: 20 }}>
        {opponents.map((p, i) => {
          const pIdx = players.indexOf(p);
          const isTurn = pIdx === currentTurnIndex;
          const chambers = chamberPointers[p.addr?.toLowerCase()] || 0;
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', opacity: !p.alive ? 0.4 : 1, transform: isTurn ? 'scale(1.08)' : 'scale(0.95)', transition: 'transform 0.3s' }}>
              <div className={`player-card ${!p.alive ? 'dead' : ''} ${isTurn ? 'active' : ''}`} style={{ backgroundImage: `url(${p.alive ? CHARS[pIdx] : CHARS_DEAD[pIdx]})`, width: 110, height: 110 }}>
                <span className="player-name" style={{ fontSize: '0.75rem' }}>{CHAR_NAMES[pIdx]}</span>
              </div>
              <div className="chambers">
                {Array.from({ length: 6 }, (_, j) => <div key={j} className={`chamber ${j < chambers ? 'safe' : ''}`} style={{ width: 10, height: 10 }} />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Center */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
        {state !== 'WaitingForPlayers' && state !== 'GameOver' && state !== 'Spinning' && (
          <div className="target-card" style={{ backgroundImage: `url(${CARD_IMGS[targetCard]})`, marginBottom: '1rem', width: '6rem', height: '8.5rem' }} />
        )}

        {lastClaimant && lastClaimant !== '0x0000000000000000000000000000000000000000' && state === 'PlayerTurn' && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem', marginBottom: '0.8rem' }}>
            <div style={{ display: 'flex' }}>
              {Array.from({ length: lastClaimCount }, (_, i) => (
                <div key={i} className="playing-card" style={{ backgroundImage: 'url(/playing_card/back1.png)', width: '4rem', marginLeft: i > 0 ? '-1rem' : 0 }} />
              ))}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#dfd5b4', fontStyle: 'italic' }}>claims {lastClaimCount} {targetName(targetCard, mode)}{lastClaimCount > 1 ? 's' : ''}</span>
          </div>
        )}

        {state === 'WaitingForPlayers' && (
          <div style={{ textAlign: 'center' }}>
            <h2 style={{ fontSize: '1.8rem', color: '#c9a84c', marginBottom: '1rem' }}>Table #{id}</h2>
            <p style={{ color: '#8b7b5a', marginBottom: '1rem' }}>{playerCount}/4 seated</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {[0,1,2,3].map(i => (
                <div key={i} className={`player-card`} style={{ backgroundImage: i < playerCount ? `url(${CHARS[i]})` : 'none', width: 80, height: 80, opacity: i < playerCount ? 1 : 0.2, border: i >= playerCount ? '2px dashed #5a4a3a' : undefined }}>
                  {i < playerCount && <span className="player-name" style={{ fontSize: '0.6rem' }}>{CHAR_NAMES[i]}</span>}
                </div>
              ))}
            </div>
            {canStart && <button className="btn green" style={{ fontSize: '1.1rem', padding: '0.7rem 2rem' }} onClick={startGame} disabled={loading}>{loading ? 'Dealing...' : 'Deal the Cards'}</button>}
            {error && <p style={{ color: '#ffb4ab', fontSize: '0.7rem', marginTop: '0.5rem' }}>{error}</p>}
            <p style={{ color: '#5a4a3a', fontSize: '0.65rem', marginTop: '1rem' }}>Table #{id}</p>
            <button onClick={() => { const url = `${window.location.origin}/lobby?join=${id}&mode=${mode}`; navigator.clipboard.writeText(url); setError('Link copied!'); setTimeout(() => setError(''), 2000); }} className="btn" style={{ marginTop: '0.5rem', fontSize: '0.8rem', padding: '0.4rem 1.2rem' }}>
              Copy Invite Link
            </button>
          </div>
        )}

        {state === 'Challenging' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '1.2rem', color: '#e94560' }}>Revealing cards...</p>
            {iAmChallenger && !resolving && <button className="btn" style={{ marginTop: '0.8rem' }} onClick={revealChallenge}>Reveal</button>}
            {resolving && <p style={{ fontSize: '0.7rem', color: '#8b7b5a', marginTop: '0.5rem' }}>Decrypting via FHE...</p>}
          </div>
        )}

        {state === 'Spinning' && (
          <div style={{ textAlign: 'center' }}>
            <div className="heartbeat-vignette" />
            {isMySpinTurn ? (
              <>
                <img src="/revolver_chamber.png" alt="" className="revolver-spin" style={{ width: 120, margin: '0 auto 1rem' }} />
                <p style={{ fontSize: '1.1rem', color: '#dfd5b4', marginBottom: '1rem' }}>Your turn to pull...</p>
                {spinning && <p style={{ color: '#e94560', fontSize: '0.9rem' }}>Resolving spin...</p>}
                {spinning && <p style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>Resolving...</p>}
              </>
            ) : (
              <p style={{ color: '#8b7b5a' }}>Waiting for trigger pull...</p>
            )}
          </div>
        )}


        {state === 'GameOver' && (
          <div style={{ textAlign: 'center' }} id="game-result-card">
            <h2 style={{ fontSize: '2.2rem', color: '#c9a84c', marginBottom: '1.5rem' }}>WINNER!</h2>
            {(() => {
              const winnerPlayer = players.find(p => p.alive && p.addr !== '0x0000000000000000000000000000000000000000');
              const winnerChar = winnerPlayer ? CHARACTERS[winnerPlayer.characterId % CHARACTERS.length] : CHARACTERS[0];
              return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
                  <img src="/crown.png" alt="" style={{ width: 50, filter: 'drop-shadow(0 0 12px #fff08d67)' }} />
                  <div className="player-card" style={{ backgroundImage: `url(${winnerChar.img})`, width: 130, height: 130, boxShadow: '0 0 24px #c9a84c50' }} />
                  <span style={{ fontSize: '1.3rem', color: '#c9a84c', fontWeight: 700 }}>{winnerChar.name}</span>
                  {winnerPlayer && <span style={{ fontSize: '0.7rem', color: '#8b7b5a', fontFamily: 'monospace' }}>{shortenAddress(winnerPlayer.addr)}</span>}
                  {stakeAmount > 0n && <span style={{ fontSize: '0.85rem', color: '#22c55e', marginTop: '0.3rem' }}>Won {Number(stakeAmount * 4n * 95n / 100n) / 1e6} USDC</span>}
                </div>
              );
            })()}
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
              {players.filter(p => p.addr !== '0x0000000000000000000000000000000000000000' && !p.alive).map((p, i) => {
                const c = CHARACTERS[p.characterId % CHARACTERS.length];
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', opacity: 0.4 }}>
                    <div className="player-card dead" style={{ backgroundImage: `url(${c.dead})`, width: 60, height: 60 }} />
                    <span style={{ fontSize: '0.55rem', color: '#5a4a3a' }}>{c.name}</span>
                  </div>
                );
              })}
            </div>
            <button className="btn green" onClick={() => navigate('/lobby')}>Another Round</button>
            <div style={{ display: 'flex', gap: '0.8rem', marginTop: '1rem', justifyContent: 'center' }}>
              <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                // Download result as image
                const el = document.getElementById('game-result-card');
                if (!el) return;
                import('html-to-image').then(({ toPng }) => {
                  toPng(el).then((url) => {
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `bluff-barrel-result-${id}.png`;
                    a.click();
                  });
                }).catch(() => alert('Install html-to-image for download'));
              }}>Download Result</button>
              <button className="btn" style={{ fontSize: '0.8rem', padding: '0.4rem 1rem' }} onClick={() => {
                const winnerP = players.find(p => p.alive && p.addr !== '0x0000000000000000000000000000000000000000');
                const winnerName = winnerP ? CHARACTERS[winnerP.characterId % CHARACTERS.length].name : 'Unknown';
                const pot = stakeAmount > 0n ? `${Number(stakeAmount * 4n) / 1e6} USDC` : 'bragging rights';
                const text = `I just played Bluff and Barrel! ${winnerName} won ${pot} in ${mode} mode. On-chain deception powered by @FhenixIO FHE.`;
                window.open(`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin)}`, '_blank');
              }}>Share on X</button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom — Hand + Actions */}
      {myPlayer?.alive && (state === 'PlayerTurn' || state === 'Challenging' || state === 'Spinning') && (
        <div style={{ padding: '1rem 1.5rem', background: 'rgba(0,0,0,0.5)', borderTop: '1px solid #3a2a1a', zIndex: 20 }}>
          <div className="chambers" style={{ justifyContent: 'center', marginBottom: '0.6rem' }}>
            {Array.from({ length: 6 }, (_, i) => <div key={i} className={`chamber ${i < (chamberPointers[address?.toLowerCase() || ''] || 0) ? 'safe' : ''}`} style={{ width: 12, height: 12 }} />)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.8rem' }}>
            {myHand.slice(0, mode === 'chaos' ? 3 : 5).map((card, i) => {
              if (playedCards.includes(i)) return <div key={i} style={{ width: '5.5rem', aspectRatio: '1/1.4', borderRadius: '0.3rem', border: '1px dashed #3a2a1a', opacity: 0.15 }} />;
              return (
                <div key={i}
                  className={`playing-card ${selectedCards.includes(i) ? 'selected' : ''}`}
                  style={{ backgroundImage: card !== null ? `url(${CARD_IMGS[card]})` : 'url(/playing_card/back1.png)', width: '5.5rem', cursor: card !== null ? 'pointer' : 'default', opacity: card === null ? 0.5 : 1 }}
                  onClick={() => card !== null && toggleCard(i)}
                />
              );
            })}
          </div>
          {state === 'PlayerTurn' && isMyTurn && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem' }}>
              {hasCardsLeft && <button className="btn green" style={{ fontSize: '1rem', padding: '0.6rem 1.5rem' }} disabled={selectedCards.length === 0} onClick={playCards}>Play {selectedCards.length || ''} as {targetName(targetCard, mode)}</button>}
              {hasClaimToChallenge && <button className="btn red" style={{ fontSize: '1rem', padding: '0.6rem 1.5rem' }} onClick={callLiar}>LIAR!</button>}
              {!hasCardsLeft && !hasClaimToChallenge && <span style={{ fontSize: '0.8rem', color: '#8b7b5a' }}>Waiting...</span>}
            </div>
          )}
          {state === 'PlayerTurn' && !isMyTurn && <p style={{ textAlign: 'center', fontSize: '0.85rem', color: '#8b7b5a' }}>Waiting for {CHAR_NAMES[currentTurnIndex]}...</p>}
          {error && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginTop: '0.4rem' }}>
            <p style={{ fontSize: '0.7rem', color: '#ffb4ab' }}>{error}</p>
            <button onClick={() => { setError(''); }} style={{ fontSize: '0.6rem', color: '#c9a84c', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>dismiss</button>
          </div>}
        </div>
      )}

      {false && (
        <div style={{ position: 'fixed', bottom: 8, left: 8, zIndex: 40, fontSize: '0.6rem', color: '#c9a84c' }}>Initializing encryption...</div>
      )}

      {showRules && (
        <div onClick={() => setShowRules(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} className="paperboard-panel" style={{ padding: '1.5rem', width: 340 }}>
            <h3 style={{ fontSize: '1.1rem', color: '#2a1a0a', marginBottom: '0.8rem' }}>{mode.charAt(0).toUpperCase() + mode.slice(1)} Mode</h3>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {RULES[mode].map((r, i) => (
                <li key={i} style={{ fontSize: '0.75rem', color: '#3a2a1a', paddingLeft: '0.8rem', borderLeft: '2px solid #8b7b5a' }}>{r}</li>
              ))}
            </ul>
            <button className="btn" onClick={() => setShowRules(false)} style={{ marginTop: '1rem', width: '100%', padding: '0.4rem' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
