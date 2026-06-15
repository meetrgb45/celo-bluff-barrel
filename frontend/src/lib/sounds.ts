let muted = localStorage.getItem('sound_muted') === 'true';

export function isMuted() { return muted; }

export function toggleMute() {
  muted = !muted;
  localStorage.setItem('sound_muted', String(muted));
  return muted;
}

export function playSound(src: string, volume = 0.5) {
  if (muted) return;
  const audio = new Audio(src);
  audio.volume = volume;
  audio.play().catch(() => {});
}

// Preloaded sound shortcuts
export const sounds = {
  cardFlip: () => playSound('/sound/single_card_flip.mp3'),
  cardsFlip: () => playSound('/sound/cards_flip.mp3'),
  liar: () => playSound('/sound/liar.mp3', 0.7),
  gunShot: () => playSound('/sound/gun_shot.mp3', 0.8),
  click: () => playSound('/sound/click.mp3', 0.6),
  revolverSpin: () => playSound('/sound/revolver_spin.mp3', 0.6),
  whoosh: () => playSound('/sound/whoosh.mp3', 0.4),
  gameStart: () => playSound('/music/game_start.mp3', 0.5),
  gameOver: () => playSound('/sound/player_game_over.mp3', 0.7),
  gong: () => playSound('/sound/gong.mp3', 0.5),
};
