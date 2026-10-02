import { useState } from "react";
import {
  uploadDocuments,
  deleteDocument,
  clearDocuments,
  loadSampleDocuments,
} from "../api.js";

export default function KnowledgeBaseView({
  docsData,
  onRefreshDocs,
  hasApiKey,
  onOpenSettings,
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [dragOver, setDragOver] = useState(false);

  async function handleFiles(files) {
    if (!files || files.length === 0) return;
    if (!hasApiKey) {
      setError("Please configure your Gemini API Key in Settings before uploading documents.");
      return;
    }

    setUploading(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await uploadDocuments(formData);
      setSuccess(`Successfully indexed ${res.processed} document(s) into FAISS!`);
      onRefreshDocs();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) {
      handleFiles(e.dataTransfer.files);
    }
  }

  async function handleDelete(filename) {
    if (!window.confirm(`Delete "${filename}" and rebuild the vector index?`)) return;
    try {
      await deleteDocument(filename);
      onRefreshDocs();
      setSuccess(`Removed "${filename}".`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleClearAll() {
    if (!window.confirm("Are you sure you want to clear all documents and reset the index?")) return;
    try {
      await clearDocuments();
      onRefreshDocs();
      setSuccess("Knowledge base reset.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleLoadSample() {
    if (!hasApiKey) {
      setError("Please configure your Gemini API Key in Settings first.");
      return;
    }
    setUploading(true);
    setError(null);
    setSuccess(null);
    try {
      await loadSampleDocuments();
      setSuccess("Sample profile & research knowledge successfully loaded into FAISS!");
      onRefreshDocs();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  const documents = docsData?.documents || [];
  const totalChunks = docsData?.total_chunks || 0;
  const hasIndex = docsData?.has_index || false;

  return (
    <div className="knowledge-view">
      <div className="kb-header-row">
        <div>
          <h2>Document Knowledge Base (FAISS RAG)</h2>
          <p className="muted">
            Upload custom PDFs, text files, or markdown notes. Documents are chunked (800 chars),
            embedded with Gemini, and indexed locally for the retriever agent.
          </p>
        </div>

        <div className="kb-actions-bar">
          <button
            type="button"
            className="btn sample-btn"
            onClick={handleLoadSample}
            disabled={uploading}
            title="Load sample document containing Jayasurya's profile & AI research"
          >
            ⚡ Load Sample Knowledge
          </button>
          {documents.length > 0 && (
            <button
              type="button"
              className="btn danger-btn-outline"
              onClick={handleClearAll}
              disabled={uploading}
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {!hasApiKey && (
        <div className="banner warning-banner">
          <div>
            <strong>⚠️ Gemini API Key Required:</strong> To chunk and generate embeddings for your documents, you need an active API key.
          </div>
          <button className="btn mini-btn" onClick={onOpenSettings}>
            Open Settings
          </button>
        </div>
      )}

      {error && <div className="banner error-banner">{error}</div>}
      {success && <div className="banner success-banner">{success}</div>}

      <div className="kb-grid">
        <div className="kb-upload-column">
          <div
            className={`dropzone ${dragOver ? "drag-over" : ""} ${uploading ? "uploading" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-input"
              multiple
              accept=".pdf,.txt,.md"
              onChange={(e) => handleFiles(e.target.files)}
              disabled={uploading}
              style={{ display: "none" }}
            />
            <label htmlFor="file-input" className="dropzone-label">
              <span className="dropzone-icon">📥</span>
              <div className="dropzone-title">
                {uploading ? "Chunking & Generating Embeddings..." : "Drop files here or click to browse"}
              </div>
              <p className="dropzone-sub">
                Supported formats: <strong>.pdf</strong>, <strong>.txt</strong>, <strong>.md</strong>
              </p>
            </label>
          </div>

          <div className="kb-stats-card">
            <h4>Vector Store Statistics</h4>
            <div className="stats-metric-row">
              <div className="metric-box">
                <span className="metric-val">{documents.length}</span>
                <span className="metric-lbl">Indexed Docs</span>
              </div>
              <div className="metric-box">
                <span className="metric-val">{totalChunks}</span>
                <span className="metric-lbl">Vector Chunks</span>
              </div>
              <div className="metric-box">
                <span className={`metric-val ${hasIndex ? "text-emerald" : "text-amber"}`}>
                  {hasIndex ? "Ready" : "Empty"}
                </span>
                <span className="metric-lbl">Index State</span>
              </div>
            </div>
            <div className="stats-detail">
              <span>Embedding: <code>models/text-embedding-004</code></span>
              <span>Chunk Size: <code>800 chars (120 overlap)</code></span>
            </div>
          </div>
        </div>

        <div className="kb-list-column">
          <div className="panel kb-list-panel">
            <div className="panel-subhead">
              <h3>Indexed Documents ({documents.length})</h3>
              <button
                type="button"
                className="icon-refresh-btn"
                onClick={onRefreshDocs}
                title="Refresh list"
              >
                🔄
              </button>
            </div>

            {documents.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">📂</span>
                <p>No documents uploaded yet.</p>
                <span className="empty-hint">
                  Drop your resume, PDF papers, or click <strong>&quot;Load Sample Knowledge&quot;</strong> above to get started immediately.
                </span>
              </div>
            ) : (
              <div className="doc-items-list">
                {documents.map((doc) => {
                  const ext = doc.name.split(".").pop()?.toUpperCase() || "DOC";
                  return (
                    <div key={doc.name} className="doc-item-card">
                      <div className="doc-icon-badge ext-badge">{ext}</div>
                      <div className="doc-info">
                        <div className="doc-filename" title={doc.name}>
                          {doc.name}
                        </div>
                        <div className="doc-meta">
                          <span>{formatBytes(doc.size)}</span>
                          <span>•</span>
                          <span>{doc.chunks} chunks</span>
                          {doc.uploaded_at && (
                            <>
                              <span>•</span>
                              <span>{new Date(doc.uploaded_at).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="doc-delete-btn"
                        onClick={() => handleDelete(doc.name)}
                        title="Delete document"
                      >
                        🗑️
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
