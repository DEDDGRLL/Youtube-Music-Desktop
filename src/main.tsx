import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MiniPlayer from './components/MiniPlayer';
import { startErrorLog } from './lib/diag';
import { initPlayerBridge } from './lib/player';
import './styles.css';

startErrorLog();
initPlayerBridge();

// The mini-player is a second window running this same app, in a stripped-down mode.
const isMini = getCurrentWebviewWindow().label === 'mini';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{isMini ? <MiniPlayer /> : <App />}</React.StrictMode>,
);
