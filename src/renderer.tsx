import React from 'react';
import ReactDOM from 'react-dom/client';

import { App } from './ui/App';
import './index.css';

const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Elemento raiz não encontrado');
}

const root = ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

