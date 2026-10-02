import { useState } from "react";
import { saveSettings } from "../api.js";

const APP_NAME_PRESETS = [
  "Synapse AI",
  "NexusMind",
  "CogniGraph",
  "Aura AI",
];

const THEME_OPTIONS = [
  { id: "obsidian", label: "Obsidian Violet", desc: "Charcoal & Electric Violet" },
  { id: "emerald", label: "Cyber Emerald", desc: "Dark Carbon & Matrix Mint" },
  { id: "onyx", label: "Titanium Onyx", desc: "Monochrome & Titanium Silver" },
  { id: "amber", label: "Solar Amber", desc: "Dark Bronze & Amber Glow" },
];

export default function SettingsModal({
  isOpen,
  onClose,
  appName = "Synapse AI",
  onUpdateAppName,
  theme = "obsidian",
  onUpdateTheme,
  currentSettings,
  onSettingsUpdated,
}) {
  const [currentName, setCurrentName] = useState(appName);
  const [currentTheme, setCurrentTheme] = useState(theme);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(currentSettings?.model || "gemini-3.8-flash");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showKey, setShowKey] = useState(false);

  if (!isOpen) return null;

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      // Save local branding & theme preferences
      if (currentName.trim() && onUpdateAppName) {
        onUpdateAppName(currentName.trim());
      }
      if (currentTheme && onUpdateTheme) {
        onUpdateTheme(currentTheme);
      }

      // Save backend settings
      const payload = { model };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      const updated = await saveSettings(payload);
      if (onSettingsUpdated) {
        onSettingsUpdated(updated);
      }

      setSuccess(true);
      setApiKey("");
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="modal-icon">⚙️</span>
            <h3>Workspace & AI Settings</h3>
          </div>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSave} className="modal-body">
          {/* Brand Name Customizer */}
          <div className="form-group">
            <label>Application Brand Name</label>
            <div className="preset-options-row">
              {APP_NAME_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`preset-pill-btn ${currentName === p ? "active" : ""}`}
                  onClick={() => setCurrentName(p)}
                >
                  ✦ {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              className="theme-select-input"
              value={currentName}
              onChange={(e) => setCurrentName(e.target.value)}
              placeholder="Or enter custom name..."
              style={{ marginTop: "6px" }}
            />
          </div>

          {/* Color Theme Selector (Zero dark blue) */}
          <div className="form-group">
            <label>Visual Color Theme</label>
            <div className="preset-options-row">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`preset-pill-btn ${currentTheme === t.id ? "active" : ""}`}
                  onClick={() => {
                    setCurrentTheme(t.id);
                    if (onUpdateTheme) onUpdateTheme(t.id);
                  }}
                  title={t.desc}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <p className="field-hint">
              Curated modern aesthetics — no dull dark blue. Instant live preview.
            </p>
          </div>

          {/* Gemini API Key */}
          <div className="form-group">
            <label>
              Google Gemini API Key
              {currentSettings?.has_api_key && (
                <span className="status-pill active-pill">Active ({currentSettings.masked_key})</span>
              )}
            </label>
            <div className="input-with-button">
              <input
                type={showKey ? "text" : "password"}
                placeholder={currentSettings?.has_api_key ? "Enter new key to update..." : "AIzaSy..."}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
              />
              <button
                type="button"
                className="toggle-view-btn"
                onClick={() => setShowKey(!showKey)}
              >
                {showKey ? "Hide" : "Show"}
              </button>
            </div>
            <p className="field-hint">
              Get an API key at{" "}
              <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
                Google AI Studio ↗
              </a>
              . Free tier includes generous quotas for development.
            </p>
          </div>

          {/* LLM Model Selection */}
          <div className="form-group">
            <label>Gemini LLM Model</label>
            <select value={model} onChange={(e) => setModel(e.target.value)}>
              <option value="gemini-3.8-flash">gemini-3.8-flash (Recommended default)</option>
              <option value="gemini-2.5-flash">gemini-2.5-flash (Standard)</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro (Deeper reasoning)</option>
            </select>
          </div>

          {/* Vector Embeddings */}
          <div className="form-group">
            <label>Vector Embedding Model</label>
            <input
              type="text"
              disabled
              value={currentSettings?.embedding_model || "models/gemini-embedding-001"}
              className="disabled-input"
            />
            <p className="field-hint">Embedded and retrieved via FAISS vector store with fallback resilience.</p>
          </div>

          {error && <div className="banner error-banner">{error}</div>}
          {success && <div className="banner success-banner">✓ Settings successfully saved!</div>}

          <div className="modal-footer">
            <button type="button" className="btn secondary-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn primary-btn" disabled={saving}>
              {saving ? "Saving..." : "Save Preferences"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
