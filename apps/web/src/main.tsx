import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import AuthConfigProvider from './components/auth/AuthConfigProvider';
import { IS_DEMO_MODE } from '@/api/client';
import { initDemoMode } from '@/api/demo-init';
import './index.css';

if (IS_DEMO_MODE) {
  initDemoMode();
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthConfigProvider>
        <App />
      </AuthConfigProvider>
    </BrowserRouter>
  </React.StrictMode>
);
