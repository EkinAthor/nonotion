import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AuthConfigProvider from './components/auth/AuthConfigProvider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthConfigProvider>
        <App />
      </AuthConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
);
