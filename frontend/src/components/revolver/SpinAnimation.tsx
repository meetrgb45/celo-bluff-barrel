import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { SpinOutcome } from '../../hooks/useSpin';
import { sounds } from '../../lib/sounds';

interface Props {
  outcome: SpinOutcome;
  spinning: boolean;
  onDismiss: () => void;
}

export default function SpinAnimation({ outcome, spinning, onDismiss }: Props) {
  useEffect(() => {
    if (spinning && !outcome) sounds.revolverSpin();
    if (outcome === 'click') sounds.click();
    if (outcome === 'bang') sounds.gunShot();
  }, [spinning, outcome]);
  return (
    <AnimatePresence>
      {(spinning || outcome) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={outcome === 'bang' ? 'overlay-bang' : outcome === 'click' ? 'overlay-safe' : ''}
          style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.85)' }}
          onClick={outcome ? onDismiss : undefined}
        >
          {/* Spinning */}
          {spinning && !outcome && (
            <motion.div style={{ textAlign: 'center' }}>
              <img src="/revolver_chamber.png" alt="" className="revolver-spin" style={{ width: 150, margin: '0 auto 1.5rem' }} />
              <p style={{ fontSize: '1.2rem', color: '#dfd5b4', fontStyle: 'italic' }}>Pulling the trigger...</p>
            </motion.div>
          )}

          {/* CLICK */}
          {outcome === 'click' && (
            <motion.div initial={{ scale: 0.5 }} animate={{ scale: 1 }} style={{ textAlign: 'center' }}>
              <img src="/revolver_chamber.png" alt="" style={{ width: 100, margin: '0 auto 1rem', opacity: 0.3 }} />
              <h1 style={{ fontSize: '3.5rem', color: '#8b8b8b', fontStyle: 'italic', textShadow: '0 0 10px rgba(150,150,150,0.3)' }}>*click*</h1>
              <p style={{ fontSize: '1rem', color: '#abcfb8', marginTop: '0.5rem' }}>Survived.</p>
              <p style={{ fontSize: '0.75rem', color: '#8b7b5a', fontStyle: 'italic', marginTop: '0.3rem' }}>You live... for now.</p>
              <p style={{ fontSize: '0.6rem', color: '#5a4a3a', marginTop: '2rem' }}>tap to continue</p>
            </motion.div>
          )}

          {/* BANG */}
          {outcome === 'bang' && (
            <motion.div initial={{ scale: 2, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ textAlign: 'center' }}>
              <img src="/boom.png" alt="" style={{ width: 80, margin: '0 auto 1rem', filter: 'drop-shadow(0 0 20px #e94560)' }} />
              <h1 style={{ fontSize: '4rem', color: '#e94560', textShadow: '0 0 30px rgba(233,69,96,0.8), 0 0 60px rgba(139,26,26,0.5)', textTransform: 'uppercase' }}>BANG!</h1>
              <p style={{ fontSize: '1rem', color: '#ffb4ab', marginTop: '0.5rem' }}>Eliminated.</p>
              <p style={{ fontSize: '0.6rem', color: '#5a4a3a', marginTop: '2rem' }}>tap to continue</p>
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
