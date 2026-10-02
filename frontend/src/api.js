const BASE_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers,
      },
    });
  } catch (err) {
    throw new Error(
      `Cannot connect to backend server at ${BASE_URL}. Ensure the backend is running. (${err.message})`
    );
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const errorData = await res.json();
      if (errorData.detail) message = errorData.detail;
      else if (errorData.message) message = errorData.message;
    } catch {
      const text = await res.text();
      if (text) message = text;
    }
    throw new Error(message);
  }
  return res.json();
}

export function startChat(query, threadId) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ query, thread_id: threadId }),
  });
}

export function approveRun(threadId, approved) {
  return request("/approve", {
    method: "POST",
    body: JSON.stringify({ thread_id: threadId, approved }),
  });
}

export function fetchTrace(threadId) {
  return request(`/trace/${threadId}`, { method: "GET" });
}

export function checkHealth() {
  return request("/health", { method: "GET" });
}

export function getSettings() {
  return request("/settings/status", { method: "GET" });
}

export function saveSettings(settings) {
  return request("/settings/key", {
    method: "POST",
    body: JSON.stringify(settings),
  });
}

export function fetchDocuments() {
  return request("/documents", { method: "GET" });
}

export function uploadDocuments(formData) {
  return request("/documents/upload", {
    method: "POST",
    body: formData,
  });
}

export function deleteDocument(filename) {
  return request(`/documents/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

export function clearDocuments() {
  return request("/documents/clear", {
    method: "POST",
  });
}

export function loadSampleDocuments() {
  return request("/documents/sample", {
    method: "POST",
  });
}

export const loadSampleDocs = loadSampleDocuments;
