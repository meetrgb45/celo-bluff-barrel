import { useState } from 'react';
import { WagmiProvider, useAccount, useSwitchChain } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { config } from './lib/wagmi';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';
import Roadmap from './pages/Roadmap';

const CELO_SEPOLIA_ID = 11142220;
const CELO_SEPOLIA_HEX = '0xA9D2BC'; // 11142220 in hex

function WrongChainBanner() {
  const { isConnected, chainId } = useAccount();
  const { switchChain, isPending } = useSwitchChain();
  const [busy, setBusy] = useState(false);

  if (!isConnected || chainId === CELO_SEPOLIA_ID) return null;

  const handleSwitch = async () => {
    setBusy(true);
    try {
      // wagmi first (works when chain already added)
      await switchChain({ chainId: CELO_SEPOLIA_ID });
    } catch {
      // direct MetaMask fallback
      const eth = (window as any).ethereum;
      if (!eth) return;
      try {
        await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CELO_SEPOLIA_HEX }] });
      } catch (e: any) {
        if (e?.code === 4902) {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CELO_SEPOLIA_HEX,
              chainName: 'Celo Sepolia',
              nativeCurrency: { name: 'CELO', symbol: 'CELO', decimals: 18 },
              rpcUrls: ['https://forno.celo-sepolia.celo-testnet.org'],
              blockExplorerUrls: ['https://celo-sepolia.blockscout.com'],
            }],
          });
        }
      }
    }
    setBusy(false);
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: '#7c1d1d', borderBottom: '1px solid #e94560',
      padding: '0.55rem 1rem',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
    }}>
      <span style={{ fontSize: '0.8rem', color: '#ffb4ab' }}>
        Wrong network — this game runs on Celo Sepolia
      </span>
      <button onClick={handleSwitch} disabled={busy || isPending} style={{
        padding: '0.3rem 0.9rem', fontSize: '0.75rem', cursor: 'pointer',
        background: '#e94560', color: '#fff', border: 'none', borderRadius: '0.3rem',
      }}>
        {busy || isPending ? 'Switching...' : 'Switch to Celo Sepolia'}
      </button>
    </div>
  );
}

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <WrongChainBanner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/lobby" element={<Lobby />} />
            <Route path="/roadmap" element={<Roadmap />} />
            <Route path="/game/:mode/:id" element={<GameRoom />} />
          </Routes>
        </BrowserRouter>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
