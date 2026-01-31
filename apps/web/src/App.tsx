import { Routes, Route, Navigate } from 'react-router-dom';
import MainLayout from './components/layout/MainLayout';
import PageView from './components/page/PageView';

function App() {
  return (
    <Routes>
      <Route element={<MainLayout />}>
        <Route path="/" element={<WelcomeView />} />
        <Route path="/page/:pageId" element={<PageView />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

function WelcomeView() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center text-notion-text-secondary">
        <p className="text-lg">Select a page from the sidebar</p>
        <p className="text-sm mt-2">or create a new one</p>
      </div>
    </div>
  );
}

export default App;
