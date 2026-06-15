import { useGameStore } from '../../stores/gameStore';
import { useMyHand } from '../../hooks/useMyHand';
import { cardName, cardEmoji } from '../../lib/cardUtils';

export default function CardHand() {
  const myHand = useGameStore((s) => s.myHand);
  const selectedCards = useGameStore((s) => s.selectedCards);
  const playedCards = useGameStore((s) => s.playedCards);
  const toggleCard = useGameStore((s) => s.toggleCard);
  const cofheReady = useGameStore((s) => s.cofheReady);
  const { decryptHand } = useMyHand();

  const allNull = myHand.every((c) => c === null);

  return (
    <div className="bg-bar-panel rounded-xl p-6">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm text-gray-400">Your Hand</h3>
        {cofheReady && (
          <button onClick={decryptHand} className="text-xs text-bar-gold hover:underline">
            🔄 Decrypt
          </button>
        )}
      </div>

      {!cofheReady && <p className="text-center text-yellow-400 text-sm animate-pulse">Waiting for encryption init...</p>}

      {cofheReady && allNull && (
        <div className="text-center">
          <button onClick={decryptHand} className="px-4 py-2 bg-bar-gold text-black rounded-lg font-bold text-sm">
            🔓 Reveal Cards
          </button>
        </div>
      )}

      <div className="flex gap-3 justify-center mt-2">
        {myHand.map((card, i) => {
          const isPlayed = playedCards.includes(i);
          const isSelected = selectedCards.includes(i);
          const isDecrypted = card !== null;

          if (isPlayed) {
            return (
              <div key={i} className="w-16 h-24 rounded-lg border-2 border-gray-700 bg-gray-800/50 flex items-center justify-center opacity-30">
                <span className="text-xs text-gray-500">played</span>
              </div>
            );
          }

          return (
            <button
              key={i}
              onClick={() => isDecrypted && toggleCard(i)}
              disabled={!isDecrypted}
              className={`w-16 h-24 rounded-lg border-2 flex flex-col items-center justify-center text-lg font-bold transition-all
                ${isSelected ? 'border-bar-gold bg-bar-gold/20 -translate-y-2 shadow-lg' : 'border-gray-600 bg-bar-card hover:border-gray-400'}
                ${!isDecrypted ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
            >
              {isDecrypted ? (
                <>
                  <span className="text-2xl">{cardEmoji(card)}</span>
                  <span className="text-xs mt-1">{cardName(card)}</span>
                </>
              ) : (
                <span className="text-2xl animate-pulse">🔒</span>
              )}
            </button>
          );
        })}
      </div>
      {selectedCards.length > 0 && (
        <p className="text-center text-sm text-bar-gold mt-2">{selectedCards.length} card(s) selected</p>
      )}
    </div>
  );
}
