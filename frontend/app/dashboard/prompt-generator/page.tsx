"use client";

import { useState, useEffect, useRef } from "react";

/* ─── Types ─── */
type SavedPrompt = {
  id: string;
  name: string;
  variant: string;
  prompt_text: string;
  config_json: Record<string, unknown> | null;
  industry: string | null;
  region: string | null;
  strictness: number;
  keywords: string | null;
  created_at: string;
};
type Variants = { Strict: string | null; Balanced: string | null; Adaptive: string | null };

const INDUSTRIES = ["SaaS Support", "Marketplace", "FinTech", "Healthcare-lite", "Education"];
const REGIONS = ["US", "EU", "CA", "Global"];

const MODERNITY_LABELS: Record<number, string> = {
  1: "STRICT", 2: "REGULATED", 3: "MODERATE", 4: "FLEXIBLE", 5: "FLUID",
};

const variantMeta: Record<string, { color: string; border: string; bg: string }> = {
  Strict:   { color: "#f43f5e", border: "rgba(244,63,94,0.25)",  bg: "rgba(244,63,94,0.1)" },
  Balanced: { color: "#7c3aed", border: "rgba(124,58,237,0.25)", bg: "rgba(124,58,237,0.1)" },
  Adaptive: { color: "#10b981", border: "rgba(16,185,129,0.25)", bg: "rgba(16,185,129,0.1)" },
};

export default function PromptArchitectPage() {
  /* ── existing state ── */
  const [keywords, setKeywords] = useState("");
  const [baseInstruction, setBaseInstruction] = useState("");
  const [industry, setIndustry] = useState("SaaS Support");
  const [strictness, setStrictness] = useState(2);
  const [region, setRegion] = useState("US");
  const [addDisclaimers, setAddDisclaimers] = useState(false);
  const [allowRewrite, setAllowRewrite] = useState(true);
  const [escalateToHuman, setEscalateToHuman] = useState(false);
  const [selectedModel, setSelectedModel] = useState("");
  const [nvModels, setNvModels] = useState<string[]>([]);

  /* ── PDF ── */
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [policyText, setPolicyText] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ── generation ── */
  const [variants, setVariants] = useState<Variants | null>(null);
  const [activeTab, setActiveTab] = useState<"Strict" | "Balanced" | "Adaptive">("Strict");
  const [generating, setGenerating] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);

  /* ── library ── */
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [loadingPrompts, setLoadingPrompts] = useState(true);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);

  /* ── token counter ── */
  useEffect(() => {
    const combined = [baseInstruction, keywords].filter(Boolean).join(" ");
    setTokenCount(Math.floor(combined.length / 4));
  }, [baseInstruction, keywords]);

  function showToast(message: string, type = "success") {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 3000);
  }

  async function loadPrompts() {
    try {
      const res = await fetch("/api/prompts");
      if (res.ok) setSavedPrompts(await res.json());
    } catch { /* silent */ } finally { setLoadingPrompts(false); }
  }

  useEffect(() => { loadPrompts(); }, []);

  // Load NVIDIA models from nv_models.json via API
  useEffect(() => {
    fetch("/api/nv-models")
      .then((r) => r.json())
      .then((list: string[]) => {
        setNvModels(list);
        if (list.length > 0) setSelectedModel(list[0]);
      })
      .catch(() => {});
  }, []);

  async function extractPdf(file: File) {
    setExtracting(true);
    setPolicyText("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/prompts/extract-policy", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setPolicyText(data.text);
      showToast(`Extracted ${data.pages} pages, ${data.chars.toLocaleString()} chars`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "PDF extraction failed", "error");
      setPdfFile(null);
    } finally {
      setExtracting(false);
    }
  }

  function handleFileSelect(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      showToast("Only PDF files are supported", "error");
      return;
    }
    setPdfFile(file);
    extractPdf(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }

  function clearPdf() {
    setPdfFile(null);
    setPolicyText("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleGenerate() {
    setGenerating(true);
    try {
      const combinedKeywords = [baseInstruction.trim(), keywords.trim()].filter(Boolean).join("\n\n") || null;
      const res = await fetch("/api/prompts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keywords: combinedKeywords,
          policy_text: policyText || null,
          industry,
          region,
          strictness,
          add_disclaimers: addDisclaimers,
          allow_rewrite: allowRewrite,
          escalate_to_human: escalateToHuman,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setVariants(data.variants);
      setActiveTab("Strict");
      showToast(`Generated via ${data.model}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Generation failed", "error");
    } finally {
      setGenerating(false);
    }
  }

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard", "info"));
  }

  async function handleSave() {
    if (!variants) return;
    const text = variants[activeTab];
    if (!text) return;
    try {
      const res = await fetch("/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${industry} - ${activeTab} (${keywords.split(",")[0].trim() || "policy"})`,
          variant: activeTab,
          prompt_text: text,
          config_json: null,
          industry,
          region,
          strictness,
          keywords: keywords || null,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      await loadPrompts();
      showToast("Prompt saved to library");
    } catch {
      showToast("Failed to save prompt", "error");
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/prompts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
      showToast("Prompt deleted", "info");
    } catch {
      showToast("Failed to delete prompt", "error");
    }
  }

  function loadIntoInputs(p: SavedPrompt) {
    if (p.keywords) setKeywords(p.keywords);
    if (p.industry) setIndustry(p.industry);
    if (p.strictness) setStrictness(p.strictness);
    if (p.region) setRegion(p.region);
    showToast("Loaded into inputs", "info");
  }

  const canGenerate = !generating && !extracting && (baseInstruction.trim().length > 0 || keywords.trim().length > 0 || policyText.length > 0);
  const activeText = variants?.[activeTab] ?? null;

  return (
    <div className="page-reveal">
      {/* ── Page heading ── */}
      <section className="section-reveal" style={{ maxWidth: "680px", marginBottom: "44px" }}>
        <h2 style={{ fontFamily: "Syne, sans-serif", fontWeight: 800, fontSize: "44px", letterSpacing: "-2px", color: "#f0f2ff", lineHeight: 1.05, marginBottom: "16px" }}>
          Engineer enterprise-grade prompts.
        </h2>
        <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 300, fontSize: "16px", color: "rgba(240,242,255,0.5)", lineHeight: 1.7 }}>
          Aligned with your organization&apos;s legal and ethical charters. VeldrixAI ensures every model interaction complies with internal governance automatically.
        </p>
      </section>

      {/* ── Policy Integration Bento ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "16px" }}>
        {/* Left: Upload Corporate Policy */}
        <PolicBentoCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>}
          title="Upload Corporate Policy"
        >
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !pdfFile && fileInputRef.current?.click()}
            style={{
              border: `2px dashed ${dragOver ? "rgba(124,58,237,0.5)" : pdfFile ? "rgba(6,182,212,0.4)" : "rgba(255,255,255,0.1)"}`,
              borderRadius: "14px", padding: "40px 24px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: dragOver ? "rgba(124,58,237,0.06)" : pdfFile ? "rgba(6,182,212,0.06)" : "rgba(255,255,255,0.02)",
              cursor: pdfFile ? "default" : "pointer", transition: "all 0.3s",
            }}
          >
            <input ref={fileInputRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); }}/>
            {extracting ? (
              <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.5)" }}>Extracting text…</p>
            ) : pdfFile ? (
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "13px", color: "#06b6d4", marginBottom: "4px" }}>✓ {pdfFile.name}</div>
                <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.3)", marginBottom: "12px" }}>{policyText.length.toLocaleString()} chars extracted</div>
                <button onClick={(e) => { e.stopPropagation(); clearPdf(); }} style={{ padding: "5px 14px", borderRadius: "7px", fontSize: "11px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, background: "rgba(255,255,255,0.05)", color: "rgba(240,242,255,0.6)", border: "1px solid rgba(255,255,255,0.08)", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            ) : (
              <>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(240,242,255,0.2)" strokeWidth="1" style={{ marginBottom: "14px" }}>
                  <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                  <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
                </svg>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 400, fontSize: "13px", color: "rgba(240,242,255,0.35)", textAlign: "center" }}>Drag and drop policy documents here</p>
                <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.2)", marginTop: "5px" }}>Supports PDF · Max 25MB</p>
              </>
            )}
          </div>
        </PolicBentoCard>

        {/* Right: Manual Governance Keywords */}
        <PolicBentoCard
          icon={<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
          title="Manual Governance Keywords"
        >
          <FocusTextarea
            value={keywords}
            onChange={setKeywords}
            placeholder={"e.g. 'Exclude competitive mentions', 'Strict PII scrubbing', 'Maintain formal executive tone'..."}
            rows={6}
          />
        </PolicBentoCard>
      </div>

      {/* ── Configuration Panel ── */}
      <div className="glass-panel" style={{ padding: "22px 28px", borderRadius: "20px", marginBottom: "16px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "28px", border: "1px solid rgba(124,58,237,0.12)" }}>
        {/* Modernity slider */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "260px", flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <label style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)" }}>
              Modernity Level
            </label>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", fontWeight: 700, color: "#7c3aed" }}>
              {MODERNITY_LABELS[strictness]}
            </span>
          </div>
          <input type="range" min="1" max="5" value={strictness} onChange={(e) => setStrictness(Number(e.target.value))}
            style={{ accentColor: "#7c3aed", width: "100%", cursor: "pointer" }}/>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "DM Sans, sans-serif", fontSize: "10px", color: "rgba(240,242,255,0.25)" }}>
            <span>Strict</span><span>Fluid</span>
          </div>
        </div>

        <div style={{ width: "1px", height: "48px", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}/>

        {/* Industry + Region */}
        <div style={{ display: "flex", gap: "16px", flex: 1, minWidth: "260px" }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: "8px" }}>
              Industry
            </label>
            <select value={industry} onChange={(e) => setIndustry(e.target.value)} style={{ background: "#111422", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "9px 12px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "13px", outline: "none", cursor: "pointer", width: "100%" }}>
              {INDUSTRIES.map((i) => <option key={i}>{i}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: "block", fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: "8px" }}>
              Region
            </label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} style={{ background: "#111422", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "9px 12px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "13px", outline: "none", cursor: "pointer", width: "100%" }}>
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>

        <div style={{ width: "1px", height: "48px", background: "rgba(255,255,255,0.06)", flexShrink: 0 }}/>

        {/* Model selection */}
        <div style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "block", fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 600, letterSpacing: "3px", textTransform: "uppercase", color: "rgba(240,242,255,0.35)", marginBottom: "8px" }}>
            Model Selection
          </label>
          <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)} style={{ background: "#111422", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "9px 12px", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "13px", outline: "none", cursor: "pointer", width: "100%" }}>
            {nvModels.length === 0 ? (
              <option value="">Loading models…</option>
            ) : nvModels.map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
        </div>

        {/* Policy toggles */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: "180px" }}>
          {[
            { label: "Add disclaimers", val: addDisclaimers, set: setAddDisclaimers },
            { label: "Allow rewrite", val: allowRewrite, set: setAllowRewrite },
            { label: "Escalate to human", val: escalateToHuman, set: setEscalateToHuman },
          ].map(({ label, val, set }) => (
            <label key={label} style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
              <div
                onClick={() => set(!val)}
                style={{
                  width: "32px", height: "18px", borderRadius: "9px", position: "relative",
                  background: val ? "#7c3aed" : "rgba(255,255,255,0.08)",
                  transition: "background 0.2s", cursor: "pointer", flexShrink: 0,
                }}
              >
                <div style={{
                  width: "12px", height: "12px", borderRadius: "50%", background: "white",
                  position: "absolute", top: "3px", left: val ? "17px" : "3px", transition: "left 0.2s",
                }}/>
              </div>
              <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "11px", color: "rgba(240,242,255,0.5)" }}>{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* ── Architect Workspace ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "32px" }}>
        {/* Left: Base Prompt Input */}
        <div style={{ background: "#0d0f1a", borderRadius: "16px", display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", height: "500px" }}>
          <div style={{ background: "#111422", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)" }}>
              Base Prompt Input
            </span>
            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "10px", color: "rgba(240,242,255,0.2)", background: "rgba(255,255,255,0.04)", padding: "2px 8px", borderRadius: "4px" }}>
              {tokenCount} / 4000 tokens
            </span>
          </div>
          <div style={{ flex: 1, padding: "20px", position: "relative", display: "flex", flexDirection: "column" }}>
            <textarea
              value={baseInstruction}
              onChange={(e) => setBaseInstruction(e.target.value)}
              placeholder="Enter your raw instruction or request here..."
              style={{ flex: 1, width: "100%", background: "transparent", border: "none", color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "14px", lineHeight: 1.7, resize: "none", outline: "none" }}
            />
            {/* Generate button */}
            <div style={{ marginTop: "12px" }}>
              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                style={{
                  width: "100%", padding: "12px", borderRadius: "12px",
                  background: canGenerate ? "linear-gradient(135deg, #9f67ff 0%, #7c3aed 50%, #4f46e5 100%)" : "rgba(255,255,255,0.06)",
                  color: canGenerate ? "white" : "rgba(240,242,255,0.3)",
                  border: "none", fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "13px",
                  cursor: canGenerate ? "pointer" : "not-allowed", transition: "all 0.2s",
                  boxShadow: canGenerate ? "0 4px 20px rgba(124,58,237,0.3)" : "none",
                }}
              >
                {generating ? "Generating via NIM…" : "Generate Prompts →"}
              </button>
            </div>
          </div>
        </div>

        {/* Right: Generated output */}
        <div style={{ background: "#0d0f1a", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden", height: "500px", display: "flex", flexDirection: "column" }}>
          <div style={{ background: "#111422", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
            <span style={{ fontFamily: "DM Sans, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)" }}>
              Generated Prompt Templates
            </span>
          </div>

          {!variants ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", textAlign: "center" }}>
              {generating ? (
                <>
                  <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: "2px solid rgba(124,58,237,0.2)", borderTopColor: "#7c3aed", animation: "spin 0.9s linear infinite", marginBottom: "16px" }}/>
                  <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.4)" }}>Calling NVIDIA NIM…</p>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              ) : (
                <>
                  <svg width="40" height="40" viewBox="0 0 48 48" fill="none" style={{ marginBottom: "16px" }}>
                    <path d="M24 4L6 14v20l18 10 18-10V14L24 4z" stroke="url(#pag)" strokeWidth="2" fill="none"/>
                    <circle cx="24" cy="8" r="2" fill="#06b6d4"/>
                    <circle cx="24" cy="8" r="1" fill="white"/>
                    <defs>
                      <linearGradient id="pag" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse">
                        <stop stopColor="#f0f2ff" stopOpacity="0.6"/><stop offset="1" stopColor="#7c3aed" stopOpacity="0.4"/>
                      </linearGradient>
                    </defs>
                  </svg>
                  <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.35)", lineHeight: 1.6 }}>
                    Enter a base prompt or governance keywords and click Generate.
                  </p>
                </>
              )}
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Tabs */}
              <div style={{ display: "flex", gap: "0", borderBottom: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
                {(["Strict", "Balanced", "Adaptive"] as const).map((tab) => {
                  const meta = variantMeta[tab];
                  return (
                    <button key={tab} onClick={() => setActiveTab(tab)} style={{
                      flex: 1, padding: "11px 8px", border: "none", cursor: "pointer",
                      fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "10px",
                      letterSpacing: "1.5px", textTransform: "uppercase", transition: "all 0.2s",
                      background: activeTab === tab ? meta.bg : "transparent",
                      color: activeTab === tab ? meta.color : "rgba(240,242,255,0.3)",
                      borderBottom: activeTab === tab ? `2px solid ${meta.color}` : "2px solid transparent",
                    }}>
                      {tab}
                    </button>
                  );
                })}
              </div>

              {/* Output */}
              {activeText ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }} className="hide-scrollbar">
                    <pre style={{ fontFamily: "JetBrains Mono, monospace", fontSize: "12px", color: "rgba(240,242,255,0.75)", lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>
                      {activeText}
                    </pre>
                  </div>
                  <div style={{ padding: "12px 16px", borderTop: "1px solid rgba(255,255,255,0.05)", display: "flex", gap: "8px", flexShrink: 0 }}>
                    <button onClick={handleSave} style={{ flex: 1, padding: "9px", background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "11px", cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase" }}>
                      Save to Library
                    </button>
                    <button onClick={() => handleCopy(activeText)} style={{ flex: 1, padding: "9px", background: "rgba(255,255,255,0.04)", color: "rgba(240,242,255,0.6)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "11px", cursor: "pointer", letterSpacing: "1px", textTransform: "uppercase" }}>
                      Copy
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.35)" }}>Generation failed for this variant.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Prompt Library ── */}
      <div style={{ background: "#0a0c15", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "15px", color: "#f0f2ff" }}>Prompt Library</h3>
            <span style={{ padding: "3px 10px", borderRadius: "20px", fontSize: "10px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1px", background: "rgba(124,58,237,0.15)", color: "#a78bfa", border: "1px solid rgba(124,58,237,0.25)" }}>
              {savedPrompts.length} saved
            </span>
          </div>
        </div>

        {loadingPrompts ? (
          <div style={{ padding: "48px", textAlign: "center", color: "rgba(240,242,255,0.35)", fontFamily: "DM Sans, sans-serif", fontSize: "13px" }}>Loading…</div>
        ) : savedPrompts.length === 0 ? (
          <div style={{ padding: "48px", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
              <path d="M24 4L6 14v20l18 10 18-10V14L24 4z" stroke="url(#pag2)" strokeWidth="2" fill="none"/>
              <circle cx="24" cy="8" r="2" fill="#06b6d4"/><circle cx="24" cy="8" r="1" fill="white"/>
              <defs><linearGradient id="pag2" x1="24" y1="4" x2="24" y2="44" gradientUnits="userSpaceOnUse"><stop stopColor="#f0f2ff" stopOpacity="0.6"/><stop offset="1" stopColor="#7c3aed" stopOpacity="0.4"/></linearGradient></defs>
            </svg>
            <p style={{ fontFamily: "DM Sans, sans-serif", fontSize: "13px", color: "rgba(240,242,255,0.35)", textAlign: "center" }}>No saved prompts yet. Generate and save prompts to build your library.</p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.02)" }}>
                  {["Name", "Created", "Variant", "Industry", "Region", "Actions"].map((col) => (
                    <th key={col} style={{ padding: "12px 20px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: "9px", letterSpacing: "2px", textTransform: "uppercase", color: "rgba(240,242,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {savedPrompts.map((p, pi) => {
                  const vm = variantMeta[p.variant] ?? variantMeta.Balanced;
                  return (
                    <tr key={p.id} className={`row-in ri-${Math.min(pi + 1, 4)}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s", cursor: "default" }}>
                      <td style={{ padding: "14px 20px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, fontSize: "13px", color: "#f0f2ff" }}>{p.name}</td>
                      <td style={{ padding: "14px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.35)" }}>
                        {new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </td>
                      <td style={{ padding: "14px 20px" }}>
                        <span style={{ padding: "3px 10px", borderRadius: "6px", fontSize: "9px", fontFamily: "DM Sans, sans-serif", fontWeight: 700, letterSpacing: "1.5px", textTransform: "uppercase", background: vm.bg, color: vm.color, border: `1px solid ${vm.border}` }}>
                          {p.variant}
                        </span>
                      </td>
                      <td style={{ padding: "14px 20px", fontFamily: "DM Sans, sans-serif", fontSize: "12px", color: "rgba(240,242,255,0.5)" }}>{p.industry || "—"}</td>
                      <td style={{ padding: "14px 20px", fontFamily: "JetBrains Mono, monospace", fontSize: "11px", color: "rgba(240,242,255,0.4)" }}>{p.region || "—"}</td>
                      <td style={{ padding: "14px 16px" }}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          {[
                            { label: "Copy", action: () => handleCopy(p.prompt_text), color: "rgba(240,242,255,0.6)", bg: "rgba(255,255,255,0.04)" },
                            { label: "Load", action: () => loadIntoInputs(p), color: "#7c3aed", bg: "rgba(124,58,237,0.1)" },
                            { label: "Delete", action: () => handleDelete(p.id), color: "#f43f5e", bg: "rgba(244,63,94,0.08)" },
                          ].map(({ label, action, color, bg }) => (
                            <button key={label} onClick={action} style={{ padding: "5px 10px", borderRadius: "7px", fontSize: "10px", fontFamily: "DM Sans, sans-serif", fontWeight: 600, background: bg, color, border: "1px solid rgba(255,255,255,0.06)", cursor: "pointer", letterSpacing: "0.5px" }}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Toast notifications ── */}
      <div style={{ position: "fixed", bottom: "24px", right: "24px", display: "flex", flexDirection: "column", gap: "8px", zIndex: 9999 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{
            padding: "12px 18px", borderRadius: "12px", fontSize: "13px",
            fontFamily: "DM Sans, sans-serif", fontWeight: 500,
            background: t.type === "error" ? "rgba(244,63,94,0.15)" : t.type === "info" ? "rgba(6,182,212,0.15)" : "rgba(16,185,129,0.15)",
            color: t.type === "error" ? "#f43f5e" : t.type === "info" ? "#06b6d4" : "#10b981",
            border: `1px solid ${t.type === "error" ? "rgba(244,63,94,0.3)" : t.type === "info" ? "rgba(6,182,212,0.3)" : "rgba(16,185,129,0.3)"}`,
            backdropFilter: "blur(12px)", animation: "secIn 0.3s cubic-bezier(0.16,1,0.3,1) both",
          }}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function PolicBentoCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <div
      className="glass-panel"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ padding: "28px", borderRadius: "20px", transition: "all 0.3s", borderColor: hov ? "rgba(124,58,237,0.3)" : "rgba(255,255,255,0.06)" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
        {icon}
        <h3 style={{ fontFamily: "Syne, sans-serif", fontWeight: 700, fontSize: "16px", color: "#f0f2ff" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function FocusTextarea({ value, onChange, placeholder, rows }: { value: string; onChange: (v: string) => void; placeholder: string; rows: number }) {
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${focused ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.07)"}`,
        borderRadius: "14px", padding: "16px",
        color: "#f0f2ff", fontFamily: "DM Sans, sans-serif", fontSize: "14px",
        lineHeight: 1.6, resize: "none", outline: "none", transition: "border-color 0.2s",
      }}
    />
  );
}
