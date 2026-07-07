import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { KioskView } from './components/KioskView';
import './styles/index.css';
import './styles/kiosk.css';

const isKiosk = window.location.pathname.startsWith('/kiosk');

createRoot(document.getElementById('root')).render(
  <StrictMode>{isKiosk ? <KioskView /> : <App />}</StrictMode>
);
