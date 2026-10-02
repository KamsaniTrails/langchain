import { useState } from "react";

const STATUS_CONFIG = {
  pending: { label: "Pending", color: "#94a3b8", bg: "rgba(148, 163, 184, 0.15)", icon: "⏳" },
  in_progress: { label: "In Progress", color: "#f59e0b", bg: "rgba(245, 158, 11, 0.15)", icon: "⚡" },
  done: { label: "Completed", color: "#10b981", bg: "rgba(16, 185, 129, 0.15)", icon: "✅" },
  failed: { label: "Failed", color: "#ef4444", bg: "rgba(239, 68, 68, 0.15)", icon: "❌" },
};

export default function AgentTraceView({ state, loading }) {
  const [activeTab, setActiveTab] = useState("plan");
  const [expandedTool, setExpandedTool] = useState(null);

  if (!state && !loading) {
    return (
      <div className="panel trace-panel">
        <div className="panel-subhead">
          <h3>Multi-Agent Execution Trace</h3>
        </div>
        <div className="empty-state">
          <span className="empty-icon">🛰️</span>
          <p>No active execution trace</p>
          <span className="empty-hint">
            Submit a question on the left to watch the Planner decompose tasks, the Retriever fetch FAISS chunks, and the Executor invoke Gemini tools in real-time.
          </span>
        </div>
      </div>
    );
  }

  const plan = state?.plan || [];
  const toolCalls = state?.tool_calls || [];
  const messages = state?.messages || [];
  const retrievedContext = state?.retrieved_context || [];

  return (
    <div className="panel trace-panel">
      <div className="trace-header">
        <div className="panel-subhead">
          <div className="trace-title-wrap">
            <span className="live-dot"></span>
            <h3>Multi-Agent Execution Trace</h3>
          </div>
          {state?.thread_id && (
            <span className="thread-pill" title="LangGraph Checkpoint Thread ID">
              Thread: {state.thread_id.slice(0, 8)}...
            </span>
          )}
        </div>

        <div className="trace-tabs">
          <button
            type="button"
            className={`trace-tab-btn ${activeTab === "plan" ? "active" : ""}`}
            onClick={() => setActiveTab("plan")}
          >
            📋 Sub-Tasks ({plan.length})
          </button>
          <button
            type="button"
            className={`trace-tab-btn ${activeTab === "tools" ? "active" : ""}`}
            onClick={() => setActiveTab("tools")}
          >
            🛠️ Tool Calls ({toolCalls.length})
          </button>
          <button
            type="button"
            className={`trace-tab-btn ${activeTab === "messages" ? "active" : ""}`}
            onClick={() => setActiveTab("messages")}
          >
            💬 Transcript ({messages.length})
          </button>
        </div>
      </div>

      <div className="trace-content-body">
        {activeTab === "plan" && (
          <div className="tab-pane">
            {plan.length === 0 ? (
              <div className="empty-tab">
                {loading ? "Planner is decomposing your request into sub-tasks..." : "No sub-tasks generated yet."}
              </div>
            ) : (
              <div className="subtask-cards-list">
                {plan.map((task, idx) => {
                  const conf = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
                  return (
                    <div key={task.id || idx} className={`subtask-card status-border-${task.status}`}>
                      <div className="subtask-card-header">
                        <span className="subtask-index">Step {idx + 1}</span>
                        <span
                          className="subtask-status-pill"
                          style={{ color: conf.color, backgroundColor: conf.bg }}
                        >
                          {conf.icon} {conf.label}
                        </span>
                      </div>
                      <div className="subtask-desc">{task.description}</div>
                      {task.result && (
                        <div className="subtask-result-box">
                          <span className="result-label">Result:</span>
                          <p>{task.result}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "tools" && (
          <div className="tab-pane">
            {toolCalls.length === 0 ? (
              <div className="empty-tab">
                {loading ? "Waiting for tool calls..." : "No tools invoked for this query."}
              </div>
            ) : (
              <div className="tools-list">
                {toolCalls.map((call, i) => {
                  const isExpanded = expandedTool === i;
                  return (
                    <div key={i} className="tool-call-card">
                      <div
                        className="tool-call-header"
                        onClick={() => setExpandedTool(isExpanded ? null : i)}
                      >
                        <div className="tool-id-group">
                          <span className="tool-node-badge">{call.node}</span>
                          <span className="tool-fn-name">{call.tool}()</span>
                        </div>
                        <span className="tool-toggle-icon">{isExpanded ? "▲" : "▼"}</span>
                      </div>

                      <div className="tool-summary-line">
                        <span className="io-tag">input:</span>
                        <code className="inline-code">{call.input}</code>
                      </div>

                      {isExpanded && (
                        <div className="tool-expanded-body">
                          <div className="io-block">
                            <span className="io-heading">Full Output / Retrieved Data:</span>
                            <pre className="io-pre">{call.output}</pre>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "messages" && (
          <div className="tab-pane">
            {messages.length === 0 ? (
              <div className="empty-tab">No messages logged yet.</div>
            ) : (
              <div className="messages-stream">
                {messages.map((m, i) => (
                  <div key={i} className={`stream-bubble bubble-${m.type}`}>
                    <div className="bubble-header">
                      <span className="bubble-type-tag">{m.type.toUpperCase()}</span>
                    </div>
                    <div className="bubble-text">{m.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
