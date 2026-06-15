import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const phases = [
  {
    date: 'June 1, 2026',
    title: 'Card and Barrel',
    status: 'live',
    img: '/card-barrel.png',
    desc: 'The flagship bluffing game. 4 players, encrypted cards, Russian Roulette. Three modes: Basic, Devil, and Chaos. Stake USDC, last player alive wins the pot.',
    items: ['3 game modes', 'USDC stakes', 'FHE encryption', '8 characters'],
  },
  {
    date: 'End of June 2026',
    title: 'Dice and Barrel',
    status: 'next',
    img: '/dice-barrel.png',
    desc: 'Hidden dice, public bids. Bluff about what the table holds. Get caught? Face the barrel. A game of probability and deception.',
    items: ['5 hidden dice each', 'Bid or call LIAR', 'All-or-nothing reveal', 'Same stake system'],
  },
  {
    date: 'End of July 2026',
    title: 'Slot and Barrel',
    status: 'upcoming',
    img: '/slot-barrel.png',
    desc: 'Encrypted slot machines. Claim your Hearts count. Skulls trigger the Death Spin. The most chaotic mode yet.',
    items: ['3 hidden symbols', 'Death Spin mechanic', 'Hearts bluffing', 'Double chamber risk'],
  },
  {
    date: 'End ofAugust 2026',
    title: 'Character NFTs',
    status: 'upcoming',
    img: '/nft-characters.png',
    desc: 'Your mask, your identity. Mint exclusive characters. Holders get reduced fees and access to premium tables.',
    items: ['20+ unique characters', 'Reduced platform fees', 'Exclusive tables', 'ERC-721 on Arbitrum'],
  },
  {
    date: 'End of September 2026',
    title: '$BLUFF Token',
    status: 'upcoming',
    img: '/token.png',
    desc: 'The game currency with FHE-shielded balances. Nobody sees your stack. Earn by playing, stake for governance.',
    items: ['Shielded balances', 'Play-to-earn', 'Governance', 'Alternative stakes'],
  },
  {
    date: 'October 2026',
    title: 'Theme NFTs',
    status: 'upcoming',
    img: '/themes.png',
    desc: 'Transform the entire game. Cyberpunk neon, Wild West saloon, deep space station. Your table, your world.',
    items: ['5+ full themes', 'Cards + weapons + UI', 'Host applies for room', 'Cosmetic only'],
  },
  {
    date: 'November 2026',
    title: 'Devcon Mumbai Tournament',
    status: 'upcoming',
    img: '/tournament.png',
    desc: '64 players. Real prizes. Live spectators. The ultimate test of deception at Ethereum\'s biggest stage.',
    items: ['64-player bracket', 'Live spectator mode', 'ELO rankings', 'Prize pool + sponsors'],
  },
];

export default function Roadmap() {
  useEffect(() => {
    document.documentElement.classList.add('scrollable');
    return () => document.documentElement.classList.remove('scrollable');
  }, []);

  const navigate = useNavigate();

  return (
    <div style={{ width: '100%', minHeight: '100vh', padding: '3rem 1rem' }}>
      <div style={{ maxWidth: 950, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h1 style={{ fontSize: '2.5rem', color: '#c9a84c', marginBottom: '0.5rem' }}>Roadmap</h1>
          <p style={{ color: '#8b7b5a', fontSize: '0.9rem' }}>Building the future of on-chain social deception</p>
        </div>

        {/* Timeline */}
        <div style={{ position: 'relative' }}>
          {/* Center line */}
          <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: 2, background: '#3a2a1a', transform: 'translateX(-1px)' }} />

          {phases.map((phase, i) => {
            const isLeft = i % 2 === 0;
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'stretch', marginBottom: '3.5rem', flexDirection: isLeft ? 'row' : 'row-reverse' }}>
                {/* Card */}
                <div style={{ width: '45%' }}>
                  <div style={{ borderRadius: '0.7rem', overflow: 'hidden', border: '1px solid #3a2a1a', position: 'relative', height: '100%', minHeight: 220 }}>
                    {/* Background image */}
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${phase.img})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                    {/* Dark overlay for readability */}
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,6,2,0.4) 0%, rgba(10,6,2,0.85) 60%)' }} />
                    {/* Content overlay */}
                    <div style={{ position: 'relative', padding: '1.2rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                      {/* Status */}
                      <span style={{
                        position: 'absolute', top: '0.7rem', right: '0.7rem',
                        fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '0.2rem',
                        background: phase.status === 'live' ? '#22c55e30' : phase.status === 'next' ? '#c9a84c30' : '#00000050',
                        color: phase.status === 'live' ? '#22c55e' : phase.status === 'next' ? '#c9a84c' : '#8b7b5a',
                        border: `1px solid ${phase.status === 'live' ? '#22c55e' : phase.status === 'next' ? '#c9a84c' : '#5a4a3a'}`,
                        backdropFilter: 'blur(4px)',
                      }}>
                        {phase.status === 'live' ? 'LIVE' : phase.status === 'next' ? 'NEXT' : 'PLANNED'}
                      </span>
                      {/* Date */}
                      <p style={{ fontSize: '0.65rem', color: '#c9a84c', margin: '0 0 0.2rem', letterSpacing: '0.05em' }}>{phase.date}</p>
                      {/* Title */}
                      <h3 style={{ fontSize: '1.3rem', color: '#fff', margin: '0 0 0.4rem', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{phase.title}</h3>
                      {/* Description */}
                      <p style={{ fontSize: '0.8rem', color: '#dfd5b4', margin: '0 0 0.6rem', lineHeight: 1.4 }}>{phase.desc}</p>
                      {/* Tags */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                        {phase.items.map((item, j) => (
                          <span key={j} style={{ fontSize: '0.6rem', padding: '0.15rem 0.5rem', borderRadius: '1rem', background: '#ffffff15', color: '#a89878', border: '1px solid #5a4a3a40' }}>{item}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Center dot */}
                <div style={{ width: '10%', display: 'flex', justifyContent: 'center', paddingTop: '2rem' }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: '50%', zIndex: 2,
                    background: phase.status === 'live' ? '#22c55e' : phase.status === 'next' ? '#c9a84c' : '#2a1a0a',
                    border: `3px solid ${phase.status === 'live' ? '#22c55e' : phase.status === 'next' ? '#c9a84c' : '#5a4a3a'}`,
                    boxShadow: phase.status === 'live' ? '0 0 12px #22c55e60' : phase.status === 'next' ? '0 0 12px #c9a84c40' : 'none',
                  }} />
                </div>

                {/* Empty */}
                <div style={{ width: '45%' }} />
              </div>
            );
          })}
        </div>

        {/* Back */}
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          <button className="btn" onClick={() => navigate('/')} style={{ padding: '0.5rem 2rem' }}>Back to Home</button>
        </div>
      </div>
    </div>
  );
}
