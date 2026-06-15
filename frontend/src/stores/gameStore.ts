import { create } from 'zustand';

export type GameState = 'WaitingForPlayers' | 'PlayerTurn' | 'Challenging' | 'Spinning' | 'GameOver';

// Basic mode only — Dealing state removed (server deals, no on-chain state for it)
const STATE_MAP: GameState[] = ['WaitingForPlayers', 'PlayerTurn', 'Challenging', 'Spinning', 'GameOver'];

export function getStateMap(_mode: string): GameState[] {
  return STATE_MAP;
}

export interface PlayerInfo {
  addr: string;
  alive: boolean;
  points: number;
  usedExecute: boolean;
  usedDoubleSpin: boolean;
  characterId: number;
}

interface GameStore {
  gameId: number | null;
  gameMode: 'basic';
  state: GameState;
  round: number;
  targetCard: number;
  currentTurnIndex: number;
  aliveCount: number;
  winner: string;
  players: PlayerInfo[];
  myHand: (number | null)[];       // card values received from WS server
  myHandSalt: string | null;       // salt for hand commitment, stored for revealChallenge
  playedCards: number[];
  selectedCards: boolean[];        // per-slot selection
  lastClaimant: string;
  lastClaimCount: number;
  chamberPointers: Record<string, number>;
  pendingSpinner: string;
  myCharacter: number;
  stakeAmount: bigint;
  // Actions
  setGameId: (id: number | null) => void;
  setMyCharacter: (idx: number) => void;
  setStakeAmount: (amount: bigint) => void;
  setMyHand: (hand: number[], salt: string) => void;
  toggleCard: (index: number) => void;
  clearSelection: () => void;
  markCardsPlayed: (indices: number[]) => void;
  resetRound: () => void;
  updateFromChain: (data: { state: number; round: number; targetCard: number; currentTurnIndex: number; aliveCount: number; winner: string }) => void;
  setPlayers: (players: PlayerInfo[]) => void;
  setLastClaim: (claimant: string, count: number) => void;
  setChamberPointers: (pointers: Record<string, number>) => void;
  setPendingSpinner: (addr: string) => void;
}

export const useGameStore = create<GameStore>((set) => ({
  gameId: null,
  gameMode: 'basic',
  state: 'WaitingForPlayers',
  round: 0,
  targetCard: 0,
  currentTurnIndex: 0,
  aliveCount: 0,
  winner: '',
  players: [],
  myHand: [null, null, null, null, null],
  myHandSalt: null,
  playedCards: [],
  selectedCards: [false, false, false, false, false],
  lastClaimant: '',
  lastClaimCount: 0,
  chamberPointers: {},
  pendingSpinner: '',
  myCharacter: Number(localStorage.getItem('myCharacter') || 0),
  stakeAmount: 0n,

  setGameId: (id) => set({ gameId: id }),
  setMyCharacter: (idx) => { localStorage.setItem('myCharacter', String(idx)); set({ myCharacter: idx }); },
  setStakeAmount: (amount) => set({ stakeAmount: amount }),

  setMyHand: (hand, salt) => set({
    myHand: hand,
    myHandSalt: salt,
    playedCards: [],
    selectedCards: [false, false, false, false, false],
  }),

  toggleCard: (index) => set((s) => {
    if (s.playedCards.includes(index)) return s;
    if (s.state !== 'PlayerTurn') return s;
    const selectedCount = s.selectedCards.filter(Boolean).length;
    const isSelected = s.selectedCards[index];
    if (!isSelected && selectedCount >= 3) return s; // max 3
    const next = [...s.selectedCards];
    next[index] = !next[index];
    return { selectedCards: next };
  }),

  clearSelection: () => set({ selectedCards: [false, false, false, false, false] }),

  markCardsPlayed: (indices) => set((s) => ({
    playedCards: [...s.playedCards, ...indices],
    selectedCards: [false, false, false, false, false],
  })),

  resetRound: () => set({
    myHand: [null, null, null, null, null],
    myHandSalt: null,
    playedCards: [],
    selectedCards: [false, false, false, false, false],
  }),

  updateFromChain: (data) => set((s) => {
    const newState = STATE_MAP[Number(data.state)] ?? 'WaitingForPlayers';
    const prev = s.state;
    // Reset round state when a new round starts
    const isNewRound = data.round !== s.round;
    return {
      state: newState,
      round: data.round,
      targetCard: data.targetCard,
      currentTurnIndex: data.currentTurnIndex,
      aliveCount: data.aliveCount,
      winner: data.winner,
      ...(isNewRound ? {
        myHand: [null, null, null, null, null],
        myHandSalt: null,
        playedCards: [],
        selectedCards: [false, false, false, false, false],
      } : {}),
    };
  }),

  setPlayers: (players) => set({ players }),
  setLastClaim: (claimant, count) => set({ lastClaimant: claimant, lastClaimCount: count }),
  setChamberPointers: (pointers) => set({ chamberPointers: pointers }),
  setPendingSpinner: (addr) => set({ pendingSpinner: addr }),
}));
