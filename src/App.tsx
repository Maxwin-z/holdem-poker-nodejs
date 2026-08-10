import React from 'react';
import './App.css';
import './features/home/LobbyResponsive.css';
import { Home } from './features/home/Home';
import { ResponsiveTableDemo } from './features/demo/ResponsiveTableDemo';
import { RoomUiPreview } from './features/demo/RoomUiPreview';
import { HomeUiPreview } from './features/demo/HomeUiPreview';
import { AiReplayPage } from './features/replay/AiReplayPage';

function App() {
  if (window.location.pathname === '/replays' || window.location.pathname.startsWith('/replays/')) {
    return <AiReplayPage />;
  }
  if (window.location.pathname === '/responsive-demo') {
    return <ResponsiveTableDemo />;
  }

  if (window.location.pathname === '/room-ui-preview') {
    return <RoomUiPreview />;
  }

  if (window.location.pathname === '/home-ui-preview') {
    return <HomeUiPreview />;
  }

  return (
    <div className="App">
      <Home/>
    </div>
  );
}

export default App;
