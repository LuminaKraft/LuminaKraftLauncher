import React, { useState } from 'react';
import { LauncherProvider } from './contexts/LauncherContext';
import Sidebar from './components/Layout/Sidebar';
import ModpacksPage from './components/Modpacks/ModpacksPage';
import SettingsPage from './components/Settings/SettingsPage';
import AboutPage from './components/About/AboutPage';
import './App.css';

function App() {
  const [activeSection, setActiveSection] = useState('home');

  const renderContent = () => {
    switch (activeSection) {
      case 'home':
        return <ModpacksPage />;
      case 'settings':
        return <SettingsPage />;
      case 'about':
        return <AboutPage />;
      default:
        return <ModpacksPage />;
    }
  };

  return (
    <LauncherProvider>
      <div className="flex h-screen bg-dark-900 text-white">
        <Sidebar 
          activeSection={activeSection} 
          onSectionChange={setActiveSection} 
        />
        <main className="flex-1 overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </LauncherProvider>
  );
}

export default App;
