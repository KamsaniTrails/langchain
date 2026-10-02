export default function WorkflowGraph({ activeNode, awaitingApproval, state }) {
  const nodes = [
    { id: "planner", label: "Planner", role: "Decomposes query into sub-tasks", icon: "🧠" },
    { id: "human_approval", label: "Approval Gate", role: "Human-in-the-loop review", icon: "🛡️" },
    { id: "retriever", label: "Retriever", role: "FAISS vector search", icon: "🔍" },
    { id: "executor", label: "Executor", role: "Gemini function calling & tools", icon: "⚡" },
    { id: "synthesizer", label: "Synthesizer", role: "Aggregates findings", icon: "✨" },
  ];

  function getNodeStatus(nodeId) {
    if (awaitingApproval && nodeId === "human_approval") {
      return "waiting";
    }
    if (activeNode === nodeId) {
      return "active";
    }
    if (state?.next_nodes?.includes(nodeId)) {
      return "next";
    }
    if (state?.final_answer && (nodeId === "synthesizer" || nodeId === "planner")) {
      return "completed";
    }
    return "idle";
  }

  return (
    <div className="workflow-graph-card">
      <div className="graph-header">
        <div className="graph-title-group">
          <span className="graph-dot live-pulse"></span>
          <h4>LangGraph Multi-Agent Architecture</h4>
        </div>
        <span className="graph-badge">Cyclic StateGraph</span>
      </div>

      <div className="graph-nodes-container">
        {nodes.map((node, index) => {
          const status = getNodeStatus(node.id);
          return (
            <div key={node.id} className="graph-node-wrapper">
              <div className={`graph-node status-${status}`}>
                <div className="node-icon-bubble">{node.icon}</div>
                <div className="node-info">
                  <div className="node-title">{node.label}</div>
                  <div className="node-sub">{node.role}</div>
                </div>
                {status === "active" && <span className="node-pulse-ring"></span>}
                {status === "waiting" && <span className="node-gate-tag">Paused</span>}
              </div>
              {index < nodes.length - 1 && (
                <div className="graph-edge">
                  <span className="edge-arrow">➜</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="graph-footer-caption">
        <span>🔄 State persists per thread via MemorySaver</span>
        <span>• Auto-retry loop on executor failure (up to 2x)</span>
      </div>
    </div>
  );
}
