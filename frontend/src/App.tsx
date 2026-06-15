import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { config } from './lib/wagmi';
import Landing from './pages/Landing';
import Lobby from './pages/Lobby';
import GameRoom from './pages/GameRoom';
import Roadmap from './pages/Roadmap';

const queryClient = new QueryClient();

export default function App() {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
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
