import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { KioskView } from './components/KioskView';
import { Landing } from './components/Landing';
import './styles/index.css';
import './styles/kiosk.css';
import './styles/landing.css';

const path = window.location.pathname;
let ViewComponent;
if (path.startsWith('/kiosk')) {
  ViewComponent = KioskView;
} else if (path.startsWith('/volunteer')) {
  ViewComponent = App;
} else {
  ViewComponent = Landing;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>{<ViewComponent />}</StrictMode>
);
