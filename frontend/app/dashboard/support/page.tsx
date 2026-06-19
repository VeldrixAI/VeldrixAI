"use client";

import React, { useState, useEffect } from "react";

/* ── Constants ─────────────────────────────────────────────────────────────── */

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  bug_report: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    </svg>
  ),
  billing: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  sdk_integration: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>
    </svg>
  ),
  api_keys: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"/>
    </svg>
  ),
  feature_request: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  security: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  ),
  general: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  ),
};

const CATEGORIES = [
  { id: "bug_report",      label: "Bug Report",      color: "#be7468" },
  { id: "billing",         label: "Billing",         color: "#c2a06a" },
  { id: "sdk_integration", label: "SDK",             color: "#2d4a5e" },
  { id: "api_keys",        label: "API & Keys",      color: "#aab8c0" },
  { id: "feature_request", label: "Feature Request", color: "#6fa98f" },
  { id: "security",        label: "Security",        color: "#d29a91" },
  { id: "general",         label: "General",         color: "#94a3b8" },
] as const;

const PRIORITIES = [
  { id: "low",      label: "Low",      color: "#6fa98f", bg: "rgba(111,169,143,0.08)",  border: "rgba(111,169,143,0.25)",  sla: "3–5 business days" },
  { id: "medium",   label: "Medium",   color: "#c2a06a", bg: "rgba(194,160,106,0.08)",  border: "rgba(194,160,106,0.25)",  sla: "1–2 business days" },
  { id: "high",     label: "High",     color: "#c2a06a", bg: "rgba(194,160,106,0.08)",  border: "rgba(194,160,106,0.25)",  sla: "Within 4 hours" },
  { id: "critical", label: "Critical", color: "#be7468", bg: "rgba(190,116,104,0.08)",   border: "rgba(190,116,104,0.25)",   sla: "Within 1 hour" },
] as const;

const SVC_STATUS = [
  "Trust Evaluation Engine",
  "API Gateway",
  "Governance Dashboard",
  "SDK & Connectors",
  "Billing & Payments",
];

const PRIORITY_COLOR: Record<string, string> = {
  low: "#6fa98f", medium: "#c2a06a", high: "#c2a06a", critical: "#be7468",
};
const STATUS_COLOR: Record<string, string> = {
  open: "#aab8c0", in_progress: "#c2a06a", resolved: "#6fa98f", closed: "#94a3b8",
};

/* ── Types ──────────────────────────────────────────────────────────────────── */

type Ticket = {
  ticket_id:  string;
  subject:    string;
  category:   string;
  priority:   string;
  status:     string;
  created_at: string;
};

type SuccessState = { ticket_id: string; user_email: string };

/* ── Page ───────────────────────────────────────────────────────────────────── */

export default function SupportPage() {
  const [category,    setCategory]    = useState("general");
  const [subject,     setSubject]     = useState("");
  const [description, setDescription] = useState("");
  const [email,       setEmail]       = useState("");
  const [priority,    setPriority]    = useState("medium");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState<SuccessState | null>(null);
  const [history,     setHistory]     = useState<Ticket[]>([]);

  /* pre-fill email from logged-in user */
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => { if (d?.email) setEmail(d.email); })
      .catch(() => {});
    loadHistory();
  }, []);

  async function loadHistory() {
    try {
      const r = await fetch("/api/support");
      if (r.ok) setHistory(await r.json());
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!subject.trim())            return setError("Subject is required.");
    if (description.trim().length < 20)  return setError("Description must be at least 20 characters.");
    if (!email.trim())              return setError("Contact email is required.");

    setLoading(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_email:  email.trim(),
          subject:     subject.trim(),
          category,
          priority,
          description: description.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.detail || "Submission failed");
      setSuccess({ ticket_id: data.ticket_id, user_email: data.user_email });
      loadHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit ticket");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setSuccess(null);
    setSubject("");
    setDescription("");
    setCategory("general");
    setPriority("medium");
    setError("");
  }

  const descLen = description.length;
  const descMax = 5000;
  const descCountColor =
    descLen / descMax > 0.95 ? "#be7468" :
    descLen / descMax > 0.80 ? "#c2a06a" :
    "rgba(231,236,239,0.25)";

  /* ── Render ─────────────────────────────────────────────────────────────── */
  return (
    <div className="vx-content" style={{ position: "relative" }}>

      {/* ── Keyframes + micro-interaction classes ── */}
      <style>{`
        @keyframes vxAurora1 {
          0%,100% { transform: translate(0,0) scale(1); opacity:.55; }
          40%      { transform: translate(35px,-25px) scale(1.12); opacity:.75; }
          70%      { transform: translate(-18px,18px) scale(.94); opacity:.45; }
        }
        @keyframes vxAurora2 {
          0%,100% { transform: translate(0,0) scale(1); opacity:.4; }
          35%      { transform: translate(-30px,22px) scale(1.09); opacity:.6; }
          65%      { transform: translate(22px,-12px) scale(.91); opacity:.3; }
        }
        @keyframes vxFadeUp {
          from { opacity:0; transform:translateY(22px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes vxFadeLeft {
          from { opacity:0; transform:translateX(-18px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes vxFadeRight {
          from { opacity:0; transform:translateX(18px); }
          to   { opacity:1; transform:translateX(0); }
        }
        @keyframes vxPulseDot {
          0%,100% { box-shadow:0 0 0 0 rgba(111,169,143,.55); }
          50%      { box-shadow:0 0 0 5px rgba(111,169,143,0); }
        }
        @keyframes vxSpin {
          to { transform:rotate(360deg); }
        }
        @keyframes vxScaleIn {
          from { opacity:0; transform:scale(.65); }
          to   { opacity:1; transform:scale(1); }
        }
        @keyframes vxCheckDraw {
          to { stroke-dashoffset:0; }
        }
        @keyframes vxGlowPulse {
          0%,100% { text-shadow:0 0 20px rgba(197,207,213,.4),0 0 40px rgba(197,207,213,.2); }
          50%      { text-shadow:0 0 40px rgba(197,207,213,.85),0 0 80px rgba(170,184,192,.3); }
        }
        @keyframes vxSlideSuccess {
          from { opacity:0; transform:translateY(18px) scale(.96); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }
        @keyframes vxTicketPop {
          from { opacity:0; transform:translateY(-10px) scale(.93); }
          to   { opacity:1; transform:translateY(0) scale(1); }
        }

        .sup-cat-pill   { transition:all .17s ease; cursor:pointer; border:none; }
        .sup-cat-pill:hover { transform:translateY(-2px); }
        .sup-pri-card   { transition:all .17s ease; cursor:pointer; border:none; }
        .sup-pri-card:hover { transform:translateY(-3px); }
        .sup-btn-submit { transition:all .2s ease; }
        .sup-btn-submit:hover:not(:disabled) {
          transform:translateY(-1px);
          box-shadow:0 10px 32px rgba(45,74,94,.5) !important;
        }
        .sup-btn-submit:disabled { opacity:.55; cursor:not-allowed; }
        .sup-input {
          background:rgba(0,0,0,.35) !important;
          border:1px solid rgba(255,255,255,.09) !important;
          border-radius:12px !important;
          padding:13px 16px !important;
          color:rgba(231,236,239,.9) !important;
          font-family:'DM Sans',sans-serif !important;
          font-size:14px !important;
          width:100% !important;
          outline:none !important;
          transition:border-color .2s, box-shadow .2s !important;
          box-sizing:border-box !important;
        }
        .sup-input:focus {
          border-color:rgba(45,74,94,.5) !important;
          box-shadow:0 0 0 3px rgba(45,74,94,.1) !important;
        }
        .sup-input::placeholder { color:rgba(231,236,239,.2) !important; }
        .sup-ticket-row { transition:background .15s; }
        .sup-ticket-row:hover { background:rgba(45,74,94,.04) !important; }
        .sup-again-btn {
          transition:all .2s;
        }
        .sup-again-btn:hover {
          transform:translateY(-1px);
          box-shadow:0 8px 28px rgba(45,74,94,.45) !important;
        }
      `}</style>

      {/* ── Animated Aurora Background ── */}
      <div style={{ position:"absolute", top:0, left:0, right:0, height:"340px", overflow:"hidden", pointerEvents:"none", zIndex:0 }}>
        <div style={{
          position:"absolute", top:"-70px", left:"3%",
          width:"520px", height:"520px", borderRadius:"50%",
          background:"radial-gradient(circle, rgba(45,74,94,.13) 0%, transparent 65%)",
          animation:"vxAurora1 13s ease-in-out infinite",
        }}/>
        <div style={{
          position:"absolute", top:"-90px", right:"8%",
          width:"420px", height:"420px", borderRadius:"50%",
          background:"radial-gradient(circle, rgba(170,184,192,.09) 0%, transparent 65%)",
          animation:"vxAurora2 16s ease-in-out infinite",
        }}/>
        <div style={{
          position:"absolute", top:"10px", left:"38%",
          width:"280px", height:"280px", borderRadius:"50%",
          background:"radial-gradient(circle, rgba(36,59,76,.07) 0%, transparent 65%)",
          animation:"vxAurora1 10s ease-in-out infinite reverse",
        }}/>
      </div>

      {/* ── Page Header ── */}
      <div
        className="vx-page-header"
        style={{ position:"relative", zIndex:1, animation:"vxFadeUp .5s ease both" }}
      >
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:"14px", marginBottom:"6px" }}>
            <h1 className="vx-page-title" style={{ margin:0 }}>Support Center</h1>
          </div>
          <p className="vx-page-desc">
            Submit a support ticket and our team will respond within your selected SLA window.
            Confirmation is sent to your email immediately.
          </p>
        </div>
      </div>

      {/* ── Two-Column Layout ── */}
      <div style={{
        position:"relative", zIndex:1,
        display:"grid",
        gridTemplateColumns:"minmax(0,1.75fr) minmax(0,1fr)",
        gap:"24px",
        alignItems:"start",
      }}>

        {/* ════════════════ LEFT COLUMN ════════════════ */}
        <div>
          {success ? (
            /* ── SUCCESS STATE ── */
            <div style={{
              background:"rgba(18,29,35,.88)", backdropFilter:"blur(20px)",
              border:"1px solid rgba(111,169,143,.2)",
              borderRadius:"22px", padding:"56px 48px",
              textAlign:"center", position:"relative", overflow:"hidden",
              animation:"vxSlideSuccess .55s cubic-bezier(.34,1.56,.64,1) both",
            }}>
              {/* top glow line */}
              <div style={{
                position:"absolute", top:0, left:0, right:0, height:"1px",
                background:"linear-gradient(90deg,transparent,rgba(111,169,143,.6),transparent)",
              }}/>

              {/* Check circle */}
              <div style={{ marginBottom:"28px" }}>
                <div style={{
                  display:"inline-flex", alignItems:"center", justifyContent:"center",
                  width:"84px", height:"84px", borderRadius:"50%",
                  background:"rgba(111,169,143,.1)", border:"2px solid rgba(111,169,143,.35)",
                  animation:"vxScaleIn .45s cubic-bezier(.34,1.56,.64,1) both .1s",
                }}>
                  <svg width="38" height="38" viewBox="0 0 38 38" fill="none">
                    <path
                      d="M9 19 L16 26 L29 12"
                      stroke="#6fa98f" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"
                      strokeDasharray="42" strokeDashoffset="42"
                      style={{ animation:"vxCheckDraw .5s ease forwards .45s" }}
                    />
                  </svg>
                </div>
              </div>

              <div style={{
                fontFamily:"Syne, sans-serif", fontWeight:800, fontSize:"30px",
                color:"rgba(231,236,239,.96)", marginBottom:"10px",
                animation:"vxFadeUp .4s ease both .3s",
              }}>
                Ticket Submitted
              </div>
              <div style={{
                fontFamily:"DM Sans, sans-serif", fontSize:"14px",
                color:"rgba(231,236,239,.4)", marginBottom:"40px", lineHeight:1.6,
                animation:"vxFadeUp .4s ease both .4s",
              }}>
                Your request has been logged and our support team has been notified.
              </div>

              {/* Ticket ID card */}
              <div style={{
                display:"inline-block",
                background:"rgba(45,74,94,.08)", border:"1px solid rgba(45,74,94,.25)",
                borderRadius:"18px", padding:"26px 48px", marginBottom:"28px",
                animation:"vxTicketPop .55s cubic-bezier(.34,1.56,.64,1) both .5s",
              }}>
                <div style={{
                  fontFamily:"DM Sans, sans-serif", fontSize:"9px", letterSpacing:"3px",
                  textTransform:"uppercase", color:"rgba(231,236,239,.28)", marginBottom:"12px",
                }}>
                  Your Ticket Number
                </div>
                <div style={{
                  fontFamily:"JetBrains Mono, monospace", fontSize:"28px", fontWeight:700,
                  letterSpacing:"3px", color:"#c5cfd5",
                  animation:"vxGlowPulse 3s ease-in-out infinite",
                }}>
                  {success.ticket_id}
                </div>
              </div>

              <div style={{
                fontFamily:"DM Sans, sans-serif", fontSize:"13px",
                color:"rgba(231,236,239,.38)", marginBottom:"36px",
                animation:"vxFadeUp .4s ease both .7s",
              }}>
                Confirmation email sent to{" "}
                <span style={{ color:"#c5cfd5" }}>{success.user_email}</span>
              </div>

              <div style={{ animation:"vxFadeUp .4s ease both .85s" }}>
                <button
                  onClick={resetForm}
                  className="sup-again-btn"
                  style={{
                    padding:"13px 32px",
                    background:"linear-gradient(135deg,#8fa6b5,#2d4a5e,#243b4c)",
                    border:"none", borderRadius:"13px",
                    color:"white", fontFamily:"Syne, sans-serif", fontWeight:700,
                    fontSize:"13px", cursor:"pointer",
                    boxShadow:"0 4px 22px rgba(45,74,94,.38)",
                    letterSpacing:".3px",
                  }}
                >
                  Submit Another Ticket
                </button>
              </div>
            </div>
          ) : (
            /* ── FORM ── */
            <div style={{
              background:"rgba(18,29,35,.88)", backdropFilter:"blur(20px)",
              border:"1px solid rgba(45,74,94,.14)",
              borderRadius:"22px", padding:"32px 36px",
              position:"relative", overflow:"hidden",
              animation:"vxFadeLeft .5s ease both .1s",
            }}>
              {/* top shimmer line */}
              <div style={{
                position:"absolute", top:0, left:0, right:0, height:"1px",
                background:"linear-gradient(90deg,transparent,rgba(45,74,94,.5),rgba(170,184,192,.3),transparent)",
              }}/>

              <div style={{
                fontFamily:"Syne, sans-serif", fontWeight:800, fontSize:"20px",
                color:"rgba(231,236,239,.95)", marginBottom:"6px",
              }}>
                Submit a Support Ticket
              </div>
              <div style={{
                fontFamily:"DM Sans, sans-serif", fontSize:"13px",
                color:"rgba(231,236,239,.32)", marginBottom:"30px",
              }}>
                Describe your issue and our team will respond within your SLA window.
              </div>

              <form onSubmit={handleSubmit}>

                {/* Category */}
                <div style={{ marginBottom:"26px" }}>
                  <div style={{
                    fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:"11px",
                    letterSpacing:"1.5px", textTransform:"uppercase",
                    color:"rgba(231,236,239,.38)", marginBottom:"12px",
                  }}>
                    Category
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:"8px" }}>
                    {CATEGORIES.map((cat) => {
                      const active = category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setCategory(cat.id)}
                          className="sup-cat-pill"
                          style={{
                            display:"flex", alignItems:"center", gap:"6px",
                            padding:"7px 15px", borderRadius:"20px",
                            background:active ? `${cat.color}18` : "rgba(255,255,255,.03)",
                            border:`1px solid ${active ? `${cat.color}50` : "rgba(255,255,255,.07)"}`,
                            color:active ? cat.color : "rgba(231,236,239,.42)",
                            fontFamily:"DM Sans, sans-serif", fontWeight:500, fontSize:"13px",
                            boxShadow:active ? `0 2px 12px ${cat.color}22` : "none",
                          }}
                        >
                          <span style={{ opacity: active ? 1 : 0.6 }}>{CATEGORY_ICONS[cat.id]}</span>
                          {cat.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subject */}
                <div style={{ marginBottom:"20px" }}>
                  <label style={{
                    display:"block", fontFamily:"DM Sans, sans-serif", fontWeight:600,
                    fontSize:"11px", letterSpacing:"1.5px", textTransform:"uppercase",
                    color:"rgba(231,236,239,.38)", marginBottom:"8px",
                  }}>
                    Subject <span style={{ color:"#be7468" }}>*</span>
                  </label>
                  <input
                    className="sup-input"
                    type="text"
                    placeholder="Brief summary of your issue…"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    maxLength={256}
                  />
                </div>

                {/* Description */}
                <div style={{ marginBottom:"20px" }}>
                  <label style={{
                    display:"block", fontFamily:"DM Sans, sans-serif", fontWeight:600,
                    fontSize:"11px", letterSpacing:"1.5px", textTransform:"uppercase",
                    color:"rgba(231,236,239,.38)", marginBottom:"8px",
                  }}>
                    Description <span style={{ color:"#be7468" }}>*</span>
                  </label>
                  <div style={{ position:"relative" }}>
                    <textarea
                      className="sup-input"
                      placeholder="Describe the issue in detail — steps to reproduce, expected vs. actual behavior, error messages, or relevant logs are very helpful…"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      maxLength={descMax}
                      rows={6}
                      style={{ resize:"vertical", minHeight:"148px", paddingBottom:"28px" }}
                    />
                    <div style={{
                      position:"absolute", bottom:"10px", right:"14px",
                      fontFamily:"JetBrains Mono, monospace", fontSize:"10px",
                      color:descCountColor, transition:"color .2s", pointerEvents:"none",
                    }}>
                      {descLen}/{descMax}
                    </div>
                  </div>
                  {descLen > 0 && descLen < 20 && (
                    <div style={{ marginTop:"6px", fontFamily:"DM Sans, sans-serif", fontSize:"12px", color:"#c2a06a" }}>
                      {20 - descLen} more character{20 - descLen !== 1 ? "s" : ""} required
                    </div>
                  )}
                </div>

                {/* Email */}
                <div style={{ marginBottom:"24px" }}>
                  <label style={{
                    display:"block", fontFamily:"DM Sans, sans-serif", fontWeight:600,
                    fontSize:"11px", letterSpacing:"1.5px", textTransform:"uppercase",
                    color:"rgba(231,236,239,.38)", marginBottom:"8px",
                  }}>
                    Contact Email <span style={{ color:"#be7468" }}>*</span>
                  </label>
                  <input
                    className="sup-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {/* Priority */}
                <div style={{ marginBottom:"30px" }}>
                  <div style={{
                    fontFamily:"DM Sans, sans-serif", fontWeight:600, fontSize:"11px",
                    letterSpacing:"1.5px", textTransform:"uppercase",
                    color:"rgba(231,236,239,.38)", marginBottom:"12px",
                  }}>
                    Priority
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(76px, 1fr))", gap:"10px" }}>
                    {PRIORITIES.map((pri) => {
                      const active = priority === pri.id;
                      return (
                        <button
                          key={pri.id}
                          type="button"
                          onClick={() => setPriority(pri.id)}
                          className="sup-pri-card"
                          style={{
                            padding:"15px 10px",
                            background:active ? pri.bg : "rgba(255,255,255,.02)",
                            border:`1px solid ${active ? pri.border : "rgba(255,255,255,.06)"}`,
                            borderRadius:"13px", textAlign:"center",
                            boxShadow:active ? `0 4px 18px ${pri.color}22` : "none",
                          }}
                        >
                          <div style={{
                            fontFamily:"Syne, sans-serif", fontWeight:700, fontSize:"13px",
                            color:active ? pri.color : "rgba(231,236,239,.38)",
                            marginBottom:"5px",
                          }}>
                            {pri.label}
                          </div>
                          <div style={{
                            fontFamily:"DM Sans, sans-serif", fontSize:"10px", lineHeight:1.4,
                            color:active ? `${pri.color}99` : "rgba(231,236,239,.18)",
                          }}>
                            {pri.sla}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div style={{
                    marginBottom:"18px", padding:"12px 16px",
                    background:"rgba(190,116,104,.08)", border:"1px solid rgba(190,116,104,.22)",
                    borderRadius:"10px",
                    fontFamily:"DM Sans, sans-serif", fontSize:"13px", color:"#be7468",
                    animation:"vxFadeUp .3s ease",
                  }}>
                    {error}
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="sup-btn-submit"
                  style={{
                    width:"100%", padding:"16px",
                    background:"linear-gradient(135deg,#8fa6b5 0%,#2d4a5e 50%,#243b4c 100%)",
                    border:"none", borderRadius:"14px",
                    color:"white", fontFamily:"Syne, sans-serif", fontWeight:700,
                    fontSize:"14px", letterSpacing:".4px",
                    cursor:loading ? "not-allowed" : "pointer",
                    boxShadow:"0 4px 24px rgba(45,74,94,.38)",
                    display:"flex", alignItems:"center", justifyContent:"center", gap:"10px",
                  }}
                >
                  {loading ? (
                    <>
                      <div style={{
                        width:"16px", height:"16px", borderRadius:"50%",
                        border:"2px solid rgba(255,255,255,.3)", borderTopColor:"white",
                        animation:"vxSpin .8s linear infinite",
                      }}/>
                      Submitting Ticket…
                    </>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"/>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"/>
                      </svg>
                      Submit Support Ticket
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* ── Ticket History ── */}
          {history.length > 0 && (
            <div style={{
              marginTop:"24px",
              background:"rgba(18,29,35,.88)", backdropFilter:"blur(20px)",
              border:"1px solid rgba(45,74,94,.14)", borderRadius:"20px",
              overflow:"hidden",
              animation:"vxFadeUp .5s ease both .3s",
            }}>
              <div style={{
                padding:"18px 24px", borderBottom:"1px solid rgba(255,255,255,.06)",
                display:"flex", alignItems:"center", justifyContent:"space-between",
              }}>
                <div style={{
                  fontFamily:"Syne, sans-serif", fontWeight:700, fontSize:"14px",
                  color:"rgba(231,236,239,.85)",
                }}>
                  Your Tickets
                </div>
                <div style={{
                  fontFamily:"JetBrains Mono, monospace", fontSize:"11px",
                  color:"rgba(231,236,239,.28)",
                }}>
                  {history.length} ticket{history.length !== 1 ? "s" : ""}
                </div>
              </div>
              {history.map((t, i) => (
                <div
                  key={t.ticket_id}
                  className="sup-ticket-row"
                  style={{
                    padding:"13px 24px",
                    borderBottom:i < history.length - 1 ? "1px solid rgba(255,255,255,.04)" : "none",
                    display:"flex", alignItems:"center", gap:"16px",
                  }}
                >
                  <div style={{
                    fontFamily:"JetBrains Mono, monospace", fontSize:"11px",
                    color:"rgba(231,236,239,.28)", flexShrink:0, minWidth:"148px",
                  }}>
                    {t.ticket_id}
                  </div>
                  <div style={{
                    flex:1, fontFamily:"DM Sans, sans-serif", fontSize:"13px",
                    color:"rgba(231,236,239,.65)",
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
                  }}>
                    {t.subject}
                  </div>
                  <div style={{
                    padding:"3px 9px", borderRadius:"6px", fontSize:"10px", fontWeight:600,
                    letterSpacing:"1px", textTransform:"uppercase", flexShrink:0,
                    background:`${PRIORITY_COLOR[t.priority] ?? "#c2a06a"}15`,
                    border:`1px solid ${PRIORITY_COLOR[t.priority] ?? "#c2a06a"}30`,
                    color:PRIORITY_COLOR[t.priority] ?? "#c2a06a",
                  }}>
                    {t.priority}
                  </div>
                  <div style={{
                    padding:"3px 9px", borderRadius:"6px", fontSize:"10px", fontWeight:600,
                    letterSpacing:"1px", textTransform:"uppercase", flexShrink:0,
                    background:`${STATUS_COLOR[t.status] ?? "#aab8c0"}15`,
                    border:`1px solid ${STATUS_COLOR[t.status] ?? "#aab8c0"}30`,
                    color:STATUS_COLOR[t.status] ?? "#aab8c0",
                  }}>
                    {t.status.replace("_", " ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ════════════════ RIGHT COLUMN ════════════════ */}
        <div style={{ display:"flex", flexDirection:"column", gap:"16px" }}>

          {/* System Status */}
          <div style={{
            background:"rgba(18,29,35,.88)", backdropFilter:"blur(20px)",
            border:"1px solid rgba(45,74,94,.14)", borderRadius:"18px", padding:"22px",
            position:"relative", overflow:"hidden",
            animation:"vxFadeRight .5s ease both .15s",
          }}>
            <div style={{
              position:"absolute", top:0, left:0, right:0, height:"1px",
              background:"linear-gradient(90deg,transparent,rgba(111,169,143,.4),transparent)",
            }}/>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"16px" }}>
              <div style={{ fontFamily:"Syne, sans-serif", fontWeight:700, fontSize:"13px", color:"rgba(231,236,239,.85)" }}>
                System Status
              </div>
              <div style={{
                display:"flex", alignItems:"center", gap:"5px",
                padding:"3px 11px", borderRadius:"12px",
                background:"rgba(111,169,143,.1)", border:"1px solid rgba(111,169,143,.22)",
                fontFamily:"DM Sans, sans-serif", fontSize:"10px", fontWeight:600,
                color:"#6fa98f",
              }}>
                <div style={{ width:"5px", height:"5px", borderRadius:"50%", background:"#6fa98f", animation:"vxPulseDot 2s ease infinite" }}/>
                Operational
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
              {SVC_STATUS.map((name) => (
                <div key={name} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"8px 12px", borderRadius:"9px",
                  background:"rgba(111,169,143,.04)", border:"1px solid rgba(111,169,143,.08)",
                }}>
                  <span style={{ fontFamily:"DM Sans, sans-serif", fontSize:"12px", color:"rgba(231,236,239,.5)" }}>
                    {name}
                  </span>
                  <div style={{ display:"flex", alignItems:"center", gap:"5px" }}>
                    <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#6fa98f", boxShadow:"0 0 5px rgba(111,169,143,.5)" }}/>
                    <span style={{ fontFamily:"DM Sans, sans-serif", fontSize:"10px", color:"#6fa98f" }}>100%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Response SLA */}
          <div style={{
            background:"rgba(18,29,35,.88)", backdropFilter:"blur(20px)",
            border:"1px solid rgba(45,74,94,.14)", borderRadius:"18px", padding:"22px",
            animation:"vxFadeRight .5s ease both .25s",
          }}>
            <div style={{ fontFamily:"Syne, sans-serif", fontWeight:700, fontSize:"13px", color:"rgba(231,236,239,.85)", marginBottom:"16px" }}>
              Response SLA
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>
              {PRIORITIES.map((pri) => (
                <div key={pri.id} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"9px 13px", borderRadius:"9px",
                  background:`${pri.color}08`, border:`1px solid ${pri.color}15`,
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                    <div style={{
                      width:"6px", height:"6px", borderRadius:"50%",
                      background:pri.color, boxShadow:`0 0 5px ${pri.color}55`,
                    }}/>
                    <span style={{ fontFamily:"DM Sans, sans-serif", fontSize:"12px", fontWeight:600, color:pri.color }}>
                      {pri.label}
                    </span>
                  </div>
                  <span style={{ fontFamily:"JetBrains Mono, monospace", fontSize:"10px", color:"rgba(231,236,239,.32)" }}>
                    {pri.sla}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Direct Contact */}
          <div style={{
            background:"rgba(18,29,35,.88)", backdropFilter:"blur(20px)",
            border:"1px solid rgba(45,74,94,.14)", borderRadius:"18px", padding:"22px",
            animation:"vxFadeRight .5s ease both .35s",
          }}>
            <div style={{ fontFamily:"Syne, sans-serif", fontWeight:700, fontSize:"13px", color:"rgba(231,236,239,.85)", marginBottom:"16px" }}>
              Direct Contact
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:"12px" }}>

              {/* Email */}
              <div style={{ display:"flex", alignItems:"flex-start", gap:"11px" }}>
                <div style={{
                  width:"34px", height:"34px", borderRadius:"9px", flexShrink:0,
                  background:"rgba(45,74,94,.1)", border:"1px solid rgba(45,74,94,.22)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c5cfd5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily:"DM Sans, sans-serif", fontSize:"10px", color:"rgba(231,236,239,.28)", marginBottom:"3px", letterSpacing:".5px" }}>
                    Email
                  </div>
                  <a href="mailto:support@veldrixai.ca" style={{
                    fontFamily:"DM Sans, sans-serif", fontSize:"13px", color:"#c5cfd5",
                    textDecoration:"none", transition:"color .2s",
                  }}>
                    support@veldrixai.ca
                  </a>
                </div>
              </div>

              <div style={{ height:"1px", background:"rgba(255,255,255,.05)" }}/>

              {/* Hours */}
              <div style={{ display:"flex", alignItems:"flex-start", gap:"11px" }}>
                <div style={{
                  width:"34px", height:"34px", borderRadius:"9px", flexShrink:0,
                  background:"rgba(170,184,192,.1)", border:"1px solid rgba(170,184,192,.22)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#aab8c0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily:"DM Sans, sans-serif", fontSize:"10px", color:"rgba(231,236,239,.28)", marginBottom:"3px", letterSpacing:".5px" }}>
                    Business Hours
                  </div>
                  <div style={{ fontFamily:"DM Sans, sans-serif", fontSize:"13px", color:"rgba(231,236,239,.52)" }}>
                    Mon–Fri, 9AM–6PM EST
                  </div>
                </div>
              </div>

              <div style={{ height:"1px", background:"rgba(255,255,255,.05)" }}/>

              {/* Critical */}
              <div style={{ display:"flex", alignItems:"flex-start", gap:"11px" }}>
                <div style={{
                  width:"34px", height:"34px", borderRadius:"9px", flexShrink:0,
                  background:"rgba(111,169,143,.1)", border:"1px solid rgba(111,169,143,.22)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6fa98f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontFamily:"DM Sans, sans-serif", fontSize:"10px", color:"rgba(231,236,239,.28)", marginBottom:"3px", letterSpacing:".5px" }}>
                    Critical Issues
                  </div>
                  <div style={{ fontFamily:"DM Sans, sans-serif", fontSize:"13px", color:"rgba(231,236,239,.52)" }}>
                    24/7 monitoring active
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Notice */}
          <div style={{
            background:"rgba(45,74,94,.05)", border:"1px solid rgba(45,74,94,.15)",
            borderRadius:"14px", padding:"16px 18px",
            animation:"vxFadeRight .5s ease both .45s",
          }}>
            <div style={{ display:"flex", gap:"10px", alignItems:"flex-start" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c5cfd5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:"1px" }}>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                <polyline points="9 12 11 14 15 10"/>
              </svg>
              <p style={{
                fontFamily:"DM Sans, sans-serif", fontSize:"12px",
                color:"rgba(231,236,239,.32)", lineHeight:1.65, margin:0,
              }}>
                All support tickets are encrypted in transit and processed under our SOC 2 Type II
                certified infrastructure. Your data is never shared with third parties.
              </p>
            </div>
          </div>

        </div>{/* end right column */}
      </div>{/* end grid */}
    </div>
  );
}
