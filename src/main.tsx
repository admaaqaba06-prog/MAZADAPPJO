import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Register the PWA Service Worker (only in production to avoid caching issues during development)
if ('serviceWorker' in navigator) {
  if ((import.meta as any).env?.DEV) {
    // Unregister any active service workers in development to prevent fetch and caching issues
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('Successfully unregistered stale service worker in development');
          }
        });
      }
    });
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then((reg) => {
          console.log('MAZAD JO Service Worker registered successfully:', reg.scope);
        })
        .catch((err) => {
          console.warn('MAZAD JO Service Worker registration failed:', err);
        });
    });
  }
}

