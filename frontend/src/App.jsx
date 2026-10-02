import { useState, useEffect } from "react";
import Sidebar from "./components/Sidebar.jsx";
import ChatView from "./components/ChatView.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import { getSettings, fetchDocuments } from "./api.js";

export default function App() {
  const [settings, setSettings] = useState(null);
  const [docsData, setDocsData] = useState({ documents: [], total_chunks: 0, has_index: false });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [chatKey, setChatKey] = useState(1);

  // App Rebranding and Themes (Zero dark-blue by default)
  const [appName, setAppName] = useState(() => {
    return localStorage.getItem("synapse_app_name") || "Synapse AI";
  });
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("synapse_theme") || "obsidian";
  });

  // Sync title and theme attributes
  useEffect(() => {
    document.title = appName;
    localStorage.setItem("synapse_app_name", appName);
  }, [appName]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("synapse_theme", theme);
  }, [theme]);

  async function loadData() {
    try {
      const s = await getSettings();
      setSettings(s);
    } catch {
      // ignore
    }

    try {
      const d = await fetchDocuments();
      setDocsData(d);
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 12000);
    return () => clearInterval(interval);
  }, []);

  function handleNewChat() {
    setChatKey((k) => k + 1);
  }

  return (
    <div className="modern-app" data-theme={theme}>
      <Sidebar
        appName={appName}
        theme={theme}
        onSelectTheme={setTheme}
        docsData={docsData}
        onRefreshDocs={loadData}
        onNewChat={handleNewChat}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <main className="main-content">
        <ChatView
          key={chatKey}
          appName={appName}
          onRefreshDocs={loadData}
          docsCount={docsData.documents?.length || 0}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />
      </main>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        appName={appName}
        onUpdateAppName={setAppName}
        theme={theme}
        onUpdateTheme={setTheme}
        currentSettings={settings}
        onSettingsUpdated={(newSettings) => {
          setSettings(newSettings);
          loadData();
        }}
      />
    </div>
  );
}
