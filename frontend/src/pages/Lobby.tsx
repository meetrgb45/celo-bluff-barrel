import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, usePublicClient } from 'wagmi';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { GAME_ADDRESS, GAME_ABI, USDC_ADDRESS } from '../lib/contracts';
import { CHARACTERS } from '../lib/characters';
import { useGameStore } from '../stores/gameStore';
import { getGasOverrides } from '../lib/gas';

type Mode = 'basic' | 'devil' | 'chaos';

const MODE_CONFIG: Record<Mode, { address: `0x${string}`; abi: any; label: string; rules: string[] }> = {
  basic: { address: GAME_ADDRESS, abi: GAME_ABI, label: 'Basic', rules: [
    '20 cards: 6 Aces, 6 Kings, 6 Queens, 2 Jokers',
    '5 cards dealt to each player',
    'Play 1-3 cards per turn, claim they match the table card',
    'Jokers are always valid (wild)',
    'Call LIAR to challenge — loser faces Russian Roulette',
    'Last player standing wins',
  ]},
  devil: { address: DEVIL_GAME_ADDRESS, abi: DEVIL_GAME_ABI, label: 'Devil', rules: [
    'Same as Basic, plus one Devil Card in the deck',
    'Devil Card replaces one table-type card',
    'Devil can ONLY be played alone (1 card)',
    'If challenged and Devil is revealed — ALL other players face Roulette',
    'The Devil player is safe from retribution',
  ]},
  chaos: { address: CHAOS_GAME_ADDRESS, abi: CHAOS_GAME_ABI, label: 'Chaos', rules: [
    '12 cards: 5 Kings, 5 Queens, 1 Master, 1 Chaos',
    '3 cards per player, play exactly 1 per turn',
    'Winner of challenge SHOOTS an opponent of choice',
    'Master Card: accused gets to shoot someone',
    'Chaos Card: ALL players shoot an opponent simultaneously',
    'Master and Chaos are never considered lies',
  ]},
};

export default function Lobby() {
  const { address, isConnected } = useAccount();
  const { connectors, connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const myCharacter = useGameStore((s) => s.myCharacter);
  const setMyCharacter = useGameStore((s) => s.setMyCharacter);
  const [mode, setMode] = useState<Mode>((searchParams.get('mode') as Mode) || 'basic');
  const [joinId, setJoinId] = useState(searchParams.get('join') || '');
  const [stakeInput, setStakeInput] = useState('');
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [showRules, setShowRules] = useState(false);
  const [inviteStake, setInviteStake] = useState<string | null>(null);

  const isInvite = !!searchParams.get('join');
  const modeContract = MODE_CONFIG[mode];

  // Read stake for invite link
  useEffect(() => {
    if (!isInvite || !publicClient || !joinId) return;
    publicClient.readContract({
      address: modeContract.address, abi: modeContract.abi, functionName: 'getStakeAmount', args: [BigInt(joinId)],
    }).then((s: any) => setInviteStake(Number(s) > 0 ? (Number(s) / 1e6).toString() : 'Free'))
      .catch(() => setInviteStake(null));
  }, [isInvite, publicClient, joinId, modeContract]);

  const createGame = async () => {
    setLoading('Creating...'); setError('');
    try {
      const parsed = stakeInput ? parseFloat(stakeInput) : 0;
      if (isNaN(parsed) || parsed < 0) { setError('Invalid stake amount'); setLoading(''); return; }
      const stakeAmount = BigInt(Math.floor(parsed * 1e6));
      if (stakeAmount > 0n) {
        setLoading('Approving USDC...');
        const approveHash = await writeContractAsync({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [modeContract.address, stakeAmount], ...(await getGasOverrides(publicClient!)) });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
        setLoading('Creating...');
      }
      const hash = await writeContractAsync({ address: modeContract.address, abi: modeContract.abi, functionName: 'createGame', args: [myCharacter, stakeAmount], ...(await getGasOverrides(publicClient!)) });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const gameLogs = receipt.logs.filter(l => l.address.toLowerCase() === modeContract.address.toLowerCase() && l.topics.length >= 2);
      const gameId = gameLogs.length > 0 ? Number(BigInt(gameLogs[0].topics[1]!)) : 0;
      navigate(`/game/${mode}/${gameId}`);
    } catch (e: any) { setError(e.shortMessage || e.message); }
    setLoading('');
  };

  const joinGame = async () => {
    if (!joinId) return;
    setLoading('Joining...'); setError('');
    try {
      const stakeAmount = await publicClient!.readContract({
        address: modeContract.address, abi: modeContract.abi, functionName: 'getStakeAmount', args: [BigInt(joinId)],
      }) as bigint;
      if (stakeAmount > 0n) {
        setLoading('Approving USDC...');
        const approveHash = await writeContractAsync({ address: USDC_ADDRESS, abi: USDC_ABI, functionName: 'approve', args: [modeContract.address, stakeAmount], ...(await getGasOverrides(publicClient!)) });
        await publicClient!.waitForTransactionReceipt({ hash: approveHash });
        setLoading('Joining...');
      }
      const hash = await writeContractAsync({ address: modeContract.address, abi: modeContract.abi, functionName: 'joinGame', args: [BigInt(joinId), myCharacter], ...(await getGasOverrides(publicClient!)) });
      await publicClient!.waitForTransactionReceipt({ hash });
      navigate(`/game/${mode}/${joinId}`);
    } catch (e: any) { setError(e.shortMessage || e.message); }
    setLoading('');
  };

  return (
    <div style={{ width: '100%', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
      <div className="cards-bg">
        {[
          { card: 'ace1', left: '3%', top: '15%', rot: '-12deg' },
          { card: 'king1', left: '88%', top: '8%', rot: '15deg' },
          { card: 'queen1', left: '80%', top: '60%', rot: '-10deg' },
          { card: 'joker1', left: '8%', top: '65%', rot: '22deg' },
          { card: 'back1', left: '50%', top: '85%', rot: '-20deg' },
          { card: 'king1', left: '15%', top: '38%', rot: '8deg' },
          { card: 'ace1', left: '92%', top: '40%', rot: '-16deg' },
          { card: 'queen1', left: '60%', top: '12%', rot: '5deg' },
          { card: 'back1', left: '35%', top: '55%', rot: '-30deg' },
          { card: 'joker1', left: '70%', top: '80%', rot: '18deg' },
        ].map((c, i) => (
          <div key={i} className="floating-card static" style={{
            backgroundImage: `url(/playing_card/${c.card}.png)`,
            left: c.left,
            top: c.top,
            ['--rot' as any]: c.rot,
          }} />
        ))}
      </div>

      <div className="paperboard-panel" style={{ position: 'relative', zIndex: 10, width: 440, padding: '2rem', paddingTop: '5rem' }}>
        {/* Logo */}
        <div style={{ position: 'absolute', top: '-3rem', left: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>
          <div className="game-logo" style={{ position: 'relative' }}>
            <h1 style={{ margin: '2.5rem 3rem', fontSize: '1.6rem', color: '#fff7db', textShadow: '0 0 1px #402011, 0 1px 1px #b27e66, 0 1px 2px #311208, 0 3px 8px #642b18' }}>
              Bluff and Barrel
            </h1>
            <img src="/banner.png" alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', zIndex: -1, filter: 'drop-shadow(0 1px 1px #604c3d) drop-shadow(0 0 2px #281503) drop-shadow(0 4px 16px #361e08)' }} />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
          {/* Mode selector — locked if invite */}
          <div style={{ display: 'flex', gap: '0.5rem', width: '100%', alignItems: 'center' }}>
            {(Object.keys(MODE_CONFIG) as Mode[]).map((m) => (
              <button key={m} onClick={() => !isInvite && setMode(m)} className={`btn ${mode === m ? 'green' : ''}`} style={{
                flex: 1, padding: '0.55rem 0', fontSize: '0.85rem',
                opacity: mode === m ? 1 : 0.4,
                cursor: isInvite ? 'default' : 'pointer',
              }}>
                {MODE_CONFIG[m].label}
              </button>
            ))}
            <button onClick={() => setShowRules(true)} style={{ width: 32, height: 32, borderRadius: '50%', background: '#1a1008', border: '2px solid #5a4a3a', color: '#c9a84c', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
          </div>

          {/* Invite info banner */}
          {isInvite && (
            <div style={{ width: '100%', padding: '0.6rem', background: '#c9a84c15', border: '1px solid #c9a84c40', borderRadius: '0.3rem', textAlign: 'center' }}>
              <p style={{ fontSize: '0.8rem', color: '#dfd5b4', margin: 0 }}>You're invited to Table #{joinId}</p>
              <p style={{ fontSize: '0.7rem', color: '#8b7b5a', margin: '0.2rem 0 0' }}>{MODE_CONFIG[mode].label} Mode {inviteStake ? `• Stake: ${inviteStake === 'Free' ? 'Free' : inviteStake + ' USDC'}` : ''}</p>
            </div>
          )}

          {!isConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', width: '100%' }}>
              {connectors.map((connector) => (
                <button key={connector.uid} className="btn" style={{ width: '100%', padding: '0.6rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                  onClick={() => connect({ connector })}>
                  {connector.icon && <img src={connector.icon} alt="" style={{ width: 20, height: 20, borderRadius: '0.2rem' }} />}
                  {connector.name}
                </button>
              ))}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', paddingBottom: '0.6rem', borderBottom: '1px solid rgba(90,70,50,0.3)' }}>
                <span style={{ fontSize: '0.7rem', color: '#5a4a3a', fontFamily: 'monospace' }}>{address?.slice(0, 6)}...{address?.slice(-4)}</span>
                <button onClick={() => disconnect()} style={{ fontSize: '0.6rem', color: '#8b7b5a', cursor: 'pointer', textDecoration: 'underline', background: 'none' }}>Disconnect</button>
              </div>

              {/* Character carousel */}
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                <button onClick={() => setMyCharacter((myCharacter - 1 + CHARACTERS.length) % CHARACTERS.length)} style={{ width: 40, height: 40, borderRadius: '50%', background: '#2a1a0a', border: 'none', color: '#dfd5b4', fontSize: '1.3rem', cursor: 'pointer' }}>&lt;</button>
                {/* Previous */}
                <div style={{ width: 65, height: 65, borderRadius: '0.3rem', overflow: 'hidden', opacity: 0.4, filter: 'blur(1.5px)', flexShrink: 0 }}>
                  <img src={CHARACTERS[(myCharacter - 1 + CHARACTERS.length) % CHARACTERS.length].img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                {/* Current */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                  <div style={{ width: 100, height: 100, borderRadius: '0.4rem', overflow: 'hidden', boxShadow: '0 0 14px #c9a84c40' }}>
                    <img src={CHARACTERS[myCharacter].img} alt={CHARACTERS[myCharacter].name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <span style={{ fontSize: '0.9rem', color: '#dfd5b4', fontWeight: 600 }}>{CHARACTERS[myCharacter].name}</span>
                </div>
                {/* Next */}
                <div style={{ width: 65, height: 65, borderRadius: '0.3rem', overflow: 'hidden', opacity: 0.4, filter: 'blur(1.5px)', flexShrink: 0 }}>
                  <img src={CHARACTERS[(myCharacter + 1) % CHARACTERS.length].img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <button onClick={() => setMyCharacter((myCharacter + 1) % CHARACTERS.length)} style={{ width: 40, height: 40, borderRadius: '50%', background: '#2a1a0a', border: 'none', color: '#dfd5b4', fontSize: '1.3rem', cursor: 'pointer' }}>&gt;</button>
              </div>

              <button className="btn green" style={{ fontSize: '1.2rem', padding: '0.7rem 2rem', width: '100%' }} onClick={isInvite ? joinGame : createGame} disabled={!!loading}>
                {loading || (isInvite ? 'Sit Down' : 'New Table')}
              </button>

              {!isInvite && (
              <>
              {/* Stake input */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '100%' }}>
                <span style={{ fontSize: '0.7rem', color: '#8b7b5a', whiteSpace: 'nowrap' }}>Stake (USDC)</span>
                <input placeholder="0 = free" value={stakeInput} onChange={(e) => setStakeInput(e.target.value)}
                  style={{ flex: 1, padding: '0.5rem 0.8rem', borderRadius: '0.3rem', background: '#3b260031', color: '#fff', fontSize: '0.9rem', boxShadow: '0 0 2px #85733f, 0 2px 8px #514522 inset' }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', width: '100%' }}>
                <div style={{ flex: 1, height: 1, background: '#8b7b5a40' }} />
                <span style={{ color: '#8b7b5a', fontSize: '0.7rem' }}>OR JOIN</span>
                <div style={{ flex: 1, height: 1, background: '#8b7b5a40' }} />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                <input placeholder="Table #" value={joinId} onChange={(e) => setJoinId(e.target.value)}
                  style={{ flex: 1, padding: '0.6rem 1rem', borderRadius: '0.4rem', background: '#3b260031', color: '#fff', fontSize: '1rem', boxShadow: '0 0 2px #85733f, 0 2px 8px #514522 inset, 0 0 6px #b9974d inset' }} />
                <button className="btn" style={{ padding: '0.6rem 1.2rem' }} onClick={joinGame} disabled={!!loading || !joinId}>
                  {loading === 'Joining...' ? '...' : 'Sit Down'}
                </button>
              </div>
              </>
              )}

              {error && (
                <div style={{ width: '100%', padding: '0.5rem', background: 'rgba(139,26,26,0.2)', border: '1px solid #8b1a1a', borderRadius: '0.3rem', fontSize: '0.65rem', color: '#ffb4ab', wordBreak: 'break-all' }}>
                  {error}
                </div>
              )}
            </>
          )}

          <p style={{ color: '#7a6a5a', fontSize: '0.65rem', marginTop: '0.3rem' }}>4 Players • FHE Encrypted • Arb Sepolia</p>
        </div>
      </div>

      {/* Rules modal */}
      {showRules && (
        <div onClick={() => setShowRules(false)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} className="paperboard-panel" style={{ width: 380, padding: '1.5rem', maxHeight: '80vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: '1.3rem', color: '#2a1a0a', marginBottom: '1rem', textAlign: 'center' }}>{MODE_CONFIG[mode].label} Mode Rules</h2>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {MODE_CONFIG[mode].rules.map((rule, i) => (
                <li key={i} style={{ fontSize: '0.8rem', color: '#3a2a1a', paddingLeft: '1rem', borderLeft: '2px solid #8b7b5a' }}>{rule}</li>
              ))}
            </ul>
            <button className="btn" onClick={() => setShowRules(false)} style={{ marginTop: '1.2rem', width: '100%', padding: '0.5rem' }}>Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
