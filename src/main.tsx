
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Log app initialization
console.log('SolanSight app initializing...');

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('SolanSight app initialized successfully');
} else {
  console.error('Root element not found');
}
