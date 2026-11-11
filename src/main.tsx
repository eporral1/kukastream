import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof document !== 'undefined') {
  document.getElementById('prerender-data')?.remove();
  delete (window as any).__INITIAL_DATA__;
}

createRoot(document.getElementById('root')!).render(<App />);
