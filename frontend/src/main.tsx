/* ============================================================
   ATLAS IELTS Academy — entry point
   Becomes runnable the moment App.jsx lands in Batch 3; until
   then index.html's /src/main.jsx reference simply waits, exactly
   as the batch plan states.
   ============================================================ */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/design-system.css'; // File 10 — the whole visual contract
import App from './App.jsx';         // Batch 3 — shell, routes, bootstrap

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);