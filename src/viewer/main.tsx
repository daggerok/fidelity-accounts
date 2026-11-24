/// <reference lib="esnext" />
import { createRoot } from 'react-dom/client';
import { startData } from './app/data';
import { autoConnectGoogle } from './app/google';
import { App } from './ui/App';

startData();
autoConnectGoogle();
createRoot(document.getElementById('root')!).render(<App />);
