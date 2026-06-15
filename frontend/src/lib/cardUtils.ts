export const CARD_NAMES = ['Ace', 'King', 'Queen', 'Joker'] as const;
export const TARGET_NAMES = ['Ace', 'King', 'Queen'] as const;
export const CARD_EMOJIS = ['🂡', '🂮', '🂭', '🃏'] as const;

export function cardName(value: number): string {
  return CARD_NAMES[value] ?? 'Unknown';
}

export function cardEmoji(value: number): string {
  return CARD_EMOJIS[value] ?? '?';
}

export function targetName(value: number, mode?: string): string {
  if (mode === 'chaos') {
    const CHAOS_TARGETS = ['King', 'Queen'];
    return CHAOS_TARGETS[value] ?? 'Unknown';
  }
  return TARGET_NAMES[value] ?? 'Unknown';
}

export function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}
