import { useState, useRef, useEffect } from "react";
import { startChat, approveRun, uploadDocuments } from "../api.js";

const QUICK_PROMPTS = [
  "Summarize the key takeaways from the indexed documents",
  "What is my name, job profile, and background details?",
  "Calculate: (94.2 * 12) + (1.4 * 50) and explain what the metrics mean",
];

export default function ChatView({
  appName = "Synapse AI",
  onRefreshDocs,
  docsCount,
  onOpenSettings,
}) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [threadId, setThreadId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandedTraceIndex, setExpandedTraceIndex] = useState(null);
  const [uploadingInline, setUploadingInline] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState(null);

  const messagesEndRef = useRef(null);
  const inlineFileInputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleSend(textToSend) {
    const query = (textToSend || input).trim();
    if (!query || loading) return;

    setInput("");
    const userMsg = { role: "user", content: query, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const result = await startChat(query, threadId);
      setThreadId(result.thread_id);

      const assistantMsg = {
        role: "assistant",
        content: result.final_answer || "Research completed successfully.",
        plan: result.plan || [],
        toolCalls: result.tool_calls || [],
        needsApproval: result.needs_human_approval && result.human_approved === null,
        threadId: result.thread_id,
        rawState: result,
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "error",
          content: err.message,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function handleApproval(msgIndex, approved) {
    setLoading(true);
    try {
      const result = await approveRun(threadId, approved);
      setMessages((prev) =>
        prev.map((msg, i) =>
          i === msgIndex
            ? {
                ...msg,
                needsApproval: false,
                content: result.final_answer || (approved ? "Approved. Execution finished." : "Request rejected."),
                plan: result.plan || [],
                toolCalls: result.tool_calls || [],
              }
            : msg
        )
      );
    } catch (err) {
      alert(`Approval error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleInlineUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingInline(true);
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append("files", files[i]);
    }

    try {
      const res = await uploadDocuments(formData);
      onRefreshDocs();
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          content: `✓ Indexed ${res.processed} document(s) into your Knowledge Base. You can now ask questions about them!`,
        },
      ]);
    } catch (err) {
      alert(`Upload error: ${err.message}`);
    } finally {
      setUploadingInline(false);
      if (inlineFileInputRef.current) inlineFileInputRef.current.value = "";
    }
  }

  function handleCopy(text, idx) {
    navigator.clipboard.writeText(text);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  }

  return (
    <div className="chat-container">
      <div className="chat-scroll-area">
        {messages.length === 0 ? (
          <div className="chat-empty-hero">
            <h2>
              What would you like <span className="hero-gradient-text">{appName}</span> to research?
            </h2>
            <p>
              Ask complex questions across your uploaded knowledge base or general domains.
              Agents autonomously decompose the request, retrieve grounded context, execute tools, and synthesize the result.
            </p>

            <div className="hero-suggestions">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  className="hero-suggestion-card"
                  onClick={() => handleSend(prompt)}
                >
                  <span className="suggestion-arrow">↳</span>
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="messages-list">
            {messages.map((msg, idx) => (
              <div key={idx} className={`message-row ${msg.role}`}>
                {msg.role === "user" ? (
                  <div className="user-bubble">{msg.content}</div>
                ) : msg.role === "error" ? (
                  <div className="error-bubble">
                    <div className="error-title">⚠️ System Error</div>
                    <p>{msg.content}</p>
                    {msg.content.toLowerCase().includes("api key") && (
                      <button
                        type="button"
                        className="btn-inline-action"
                        onClick={onOpenSettings}
                      >
                        Open Settings to add API Key
                      </button>
                    )}
                  </div>
                ) : msg.role === "system" ? (
                  <div className="system-bubble">{msg.content}</div>
                ) : (
                  <div className="assistant-bubble">
                    <div className="assistant-header">
                      <span className="assistant-tag">✦ {appName}</span>
                      <button
                        type="button"
                        className="btn-copy-bubble"
                        onClick={() => handleCopy(msg.content, idx)}
                        title="Copy response"
                      >
                        {copiedIndex === idx ? "✓ Copied" : "Copy"}
                      </button>
                    </div>

                    <div className="assistant-text">
                      <pre>{msg.content}</pre>
                    </div>

                    {msg.needsApproval && (
                      <div className="inline-approval-card">
                        <div className="approval-title">🛡️ Human Approval Required</div>
                        <p>The planner detected a sensitive or multi-step execution requiring human confirmation.</p>
                        <div className="approval-action-btns">
                          <button
                            type="button"
                            className="btn-approve"
                            onClick={() => handleApproval(idx, true)}
                            disabled={loading}
                          >
                            Approve & Execute
                          </button>
                          <button
                            type="button"
                            className="btn-reject"
                            onClick={() => handleApproval(idx, false)}
                            disabled={loading}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Collapsible detail toggle for sources and reasoning */}
                    {(msg.plan?.length > 0 || msg.toolCalls?.length > 0) && (
                      <div className="details-accordion">
                        <button
                          type="button"
                          className="btn-toggle-details"
                          onClick={() =>
                            setExpandedTraceIndex(expandedTraceIndex === idx ? null : idx)
                          }
                        >
                          <span>{expandedTraceIndex === idx ? "▼ Hide" : "▶ View"} Agent Trace & Sources</span>
                          <span className="details-count-pill">
                            {msg.plan?.length || 0} sub-tasks • {msg.toolCalls?.length || 0} tools
                          </span>
                        </button>

                        {expandedTraceIndex === idx && (
                          <div className="details-expanded-panel">
                            {msg.plan?.length > 0 && (
                              <div className="details-section">
                                <div className="details-section-label">Sub-Tasks Decomposed:</div>
                                <ul className="details-subtasks-list">
                                  {msg.plan.map((t, ti) => (
                                    <li key={ti} className={`task-li status-${t.status}`}>
                                      <span className="task-status-symbol">
                                        {t.status === "done" ? "✓" : t.status === "failed" ? "✕" : "•"}
                                      </span>
                                      <div className="task-text-group">
                                        <strong>{t.description}</strong>
                                        {t.result && <p>{t.result}</p>}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {msg.toolCalls?.length > 0 && (
                              <div className="details-section">
                                <div className="details-section-label">Tools & Vector Retrieval:</div>
                                <div className="details-tools-list">
                                  {msg.toolCalls.map((tc, tci) => (
                                    <div key={tci} className="detail-tool-item">
                                      <div className="tool-name-line">
                                        <span className="tool-badge">{tc.tool}</span>
                                        <span className="tool-in">{tc.input}</span>
                                      </div>
                                      {tc.output && (
                                        <pre className="tool-out-pre">{tc.output}</pre>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="message-row assistant">
                <div className="assistant-bubble loading-bubble">
                  <div className="loading-dots">
                    <span className="dot"></span>
                    <span className="dot"></span>
                    <span className="dot"></span>
                  </div>
                  <span className="loading-label">{appName} is coordinating agents and retrieving context...</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <div className="chat-input-bar">
        <input
          type="file"
          ref={inlineFileInputRef}
          multiple
          accept=".pdf,.txt,.md"
          onChange={handleInlineUpload}
          style={{ display: "none" }}
        />

        <div className="input-box-wrapper">
          <button
            type="button"
            className="btn-attach"
            onClick={() => inlineFileInputRef.current?.click()}
            disabled={uploadingInline || loading}
            title="Attach document to Knowledge Base"
          >
            {uploadingInline ? "⏳" : "📎"}
          </button>

          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={`Ask ${appName} anything about your documents or research...`}
            rows={1}
            disabled={loading}
          />

          <button
            type="button"
            className="btn-send"
            onClick={() => handleSend()}
            disabled={loading || !input.trim()}
            title="Send query"
          >
            ↑
          </button>
        </div>

        <div className="input-hint">
          {docsCount > 0 ? (
            <span>📚 {docsCount} document(s) indexed in active Knowledge Base</span>
          ) : (
            <span>Tip: Click 📎 to attach documents for grounded answers</span>
          )}
        </div>
      </div>
    </div>
  );
}
