import { useState } from "react";
import { startChat, approveRun } from "../api.js";

const SUGGESTIONS = [
  "What is my name and what is my job?",
  "Summarize the core architecture of the project",
  "Calculate: (94.2 * 12) + (1.4 * 50) and explain what the metrics represent",
  "Compare the retrieval strategies and cite benchmarks",
];

export default function ChatInterface({
  onStateUpdate,
  onOpenSettings,
  onOpenKnowledgeBase,
  hasApiKey,
  docsCount,
}) {
  const [query, setQuery] = useState("");
  const [threadId, setThreadId] = useState(null);
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e) {
    if (e) e.preventDefault();
    if (!query.trim() || loading) return;

    if (!hasApiKey) {
      setError("Please configure your Gemini API Key in Settings first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await startChat(query, threadId);
      setThreadId(result.thread_id);
      setState(result);
      onStateUpdate(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(approved) {
    setLoading(true);
    setError(null);
    try {
      const result = await approveRun(threadId, approved);
      setState(result);
      onStateUpdate(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function handleSelectSuggestion(text) {
    setQuery(text);
  }

  function handleCopyAnswer() {
    if (!state?.final_answer) return;
    navigator.clipboard.writeText(state.final_answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleNewSession() {
    setQuery("");
    setThreadId(null);
    setState(null);
    setError(null);
    onStateUpdate(null);
  }

  const awaitingApproval =
    state?.needs_human_approval && state?.human_approved === null;

  return (
    <div className="panel chat-panel">
      <div className="panel-subhead">
        <div>
          <h3>Multi-Agent Research Console</h3>
          <p className="muted">
            Ask any question. The Planner generates sub-tasks, the Retriever queries local FAISS embeddings, and the Executor runs tools to synthesize answers.
          </p>
        </div>
        {state && (
          <button type="button" className="btn mini-btn-outline" onClick={handleNewSession}>
            + New Run
          </button>
        )}
      </div>

      {!hasApiKey && (
        <div className="banner warning-banner">
          <div>
            <strong>🔑 Setup Required:</strong> Add your Google Gemini API key to start running the research assistant.
          </div>
          <button type="button" className="btn mini-btn" onClick={onOpenSettings}>
            Add API Key
          </button>
        </div>
      )}

      {docsCount === 0 && hasApiKey && (
        <div className="banner info-banner">
          <div>
            <strong>💡 Tip:</strong> No documents uploaded yet. You can upload custom PDFs/docs or load the sample knowledge base for grounded answers.
          </div>
          <button type="button" className="btn mini-btn" onClick={onOpenKnowledgeBase}>
            Knowledge Base
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-form">
        <div className="textarea-wrapper">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder="Ask a question (e.g. 'What is my name and what is my job' or 'Summarize section 2'). Press Enter to run..."
            rows={3}
            disabled={loading}
          />
        </div>

        <div className="chat-actions-row">
          <div className="suggestions-bar">
            <span className="suggestions-label">Try:</span>
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                className="suggestion-chip"
                onClick={() => handleSelectSuggestion(s)}
                disabled={loading}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            type="submit"
            className="btn primary-btn run-btn"
            disabled={loading || !query.trim()}
          >
            {loading ? (
              <span className="btn-loading">
                <span className="spinner"></span> Running Pipeline...
              </span>
            ) : (
              <span>⚡ Run Assistant</span>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="banner error-banner">
          <div>{error}</div>
          {error.toLowerCase().includes("api key") && (
            <button type="button" className="btn mini-btn" onClick={onOpenSettings}>
              Open Settings
            </button>
          )}
          {error.toLowerCase().includes("index") && (
            <button type="button" className="btn mini-btn" onClick={onOpenKnowledgeBase}>
              Open Knowledge Base
            </button>
          )}
        </div>
      )}

      {awaitingApproval && (
        <div className="approval-gate-card">
          <div className="approval-header">
            <span className="approval-icon">🛡️</span>
            <div>
              <h4>Human Approval Checkpoint Triggered</h4>
              <p>
                The planner flagged this request as potentially sensitive or high-impact.
                Review the generated plan on the right before proceeding.
              </p>
            </div>
          </div>
          <div className="approval-buttons">
            <button
              type="button"
              className="btn success-btn"
              onClick={() => handleApproval(true)}
              disabled={loading}
            >
              ✓ Approve Plan & Execute
            </button>
            <button
              type="button"
              className="btn danger-btn"
              onClick={() => handleApproval(false)}
              disabled={loading}
            >
              ✕ Reject Plan
            </button>
          </div>
        </div>
      )}

      {state?.final_answer && (
        <div className="final-answer-card">
          <div className="answer-header">
            <div className="answer-title-group">
              <span className="answer-icon">🎯</span>
              <h4>Synthesizer Result</h4>
            </div>
            <button
              type="button"
              className="btn mini-btn-outline"
              onClick={handleCopyAnswer}
            >
              {copied ? "✓ Copied" : "Copy Answer"}
            </button>
          </div>
          <div className="answer-body">
            <pre className="answer-pre">{state.final_answer}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
