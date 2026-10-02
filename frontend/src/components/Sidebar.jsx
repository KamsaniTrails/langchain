import { useRef, useState } from "react";
import { uploadDocuments, deleteDocument, clearDocuments, loadSampleDocs } from "../api.js";

const THEMES = [
  { id: "obsidian", label: "Obsidian", colorClass: "dot-obsidian" },
  { id: "emerald", label: "Emerald", colorClass: "dot-emerald" },
  { id: "onyx", label: "Onyx", colorClass: "dot-onyx" },
  { id: "amber", label: "Amber", colorClass: "dot-amber" },
];

export default function Sidebar({
  appName = "Synapse AI",
  theme = "obsidian",
  onSelectTheme,
  docsData,
  onRefreshDocs,
  onNewChat,
  onOpenSettings,
}) {
  const [uploading, setUploading] = useState(false);
  const [actionMsg, setActionMsg] = useState(null);
  const fileInputRef = useRef(null);

  async function handleFileUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    setActionMsg(null);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await uploadDocuments(formData);
      setActionMsg(`Indexed ${res.processed} file(s)`);
      onRefreshDocs();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleLoadSample() {
    setUploading(true);
    setActionMsg(null);
    try {
      await loadSampleDocs();
      setActionMsg("Sample knowledge loaded!");
      onRefreshDocs();
      setTimeout(() => setActionMsg(null), 3500);
    } catch (err) {
      alert(`Sample error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(filename) {
    if (!window.confirm(`Delete "${filename}" from Knowledge Base?`)) return;
    try {
      await deleteDocument(filename);
      onRefreshDocs();
    } catch (err) {
      alert(`Delete error: ${err.message}`);
    }
  }

  async function handleClearAll() {
    if (!window.confirm("Remove all indexed documents?")) return;
    try {
      await clearDocuments();
      onRefreshDocs();
    } catch (err) {
      alert(`Clear failed: ${err.message}`);
    }
  }

  const documents = docsData?.documents || [];

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon">✦</div>
        <div className="brand-text">
          <span className="brand-title">{appName}</span>
        </div>
      </div>

      <button type="button" className="btn-new-chat" onClick={onNewChat}>
        <span>+</span> New Research
      </button>

      <div className="sidebar-section">
        <div className="section-header">
          <span className="section-title">Knowledge Sources</span>
          <span className="section-count">{documents.length}</span>
        </div>

        <input
          type="file"
          ref={fileInputRef}
          multiple
          accept=".pdf,.txt,.md"
          onChange={handleFileUpload}
          style={{ display: "none" }}
        />

        <div className="sidebar-doc-actions">
          <button
            type="button"
            className="btn-sidebar-action"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            <span>📁</span> {uploading ? "Indexing..." : "Upload File"}
          </button>
          <button
            type="button"
            className="btn-sidebar-action secondary"
            onClick={handleLoadSample}
            disabled={uploading}
            title="Load built-in profile & research notes"
          >
            <span>⚡</span> Sample Docs
          </button>
        </div>

        {actionMsg && <div className="sidebar-msg">{actionMsg}</div>}

        <div className="sidebar-docs-list">
          {documents.length === 0 ? (
            <div className="sidebar-empty-docs">
              <p>No documents uploaded yet.</p>
              <span>Upload PDF, TXT or MD files for grounded answers.</span>
            </div>
          ) : (
            documents.map((doc) => (
              <div key={doc.name} className="sidebar-doc-item">
                <div className="doc-icon">📄</div>
                <div className="doc-meta" title={doc.name}>
                  <div className="doc-name">{doc.name}</div>
                  <div className="doc-sub">{doc.chunks} chunks</div>
                </div>
                <button
                  type="button"
                  className="btn-doc-delete"
                  onClick={() => handleDelete(doc.name)}
                  title="Remove document"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {documents.length > 0 && (
          <button
            type="button"
            className="btn-clear-all"
            onClick={handleClearAll}
          >
            Clear all sources
          </button>
        )}
      </div>

      <div className="sidebar-footer">
        <div className="theme-quick-bar">
          <span className="theme-quick-label">Theme</span>
          <div className="theme-dots-group">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`theme-dot-btn ${t.colorClass} ${theme === t.id ? "active" : ""}`}
                onClick={() => onSelectTheme && onSelectTheme(t.id)}
                title={`Switch to ${t.label} theme`}
              />
            ))}
          </div>
        </div>

        <button
          type="button"
          className="btn-settings-footer"
          onClick={onOpenSettings}
        >
          <span>⚙️</span> Settings & Credentials
        </button>
      </div>
    </aside>
  );
}
