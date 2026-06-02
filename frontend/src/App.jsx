import { useState, useRef, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const api = {
  upload: async (file) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${API_BASE}/documents/upload`, { method: "POST", body: form });
    if (!res.ok) throw new Error((await res.json()).detail);
    return res.json();
  },
  listDocs: async () => {
    const res = await fetch(`${API_BASE}/documents`);
    return res.json();
  },
  deleteDoc: async (id) => {
    await fetch(`${API_BASE}/documents/${id}`, { method: "DELETE" });
  },
  query: async (question, docIds) => {
    const res = await fetch(`${API_BASE}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, doc_ids: docIds.length ? docIds : null, top_k: 5 }),
    });
    if (!res.ok) throw new Error((await res.json()).detail);
    return res.json();
  },
};

function FileIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
    </svg>
  );
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 18, height: 18, border: "2px solid #3d3d3a", borderTop: "2px solid #c8ff00",
      borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0
    }}/>
  );
}

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedSource, setExpandedSource] = useState(null);
  const fileRef = useRef();
  const chatRef = useRef();
  const textareaRef = useRef();

  useEffect(() => {
    api.listDocs().then(setDocuments).catch(() => {});
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  const handleUpload = async (files) => {
    const pdfs = Array.from(files).filter(f => f.name.endsWith(".pdf"));
    if (!pdfs.length) return;
    setUploading(true);
    for (const file of pdfs) {
      try {
        const doc = await api.upload(file);
        setDocuments(prev => [...prev, doc]);
        setMessages(prev => [...prev, {
          role: "system",
          text: `📄 Indexed "${doc.filename}" — ${doc.page_count} pages, ${doc.chunk_count} chunks`
        }]);
      } catch (e) {
        setMessages(prev => [...prev, { role: "error", text: `Failed to upload ${file.name}: ${e.message}` }]);
      }
    }
    setUploading(false);
  };

  const handleDelete = async (id) => {
    await api.deleteDoc(id);
    setDocuments(prev => prev.filter(d => d.id !== id));
    setSelectedDocs(prev => prev.filter(x => x !== id));
  };

  const toggleDoc = (id) => {
    setSelectedDocs(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleQuery = async () => {
    const q = input.trim();
    if (!q || querying) return;
    setInput("");
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setQuerying(true);
    try {
      const res = await api.query(q, selectedDocs);
      setMessages(prev => [...prev, { role: "assistant", text: res.answer, sources: res.sources, model: res.model_used }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "error", text: `Query failed: ${e.message}` }]);
    }
    setQuerying(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleQuery(); }
  };

  return (
    <div style={{ fontFamily: "'IBM Plex Mono', 'Courier New', monospace", background: "#0e0e0c", minHeight: "100vh", color: "#e8e6df", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #1a1a17; }
        ::-webkit-scrollbar-thumb { background: #3d3d3a; border-radius: 2px; }
        textarea:focus { outline: none; }
        button { cursor: pointer; }
        .doc-row:hover { background: #1e1e1b !important; }
        .doc-row:hover .del-btn { opacity: 1 !important; }
        .msg { animation: fadeUp 0.25s ease; }
        .upload-area:hover { border-color: #c8ff00 !important; background: #141412 !important; }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #2a2a27", padding: "14px 24px", display: "flex", alignItems: "center", gap: 12, background: "#0e0e0c" }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#c8ff00", animation: "pulse 2s infinite" }}/>
        <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: "#c8ff00" }}>RAG Research Assistant</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#5a5a56", letterSpacing: "0.08em" }}>FastAPI · LangChain · ChromaDB · GPT-4o-mini</span>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden", height: "calc(100vh - 49px)" }}>

        {/* Sidebar */}
        <div style={{ width: 280, borderRight: "1px solid #2a2a27", display: "flex", flexDirection: "column", background: "#0b0b09" }}>
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #1e1e1b" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.14em", color: "#5a5a56", textTransform: "uppercase", marginBottom: 10 }}>Documents</div>

            {/* Upload area */}
            <div
              className="upload-area"
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files); }}
              onClick={() => fileRef.current.click()}
              style={{
                border: `1px dashed ${dragOver ? "#c8ff00" : "#3a3a37"}`,
                borderRadius: 6,
                padding: "14px 10px",
                textAlign: "center",
                cursor: "pointer",
                transition: "all 0.2s",
                background: dragOver ? "#141412" : "transparent"
              }}
            >
              <input ref={fileRef} type="file" accept=".pdf" multiple onChange={e => handleUpload(e.target.files)} style={{ display: "none" }}/>
              {uploading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <Spinner/>
                  <span style={{ fontSize: 11, color: "#8a8a84" }}>Indexing...</span>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 18, marginBottom: 4 }}>⊕</div>
                  <div style={{ fontSize: 11, color: "#8a8a84" }}>Drop PDFs or click to upload</div>
                </>
              )}
            </div>
          </div>

          {/* Document list */}
          <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
            {documents.length === 0 ? (
              <div style={{ padding: "20px 16px", fontSize: 11, color: "#3a3a37", textAlign: "center" }}>No documents indexed</div>
            ) : (
              documents.map(doc => (
                <div
                  key={doc.id}
                  className="doc-row"
                  style={{
                    padding: "8px 14px",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    background: selectedDocs.includes(doc.id) ? "#1a2a0a" : "transparent",
                    transition: "background 0.15s",
                    borderLeft: selectedDocs.includes(doc.id) ? "2px solid #c8ff00" : "2px solid transparent"
                  }}
                  onClick={() => toggleDoc(doc.id)}
                >
                  <div style={{ color: selectedDocs.includes(doc.id) ? "#c8ff00" : "#5a5a56", flexShrink: 0 }}>
                    <FileIcon/>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, color: "#c8c6be", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.filename}</div>
                    <div style={{ fontSize: 10, color: "#4a4a46", marginTop: 2 }}>{doc.page_count}p · {doc.chunk_count} chunks · {doc.size_kb}kb</div>
                  </div>
                  <button
                    className="del-btn"
                    onClick={(e) => { e.stopPropagation(); handleDelete(doc.id); }}
                    style={{ opacity: 0, background: "none", border: "none", color: "#5a5a56", padding: 2, transition: "opacity 0.15s", flexShrink: 0 }}
                  >
                    <TrashIcon/>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Filter indicator */}
          {selectedDocs.length > 0 && (
            <div style={{ padding: "10px 14px", borderTop: "1px solid #1e1e1b", fontSize: 10, color: "#c8ff00", letterSpacing: "0.08em" }}>
              ◆ Filtering {selectedDocs.length} doc{selectedDocs.length > 1 ? "s" : ""}
              <button onClick={() => setSelectedDocs([])} style={{ marginLeft: 8, background: "none", border: "none", color: "#5a5a56", fontSize: 10, cursor: "pointer" }}>clear</button>
            </div>
          )}
        </div>

        {/* Main chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Messages */}
          <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.length === 0 && (
              <div style={{ margin: "auto", textAlign: "center", maxWidth: 400 }}>
                <div style={{ fontSize: 28, marginBottom: 12, opacity: 0.3 }}>◈</div>
                <div style={{ fontSize: 13, color: "#4a4a46", lineHeight: 1.8 }}>
                  Upload PDFs to index them, then ask questions across your documents. Semantic search + GPT-4o-mini.
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="msg">
                {msg.role === "user" && (
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <div style={{ maxWidth: "72%", background: "#1a1a17", border: "1px solid #2e2e2b", borderRadius: "10px 10px 2px 10px", padding: "10px 14px", fontSize: 13, lineHeight: 1.6, color: "#e8e6df" }}>
                      {msg.text}
                    </div>
                  </div>
                )}

                {msg.role === "assistant" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: "85%" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#c8ff00" }}/>
                      <span style={{ fontSize: 10, color: "#5a5a56", letterSpacing: "0.1em" }}>{msg.model}</span>
                    </div>
                    <div style={{ background: "#121210", border: "1px solid #2a2a27", borderRadius: "2px 10px 10px 10px", padding: "12px 16px", fontSize: 13, lineHeight: 1.8, color: "#d8d6cf", whiteSpace: "pre-wrap" }}>
                      {msg.text}
                    </div>

                    {/* Sources */}
                    {msg.sources?.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                        {msg.sources.map((src, j) => (
                          <button
                            key={j}
                            onClick={() => setExpandedSource(expandedSource === `${i}-${j}` ? null : `${i}-${j}`)}
                            style={{
                              background: expandedSource === `${i}-${j}` ? "#1a2a0a" : "#141412",
                              border: `1px solid ${expandedSource === `${i}-${j}` ? "#c8ff00" : "#2a2a27"}`,
                              borderRadius: 4,
                              padding: "4px 10px",
                              fontSize: 10,
                              color: expandedSource === `${i}-${j}` ? "#c8ff00" : "#6a6a64",
                              cursor: "pointer",
                              letterSpacing: "0.06em",
                              transition: "all 0.15s"
                            }}
                          >
                            {src.filename} p.{src.page}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Expanded source */}
                    {msg.sources?.map((src, j) =>
                      expandedSource === `${i}-${j}` ? (
                        <div key={j} style={{ background: "#0e0e0c", border: "1px solid #2a2a27", borderRadius: 6, padding: "10px 14px", fontSize: 11, color: "#7a7a74", lineHeight: 1.7, fontFamily: "'IBM Plex Sans', sans-serif" }}>
                          <div style={{ marginBottom: 6, color: "#5a5a56", fontSize: 10, letterSpacing: "0.08em" }}>
                            {src.filename} — page {src.page}
                          </div>
                          {src.content}
                        </div>
                      ) : null
                    )}
                  </div>
                )}

                {(msg.role === "system" || msg.role === "error") && (
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 11, color: msg.role === "error" ? "#ff6b6b" : "#4a6a2a", background: msg.role === "error" ? "#1a0a0a" : "#0e1a0a", border: `1px solid ${msg.role === "error" ? "#3a1a1a" : "#1e2e0e"}`, borderRadius: 4, padding: "4px 12px" }}>
                      {msg.text}
                    </span>
                  </div>
                )}
              </div>
            ))}

            {querying && (
              <div className="msg" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Spinner/>
                <span style={{ fontSize: 11, color: "#4a4a46" }}>Retrieving and generating...</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ borderTop: "1px solid #1e1e1b", padding: "14px 20px", background: "#0b0b09" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", background: "#141412", border: "1px solid #2a2a27", borderRadius: 8, padding: "10px 14px", transition: "border-color 0.2s" }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={documents.length === 0 ? "Upload documents first..." : "Ask a question about your documents..."}
                disabled={documents.length === 0 || querying}
                rows={1}
                style={{
                  flex: 1, background: "none", border: "none", color: "#e8e6df", fontSize: 13,
                  resize: "none", lineHeight: 1.6, fontFamily: "inherit",
                  maxHeight: 120, overflowY: "auto", opacity: documents.length === 0 ? 0.4 : 1
                }}
                onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
              />
              <button
                onClick={handleQuery}
                disabled={!input.trim() || querying || documents.length === 0}
                style={{
                  background: input.trim() && !querying && documents.length > 0 ? "#c8ff00" : "#1e1e1b",
                  border: "none", borderRadius: 6, padding: "7px 10px",
                  color: input.trim() && !querying && documents.length > 0 ? "#0e0e0c" : "#3a3a37",
                  transition: "all 0.2s", flexShrink: 0
                }}
              >
                <SendIcon/>
              </button>
            </div>
            <div style={{ marginTop: 6, fontSize: 10, color: "#3a3a37", paddingLeft: 2 }}>
              Enter to send · Shift+Enter for newline{selectedDocs.length > 0 ? ` · Querying ${selectedDocs.length} selected doc(s)` : " · Querying all documents"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
