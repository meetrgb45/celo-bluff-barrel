import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../stores/gameStore';
import { targetName } from '../../lib/cardUtils';
import { CHARACTERS } from '../../lib/characters';

type Phase = 'accusation' | 'revealing' | 'verdict-lie' | 'verdict-valid' | null;

interface Props {
  phase: Phase;
  accuserIndex: number;
  accusedIndex: number;
  onDismiss: () => void;
}

export default function ChallengeOverlay({ phase, accuserIndex, accusedIndex, onDismiss }: Props) {
  const lastClaimCount = useGameStore((s) => s.lastClaimCount);
  const targetCard = useGameStore((s) => s.targetCard);
  const revealedCards = useGameStore((s) => s.revealedCards);
  const players = useGameStore((s) => s.players);
  const gameMode = useGameStore((s) => s.gameMode);

  // Get character from on-chain data
  const charFor = (idx: number) => {
    const p = players[idx];
    if (p && p.characterId !== undefined) return CHARACTERS[p.characterId % CHARACTERS.length];
    return CHARACTERS[idx % CHARACTERS.length];
  };

  const accuserChar = charFor(accuserIndex);
  const accusedChar = charFor(accusedIndex);

  // Card images depend on mode
  const CARD_IMGS = gameMode === 'chaos'
    ? ['/playing_card/king1.png', '/playing_card/queen1.png', '/playing_card/master1.png', '/playing_card/chaos1.png']
    : ['/playing_card/ace1.png', '/playing_card/king1.png', '/playing_card/queen1.png', '/playing_card/joker1.png', '/playing_card/devil1.png'];

  // Check if a card is valid (matches target or is wild)
  const isCardValid = (card: number) => {
    if (gameMode === 'chaos') return card === targetCard || card === 2 || card === 3; // master/chaos always valid
    return card === targetCard || card === 3 || card === 4; // joker/devil always valid
  };

  return (
    <AnimatePresence>
      {phase && (
      <motion.div
        key={phase}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        onClick={phase.startsWith('verdict') ? onDismiss : undefined}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle, transparent 40%, rgba(139,26,26,0.3) 100%), rgba(0,0,0,0.92)' }} />

        {/* ACCUSATION */}
        {phase === 'accusation' && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 8 }} style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <motion.h1 animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 2 }} style={{ fontSize: '5rem', color: '#e94560', fontStyle: 'italic', textShadow: '0 0 20px rgba(233,69,96,0.8), 0 0 40px rgba(139,26,26,0.6)', marginBottom: '2rem' }}>
              LIAR!
            </motion.h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '3rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div className="player-card" style={{ backgroundImage: `url(${accuserChar.img})`, width: 100, height: 100, boxShadow: '0 0 20px rgba(201,168,76,0.4)' }} />
                <span style={{ fontSize: '0.9rem', color: '#c9a84c' }}>{accuserChar.name}</span>
                <span style={{ fontSize: '0.6rem', color: '#8b7b5a' }}>ACCUSER</span>
              </div>
              <span style={{ fontSize: '1.5rem', color: '#8b7b5a', fontStyle: 'italic' }}>vs</span>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <div className="player-card" style={{ backgroundImage: `url(${accusedChar.img})`, width: 100, height: 100, boxShadow: '0 0 20px rgba(233,69,96,0.4)' }} />
                <span style={{ fontSize: '0.9rem', color: '#e94560' }}>{accusedChar.name}</span>
                <span style={{ fontSize: '0.6rem', color: '#8b7b5a' }}>ACCUSED</span>
              </div>
            </div>
            <p style={{ marginTop: '1.5rem', fontSize: '0.8rem', color: '#8b7b5a', fontStyle: 'italic' }}>
              Claimed {lastClaimCount} {targetName(targetCard, gameMode)}{lastClaimCount > 1 ? 's' : ''}
            </p>
          </motion.div>
        )}

        {/* REVEALING */}
        {phase === 'revealing' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <h2 style={{ fontSize: '1.5rem', color: '#dfd5b4', fontStyle: 'italic' }}>Revealing cards...</h2>
            <div style={{ display: 'flex', gap: '0.8rem' }}>
              {revealedCards.length > 0
                ? revealedCards.map((card, i) => (
                    <motion.div key={i} initial={{ rotateY: 180, scale: 0.8 }} animate={{ rotateY: 0, scale: 1 }} transition={{ delay: i * 0.3, type: 'spring' }}
                      style={{ width: 70, height: 100, borderRadius: '0.4rem', backgroundImage: `url(${CARD_IMGS[card] || '/playing_card/back1.png'})`, backgroundSize: 'cover', backgroundPosition: 'center', border: `3px solid ${isCardValid(card) ? '#abcfb8' : '#e94560'}`, boxShadow: isCardValid(card) ? '0 0 12px rgba(171,207,184,0.5)' : '0 0 12px rgba(233,69,96,0.5)' }} />
                  ))
                : Array.from({ length: lastClaimCount }, (_, i) => (
                    <motion.div key={i}
                      animate={{ rotateY: [0, 180, 360] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.2, ease: 'easeInOut' }}
                      style={{ width: 70, height: 100, borderRadius: '0.4rem', backgroundImage: 'url(/playing_card/back1.png)', backgroundSize: 'cover', backgroundPosition: 'center', border: '2px solid #5a4a3a', transformStyle: 'preserve-3d' }} />
                  ))
              }
            </div>
            <p style={{ fontSize: '0.7rem', color: '#8b7b5a' }}>{revealedCards.length > 0 ? 'Cards revealed!' : 'Decrypting via FHE network...'}</p>
            <button onClick={onDismiss} style={{ marginTop: '1rem', fontSize: '0.65rem', color: '#5a4a3a', background: 'none', cursor: 'pointer', textDecoration: 'underline' }}>dismiss</button>
          </motion.div>
        )}

        {/* VERDICT — LIE */}
        {phase === 'verdict-lie' && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 10 }} style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ fontSize: '3rem', color: '#e94560', textShadow: '0 0 20px rgba(233,69,96,0.8)' }}>CAUGHT LYING!</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="player-card" style={{ backgroundImage: `url(${accusedChar.img})`, width: 70, height: 70, boxShadow: '0 0 15px rgba(233,69,96,0.5)' }} />
              <div>
                <p style={{ fontSize: '1rem', color: '#e94560' }}>{accusedChar.name}</p>
                <p style={{ fontSize: '0.8rem', color: '#8b7b5a' }}>must face the revolver</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {revealedCards.length > 0
                ? revealedCards.map((card, i) => (
                    <div key={i} style={{ width: 56, height: 80, borderRadius: '0.3rem', backgroundImage: `url(${CARD_IMGS[card] || '/playing_card/back1.png'})`, backgroundSize: 'cover', border: `2px solid ${isCardValid(card) ? '#abcfb8' : '#e94560'}` }} />
                  ))
                : Array.from({ length: lastClaimCount }, (_, i) => (
                    <div key={i} style={{ width: 56, height: 80, borderRadius: '0.3rem', backgroundImage: 'url(/playing_card/back1.png)', backgroundSize: 'cover', border: '2px solid #e94560' }} />
                  ))
              }
            </div>
            <p style={{ fontSize: '0.6rem', color: '#5a4a3a', marginTop: '1rem' }}>tap to continue</p>
          </motion.div>
        )}

        {/* VERDICT — VALID */}
        {phase === 'verdict-valid' && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 10 }} style={{ position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
            <h1 style={{ fontSize: '3rem', color: '#abcfb8', textShadow: '0 0 20px rgba(171,207,184,0.5)' }}>ALL VALID</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className="player-card" style={{ backgroundImage: `url(${accuserChar.img})`, width: 70, height: 70, boxShadow: '0 0 15px rgba(233,69,96,0.5)' }} />
              <div>
                <p style={{ fontSize: '1rem', color: '#e94560' }}>{accuserChar.name}</p>
                <p style={{ fontSize: '0.8rem', color: '#8b7b5a' }}>false accusation — must face the revolver</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              {revealedCards.length > 0
                ? revealedCards.map((card, i) => (
                    <div key={i} style={{ width: 56, height: 80, borderRadius: '0.3rem', backgroundImage: `url(${CARD_IMGS[card] || '/playing_card/back1.png'})`, backgroundSize: 'cover', border: '2px solid #abcfb8' }} />
                  ))
                : Array.from({ length: lastClaimCount }, (_, i) => (
                    <div key={i} style={{ width: 56, height: 80, borderRadius: '0.3rem', backgroundImage: 'url(/playing_card/back1.png)', backgroundSize: 'cover', border: '2px solid #abcfb8' }} />
                  ))
              }
            </div>
            <p style={{ fontSize: '0.6rem', color: '#5a4a3a', marginTop: '1rem' }}>tap to continue</p>
          </motion.div>
        )}
      </motion.div>
      )}
    </AnimatePresence>
  );
}
