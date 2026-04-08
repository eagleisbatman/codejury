import { useState, useEffect, useCallback, useRef } from "react";
import { ChevronRight, ChevronDown, Terminal, GitPullRequest, Shield, Zap, Brain, Eye, CheckCircle2, XCircle, AlertTriangle, Info, Copy, ExternalLink, Clock, DollarSign, Users, FileCode, ArrowRight, Play, RotateCcw, Layers, Search, ChevronLeft } from "lucide-react";

// ── Terminal simulation engine ──
const useTypewriter = (text, speed = 18, startDelay = 0) => {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  useEffect(() => {
    setDisplayed(""); setDone(false);
    const t1 = setTimeout(() => {
      let i = 0;
      const iv = setInterval(() => {
        if (i < text.length) { setDisplayed(text.slice(0, i + 1)); i++; }
        else { clearInterval(iv); setDone(true); }
      }, speed);
      return () => clearInterval(iv);
    }, startDelay);
    return () => clearTimeout(t1);
  }, [text, speed, startDelay]);
  return { displayed, done };
};

// ── Data ──
const EXPERTS = [
  { id: "claude", name: "Claude Code", icon: "C", color: "#D97706", model: "claude-sonnet-4-20250514", strengths: "Architecture, Security" },
  { id: "gemini", name: "Gemini CLI", icon: "G", color: "#4285F4", model: "gemini-2.5-pro", strengths: "Pattern Detection, Cross-file" },
  { id: "codex", name: "Codex CLI", icon: "X", color: "#10A37F", model: "codex-mini", strengths: "Correctness, Test Gaps" },
  { id: "ollama", name: "Ollama", icon: "O", color: "#7C3AED", model: "qwen2.5-coder:32b", strengths: "Privacy, Local Review" },
];

const FINDINGS = [
  {
    id: "F001", severity: "critical", category: "security", title: "SQL injection via unsanitized user input in query builder",
    file: "src/api/queries.ts", lines: "42-58",
    experts: { claude: true, gemini: true, codex: true, ollama: true },
    agreement: 1.0, status: "unanimous",
    description: "The `buildQuery` function concatenates user-supplied `filters` directly into SQL string without parameterization. An attacker can inject arbitrary SQL via the `sort_by` parameter.",
    fix: `// Before (vulnerable)\nconst query = \`SELECT * FROM users WHERE \${filters} ORDER BY \${sort_by}\`;\n\n// After (parameterized)\nconst query = sql\`SELECT * FROM users WHERE \${sql.raw(sanitize(filters))} ORDER BY \${sql.identifier(sort_by)}\`;`,
  },
  {
    id: "F002", severity: "error", category: "correctness", title: "Race condition in concurrent session refresh",
    file: "src/auth/session.ts", lines: "128-145",
    experts: { claude: true, gemini: true, codex: false, ollama: false },
    agreement: 0.5, status: "split",
    description: "Two concurrent requests can both detect an expired token and attempt to refresh simultaneously, potentially invalidating the other's new token. Needs mutex or token refresh queue.",
    dissent: "Codex and Ollama flagged this as a performance issue rather than correctness — they suggested the double-refresh is wasteful but not incorrect since both tokens would be valid.",
    fix: `// Add refresh lock\nconst refreshMutex = new Mutex();\nasync function refreshToken() {\n  return refreshMutex.runExclusive(async () => {\n    if (!isExpired(currentToken)) return currentToken;\n    return await doRefresh();\n  });\n}`,
  },
  {
    id: "F003", severity: "warning", category: "performance", title: "N+1 query in user list endpoint",
    file: "src/api/users.ts", lines: "67-82",
    experts: { claude: false, gemini: true, codex: true, ollama: true },
    agreement: 0.75, status: "majority",
    description: "The `/users` endpoint fetches user roles in a loop inside the map. With 1000 users, this fires 1001 queries. Should use a JOIN or batch fetch.",
    fix: `// Before: N+1\nconst users = await db.query('SELECT * FROM users');\nconst enriched = await Promise.all(\n  users.map(u => db.query('SELECT * FROM roles WHERE user_id = ?', [u.id]))\n);\n\n// After: Single JOIN\nconst users = await db.query(\n  'SELECT u.*, r.name as role FROM users u LEFT JOIN roles r ON u.id = r.user_id'\n);`,
  },
  {
    id: "F004", severity: "warning", category: "maintainability", title: "God function: handleRequest exceeds 200 lines",
    file: "src/middleware/handler.ts", lines: "15-220",
    experts: { claude: true, gemini: false, codex: false, ollama: true },
    agreement: 0.5, status: "split",
    description: "The main request handler is a single function with deeply nested conditionals. Extract validation, auth, routing, and response formatting into separate middleware functions.",
    dissent: "Gemini and Codex did not flag this — likely because the function, while long, has clear internal structure with comments delineating sections.",
  },
  {
    id: "F005", severity: "info", category: "style", title: "Inconsistent error response format across endpoints",
    file: "src/api/*.ts", lines: "various",
    experts: { claude: true, gemini: true, codex: false, ollama: false },
    agreement: 0.5, status: "split",
    description: "Some endpoints return { error: string }, others return { message: string, code: number }. Standardize on a single error envelope format.",
  },
];

const SEVERITY_CONFIG = {
  critical: { color: "#EF4444", bg: "#FEE2E2", icon: XCircle, label: "CRITICAL" },
  error: { color: "#F97316", bg: "#FFF7ED", icon: AlertTriangle, label: "ERROR" },
  warning: { color: "#EAB308", bg: "#FEFCE8", icon: AlertTriangle, label: "WARNING" },
  info: { color: "#6366F1", bg: "#EEF2FF", icon: Info, label: "INFO" },
};

const AGREEMENT_CONFIG = {
  unanimous: { color: "#10B981", label: "Unanimous", desc: "All experts agree" },
  majority: { color: "#F59E0B", label: "Majority", desc: "3 of 4 experts agree" },
  split: { color: "#EF4444", label: "Split", desc: "2 of 4 experts agree" },
};

const SCREENS = [
  { id: "install", label: "Install", num: "01" },
  { id: "init", label: "Project Init", num: "02" },
  { id: "review", label: "Run Review", num: "03" },
  { id: "progress", label: "Expert Panel", num: "04" },
  { id: "report", label: "Review Report", num: "05" },
  { id: "consensus", label: "Consensus Map", num: "06" },
  { id: "finding", label: "Finding Detail", num: "07" },
];

// ── Components ──

const Badge = ({ children, color, bg, small }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: small ? "1px 6px" : "2px 8px",
    borderRadius: 4, fontSize: small ? 9 : 10, fontWeight: 700,
    fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.05em",
    color: color, background: bg || `${color}18`, border: `1px solid ${color}30`,
    lineHeight: small ? "16px" : "18px",
  }}>
    {children}
  </span>
);

const TermLine = ({ prompt = "$", cmd, output, delay = 0, onDone }) => {
  const { displayed, done } = useTypewriter(cmd, 22, delay);
  const [showOutput, setShowOutput] = useState(false);
  useEffect(() => { if (done) { const t = setTimeout(() => { setShowOutput(true); onDone?.(); }, 300); return () => clearTimeout(t); } }, [done]);
  return (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, lineHeight: "22px" }}>
      <div><span style={{ color: "#10B981" }}>{prompt} </span><span style={{ color: "#E2E8F0" }}>{displayed}</span>{!done && <span style={{ background: "#E2E8F0", width: 8, height: 16, display: "inline-block", animation: "blink 1s step-end infinite", marginLeft: 1 }} />}</div>
      {showOutput && output && <div style={{ color: "#94A3B8", whiteSpace: "pre-wrap", marginTop: 2 }}>{output}</div>}
    </div>
  );
};

const TermBlock = ({ children, title }) => (
  <div style={{ background: "#0F172A", borderRadius: 10, overflow: "hidden", border: "1px solid #1E293B", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", background: "#1E293B", borderBottom: "1px solid #334155" }}>
      <div style={{ display: "flex", gap: 6 }}>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#EF4444" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#EAB308" }} />
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22C55E" }} />
      </div>
      {title && <span style={{ color: "#94A3B8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", marginLeft: 8 }}>{title}</span>}
    </div>
    <div style={{ padding: "16px 20px" }}>{children}</div>
  </div>
);

const ExpertDot = ({ expert, active, size = 28 }) => (
  <div title={expert.name} style={{
    width: size, height: size, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? expert.color : "#334155", color: active ? "#fff" : "#64748B",
    fontSize: size * 0.4, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace",
    transition: "all 0.3s", border: active ? `2px solid ${expert.color}` : "2px solid transparent",
    boxShadow: active ? `0 0 12px ${expert.color}40` : "none",
  }}>
    {expert.icon}
  </div>
);

// ── Screen Components ──

function InstallScreen() {
  const [step, setStep] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px", marginBottom: 4 }}>
        CodeJury is distributed as an npm package. Single command install, zero config to start.
      </div>
      <TermBlock title="terminal">
        <TermLine prompt="$" cmd="npm install -g codejury" delay={200} onDone={() => setTimeout(() => setStep(1), 400)}
          output={step >= 1 ? `added 1 package in 3.2s\n\n  ╭─────────────────────────────────────╮\n  │                                     │\n  │   codejury v1.0.0 installed         │\n  │   Run 'cj --help' to get started    │\n  │                                     │\n  ╰─────────────────────────────────────╯` : null} />
        {step >= 1 && <div style={{ marginTop: 16 }}><TermLine prompt="$" cmd="cj --version" delay={600} onDone={() => setTimeout(() => setStep(2), 300)}
          output={step >= 2 ? "codejury 1.0.0 (ink-tui, node 22.x)" : null} /></div>}
        {step >= 2 && <div style={{ marginTop: 16 }}><TermLine prompt="$" cmd="cj doctor" delay={500} onDone={() => setTimeout(() => setStep(3), 300)}
          output={step >= 3 ? `Checking expert CLIs...\n  ✓ claude      found (v1.2.0)    API key: configured\n  ✓ gemini      found (v0.8.1)    API key: configured\n  ✓ codex       found (v0.3.0)    API key: configured\n  ✓ ollama      found (v0.6.2)    Models: qwen2.5-coder:32b, deepseek-coder:6.7b\n  ✓ git         found (v2.44.0)\n\nAll 4 experts ready. You're good to go!` : null} /></div>}
      </TermBlock>
      {step >= 3 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 4 }}>
          {[
            { title: "npm / pnpm / yarn", desc: "Install globally from npmjs.com", cmd: "npm i -g codejury" },
            { title: "Homebrew", desc: "macOS / Linux via tap", cmd: "brew install codejury/tap/cj" },
            { title: "Binary", desc: "Prebuilt for linux/mac/windows", cmd: "curl -fsSL codejury.dev/install.sh | sh" },
            { title: "From source", desc: "Clone and build with Node 22+", cmd: "git clone && npm run build" },
          ].map((m, i) => (
            <div key={i} style={{ background: "#0F172A", borderRadius: 8, padding: "12px 14px", border: "1px solid #1E293B" }}>
              <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700 }}>{m.title}</div>
              <div style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>{m.desc}</div>
              <code style={{ color: "#10B981", fontSize: 11, marginTop: 6, display: "block", fontFamily: "'JetBrains Mono', monospace" }}>{m.cmd}</code>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InitScreen() {
  const [step, setStep] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px" }}>
        Initialize CodeJury in any git repository. This creates the <code style={{ color: "#10B981", background: "#10B98115", padding: "1px 5px", borderRadius: 3, fontSize: 12 }}>.codejury/</code> project directory with config, rules, and review database.
      </div>
      <TermBlock title="~/projects/my-api">
        <TermLine prompt="~/my-api $" cmd="cj init" delay={300} onDone={() => setTimeout(() => setStep(1), 500)}
          output={step >= 1 ? `\n  Initializing CodeJury in /Users/dev/projects/my-api\n\n  ? Select review preset:\n    ❯ balanced        (Claude + Gemini + Ollama, Routed strategy)\n      security-first  (Claude + Ollama, Full Panel, strict rules)\n      cost-conscious   (Ollama primary, cloud escalation only)\n      full-panel       (All experts, all changes, maximum coverage)\n\n  ✓ Created .codejury/config.toml\n  ✓ Created .codejury/rules/\n  ✓ Created .codejury/sensitive.glob\n  ✓ Initialized .codejury/reviews.db\n  ✓ Updated .gitignore\n\n  Project initialized! Run 'cj review' to start your first review.` : null} />
        {step >= 1 && <div style={{ marginTop: 16 }}>
          <TermLine prompt="~/my-api $" cmd="cat .codejury/config.toml" delay={800} onDone={() => setTimeout(() => setStep(2), 300)}
            output={step >= 2 ? `[project]\nname = "my-api"\ndefault_branch = "main"\n\n[experts]\nenabled = ["claude", "gemini", "ollama"]\n\n[experts.claude]\nmodel = "claude-sonnet-4-20250514"\ntimeout = 120\nfocus = ["security", "architecture"]\n\n[experts.gemini]\nmodel = "gemini-2.5-pro"\ntimeout = 90\nfocus = ["patterns", "performance"]\n\n[experts.ollama]\nmodel = "qwen2.5-coder:32b"\ntimeout = 60\nfocus = ["correctness", "style"]\n\n[synthesis]\nstrategy = "routed"        # full_panel | routed | cascading\nsynthesizer = "claude"\ndedup_threshold = 0.75\n\n[output]\ndefault_format = "markdown"\nseverity_threshold = "info"\n\n[cost]\nbudget_per_review = 0.50\nprefer_free_tier = true` : null} />
        </div>}
      </TermBlock>
      {step >= 2 && (
        <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 16 }}>
          <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Layers size={14} style={{ color: "#6366F1" }} /> Project Structure
          </div>
          <pre style={{ color: "#94A3B8", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", margin: 0, lineHeight: "20px" }}>{`.codejury/
├── config.toml        ← committed (shared team config)
├── rules/
│   └── custom.md      ← committed (project review rules)
├── sensitive.glob     ← committed (sensitive file patterns)
├── reviews.db         ← gitignored (local review history)
└── .gitignore         ← excludes reviews.db, secrets`}</pre>
        </div>
      )}
    </div>
  );
}

function ReviewScreen() {
  const [step, setStep] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px" }}>
        Review any git scope: staged changes, branch diff, commit range, PR URL, or specific files.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[
          { cmd: "cj review", desc: "Staged changes (default)", scope: "git diff --cached" },
          { cmd: "cj review --branch feature/auth", desc: "Full branch vs main", scope: "merge-base diff" },
          { cmd: "cj review --diff HEAD~3..HEAD", desc: "Last 3 commits", scope: "commit range" },
          { cmd: "cj review --pr github.com/.../pull/42", desc: "Review a PR directly", scope: "PR diff via API" },
        ].map((r, i) => (
          <button key={i} onClick={() => setStep(i + 1)} style={{
            background: step === i + 1 ? "#1E293B" : "#0F172A", border: `1px solid ${step === i + 1 ? "#6366F1" : "#1E293B"}`,
            borderRadius: 8, padding: "10px 12px", textAlign: "left", cursor: "pointer", transition: "all 0.2s",
          }}>
            <code style={{ color: "#10B981", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{r.cmd}</code>
            <div style={{ color: "#94A3B8", fontSize: 11, marginTop: 4 }}>{r.desc}</div>
            <Badge color="#6366F1" small>{r.scope}</Badge>
          </button>
        ))}
      </div>
      <TermBlock title="~/projects/my-api (feature/auth-refactor)">
        <TermLine prompt="$" cmd="cj review --pr https://github.com/acme/my-api/pull/42 --experts claude,gemini,codex,ollama"
          delay={200} onDone={() => setTimeout(() => setStep(5), 400)}
          output={step >= 5 ? `\n  ⚡ CodeJury Review Session\n  ─────────────────────────\n  PR:       #42 "Refactor auth middleware + add session refresh"\n  Branch:   feature/auth-refactor → main\n  Files:    12 changed (+847, -234)\n  Scope:    src/api/, src/auth/, src/middleware/\n\n  Expert Panel:\n    C  Claude Code     claude-sonnet-4-20250514      security, architecture\n    G  Gemini CLI      gemini-2.5-pro            patterns, performance\n    X  Codex CLI       codex-mini                correctness, tests\n    O  Ollama          qwen2.5-coder:32b         local, style\n\n  Strategy: Full Panel (all experts review all changes)\n  Est. cost: $0.32\n\n  Dispatching to 4 experts...` : null} />
      </TermBlock>
    </div>
  );
}

function ProgressScreen() {
  const [phase, setPhase] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 800),
      setTimeout(() => setPhase(2), 3000),
      setTimeout(() => setPhase(3), 5500),
      setTimeout(() => setPhase(4), 7000),
      setTimeout(() => setPhase(5), 9000),
    ];
    const iv = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => { timers.forEach(clearTimeout); clearInterval(iv); };
  }, []);

  const expertStatus = [
    { ...EXPERTS[3], status: phase >= 1 ? "done" : phase >= 0 ? "running" : "queued", findings: 3, time: "8.2s", cost: "$0.00" },
    { ...EXPERTS[1], status: phase >= 2 ? "done" : phase >= 1 ? "running" : "queued", findings: 4, time: "14.1s", cost: "$0.04" },
    { ...EXPERTS[2], status: phase >= 3 ? "done" : phase >= 2 ? "running" : "queued", findings: 2, time: "18.7s", cost: "$0.06" },
    { ...EXPERTS[0], status: phase >= 4 ? "done" : phase >= 3 ? "running" : "queued", findings: 5, time: "24.3s", cost: "$0.18" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px" }}>
        All experts run in parallel. As each completes, findings stream into the TUI in real time. The synthesis phase begins once all experts report.
      </div>
      <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700 }}>Expert Panel Progress</span>
            <Badge color="#6366F1">PR #42</Badge>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#64748B", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              <Clock size={11} style={{ marginRight: 4, verticalAlign: "middle" }} />{Math.min(elapsed, 28)}s
            </span>
            <span style={{ color: "#64748B", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              <DollarSign size={11} style={{ marginRight: 2, verticalAlign: "middle" }} />{phase >= 4 ? "$0.28" : phase >= 3 ? "$0.10" : phase >= 2 ? "$0.04" : "$0.00"}
            </span>
          </div>
        </div>
        <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
          {expertStatus.map((ex, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#1E293B", borderRadius: 8, border: `1px solid ${ex.status === "done" ? ex.color + "30" : "#334155"}` }}>
              <ExpertDot expert={ex} active={ex.status !== "queued"} size={32} />
              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 600 }}>{ex.name}</span>
                  <span style={{ color: "#64748B", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>{ex.model}</span>
                </div>
                <div style={{ marginTop: 4, height: 4, background: "#334155", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", borderRadius: 2, background: ex.color,
                    width: ex.status === "done" ? "100%" : ex.status === "running" ? "65%" : "0%",
                    transition: "width 2s ease-out",
                  }} />
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 80 }}>
                {ex.status === "done" ? (
                  <>
                    <div style={{ color: "#10B981", fontSize: 11, fontWeight: 600 }}>{ex.findings} findings</div>
                    <div style={{ color: "#64748B", fontSize: 10 }}>{ex.time} · {ex.cost}</div>
                  </>
                ) : ex.status === "running" ? (
                  <div style={{ color: ex.color, fontSize: 11, fontWeight: 600, display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>⟳</span> Reviewing...
                  </div>
                ) : (
                  <div style={{ color: "#475569", fontSize: 11 }}>Queued</div>
                )}
              </div>
            </div>
          ))}
        </div>
        {phase >= 5 && (
          <div style={{ padding: "12px 16px", borderTop: "1px solid #1E293B" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "#6366F115", borderRadius: 8, border: "1px solid #6366F130" }}>
              <Brain size={18} style={{ color: "#6366F1" }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 600 }}>Synthesis Complete</div>
                <div style={{ color: "#94A3B8", fontSize: 11 }}>14 raw findings → 5 deduplicated · 1 critical · 1 error · 2 warnings · 1 info</div>
              </div>
              <Badge color="#10B981">Merged</Badge>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportScreen() {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px" }}>
        The synthesized report groups findings by severity. Each finding shows which experts flagged it and the agreement level.
      </div>
      <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E293B", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ color: "#E2E8F0", fontSize: 14, fontWeight: 700 }}>Review Report</div>
            <div style={{ color: "#64748B", fontSize: 11, marginTop: 2 }}>PR #42 · feature/auth-refactor → main · 12 files</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Badge color="#EF4444">1 Critical</Badge>
            <Badge color="#F97316">1 Error</Badge>
            <Badge color="#EAB308">2 Warnings</Badge>
            <Badge color="#6366F1">1 Info</Badge>
          </div>
        </div>
        {/* Verdict */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E293B", background: "#EF444410" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <XCircle size={16} style={{ color: "#EF4444" }} />
            <span style={{ color: "#EF4444", fontSize: 13, fontWeight: 700 }}>REQUEST CHANGES</span>
            <span style={{ color: "#94A3B8", fontSize: 12, marginLeft: 8 }}>1 critical finding requires resolution before merge</span>
          </div>
        </div>
        {/* Findings list */}
        <div style={{ padding: "8px 0" }}>
          {FINDINGS.map((f, i) => {
            const sev = SEVERITY_CONFIG[f.severity];
            const agr = AGREEMENT_CONFIG[f.status];
            const isExpanded = expanded === i;
            const SevIcon = sev.icon;
            return (
              <div key={f.id} style={{ borderBottom: i < FINDINGS.length - 1 ? "1px solid #1E293B" : "none" }}>
                <button onClick={() => setExpanded(isExpanded ? null : i)} style={{
                  display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px",
                  background: isExpanded ? "#1E293B" : "transparent", border: "none", cursor: "pointer", textAlign: "left",
                  transition: "background 0.15s",
                }}>
                  {isExpanded ? <ChevronDown size={14} style={{ color: "#64748B", flexShrink: 0 }} /> : <ChevronRight size={14} style={{ color: "#64748B", flexShrink: 0 }} />}
                  <SevIcon size={14} style={{ color: sev.color, flexShrink: 0 }} />
                  <span style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 600, flex: 1 }}>{f.title}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                    {EXPERTS.map(ex => <ExpertDot key={ex.id} expert={ex} active={f.experts[ex.id]} size={20} />)}
                  </div>
                  <Badge color={agr.color} small>{Math.round(f.agreement * 100)}%</Badge>
                </button>
                {isExpanded && (
                  <div style={{ padding: "0 16px 14px 42px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <Badge color={sev.color}>{sev.label}</Badge>
                      <Badge color="#6366F1">{f.category}</Badge>
                      <code style={{ color: "#94A3B8", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>{f.file}:{f.lines}</code>
                    </div>
                    <div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: "18px" }}>{f.description}</div>
                    {f.dissent && (
                      <div style={{ background: "#F59E0B10", border: "1px solid #F59E0B30", borderRadius: 6, padding: "8px 10px" }}>
                        <div style={{ color: "#F59E0B", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>DISSENTING VIEW</div>
                        <div style={{ color: "#CBD5E1", fontSize: 11, lineHeight: "16px" }}>{f.dissent}</div>
                      </div>
                    )}
                    {f.fix && (
                      <div style={{ background: "#10B98108", border: "1px solid #10B98120", borderRadius: 6, overflow: "hidden" }}>
                        <div style={{ padding: "6px 10px", borderBottom: "1px solid #10B98120", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <span style={{ color: "#10B981", fontSize: 10, fontWeight: 700 }}>SUGGESTED FIX</span>
                          <Copy size={12} style={{ color: "#64748B", cursor: "pointer" }} />
                        </div>
                        <pre style={{ margin: 0, padding: "10px 12px", color: "#E2E8F0", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", lineHeight: "18px", overflowX: "auto" }}>{f.fix}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ConsensusScreen() {
  const [hoveredFinding, setHoveredFinding] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px" }}>
        The consensus map visualizes where experts agree and disagree. Unanimous findings have highest confidence. Split findings surface genuine ambiguity worth human judgment.
      </div>
      {/* Consensus matrix */}
      <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ color: "#E2E8F0", fontSize: 13, fontWeight: 700 }}>Expert Agreement Matrix</div>
        </div>
        <div style={{ padding: 16, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 10px", color: "#64748B", fontWeight: 600, borderBottom: "1px solid #1E293B" }}>Finding</th>
                {EXPERTS.map(ex => (
                  <th key={ex.id} style={{ padding: "6px 10px", borderBottom: "1px solid #1E293B", textAlign: "center" }}>
                    <ExpertDot expert={ex} active size={24} />
                  </th>
                ))}
                <th style={{ padding: "6px 10px", color: "#64748B", fontWeight: 600, borderBottom: "1px solid #1E293B", textAlign: "center" }}>Consensus</th>
              </tr>
            </thead>
            <tbody>
              {FINDINGS.map((f, i) => {
                const sev = SEVERITY_CONFIG[f.severity];
                const agr = AGREEMENT_CONFIG[f.status];
                return (
                  <tr key={f.id} onMouseEnter={() => setHoveredFinding(i)} onMouseLeave={() => setHoveredFinding(null)}
                    style={{ background: hoveredFinding === i ? "#1E293B" : "transparent", transition: "background 0.15s" }}>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid #1E293B10" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: sev.color, flexShrink: 0 }} />
                        <span style={{ color: "#E2E8F0", fontSize: 11, fontWeight: 500 }}>{f.id}</span>
                        <span style={{ color: "#94A3B8", fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.title}</span>
                      </div>
                    </td>
                    {EXPERTS.map(ex => (
                      <td key={ex.id} style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #1E293B10" }}>
                        {f.experts[ex.id] ? (
                          <CheckCircle2 size={16} style={{ color: "#10B981" }} />
                        ) : (
                          <span style={{ color: "#334155", fontSize: 14 }}>—</span>
                        )}
                      </td>
                    ))}
                    <td style={{ padding: "8px 10px", textAlign: "center", borderBottom: "1px solid #1E293B10" }}>
                      <Badge color={agr.color} small>{agr.label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {/* Insight boxes */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        {[
          { color: "#10B981", title: "Full Agreement", count: 1, desc: "All 4 experts flagged the same issue. Highest confidence — act on these first.", icon: CheckCircle2 },
          { color: "#F59E0B", title: "Majority Agreement", count: 1, desc: "3 of 4 experts agree. Strong signal with one expert providing an alternative perspective.", icon: Users },
          { color: "#EF4444", title: "Split Decision", count: 3, desc: "2 of 4 experts agree. Genuine ambiguity — human judgment needed. Dissenting views preserved.", icon: AlertTriangle },
        ].map((box, i) => {
          const BoxIcon = box.icon;
          return (
            <div key={i} style={{ background: "#0F172A", borderRadius: 10, border: `1px solid ${box.color}25`, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <BoxIcon size={14} style={{ color: box.color }} />
                <span style={{ color: box.color, fontSize: 12, fontWeight: 700 }}>{box.title}</span>
                <span style={{ color: "#E2E8F0", fontSize: 18, fontWeight: 800, marginLeft: "auto" }}>{box.count}</span>
              </div>
              <div style={{ color: "#94A3B8", fontSize: 11, lineHeight: "16px" }}>{box.desc}</div>
            </div>
          );
        })}
      </div>
      {/* Expert contribution */}
      <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #1E293B", padding: 16 }}>
        <div style={{ color: "#E2E8F0", fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Expert Contribution Analysis</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {[
            { ...EXPERTS[0], unique: 0, total: 4, topCategory: "Security + Architecture", cost: "$0.18" },
            { ...EXPERTS[1], unique: 0, total: 3, topCategory: "Performance + Patterns", cost: "$0.04" },
            { ...EXPERTS[2], unique: 0, total: 2, topCategory: "Correctness", cost: "$0.06" },
            { ...EXPERTS[3], unique: 0, total: 3, topCategory: "Style + Correctness", cost: "$0.00" },
          ].map((ex, i) => (
            <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 10, borderTop: `3px solid ${ex.color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <ExpertDot expert={ex} active size={22} />
                <span style={{ color: "#E2E8F0", fontSize: 11, fontWeight: 600 }}>{ex.name}</span>
              </div>
              <div style={{ color: "#94A3B8", fontSize: 10, lineHeight: "16px" }}>
                <div>Flagged: <span style={{ color: "#E2E8F0", fontWeight: 600 }}>{ex.total}</span> findings</div>
                <div>Focus: <span style={{ color: "#E2E8F0" }}>{ex.topCategory}</span></div>
                <div>Cost: <span style={{ color: "#10B981", fontWeight: 600 }}>{ex.cost}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FindingScreen() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: "20px" }}>
        Deep dive into a single finding: the critical SQL injection. See how each expert analyzed it, their agreement, and the synthesized recommended fix.
      </div>
      <div style={{ background: "#0F172A", borderRadius: 10, border: "1px solid #EF444430", overflow: "hidden" }}>
        {/* Finding header */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #1E293B", background: "#EF444408" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Badge color="#EF4444">CRITICAL</Badge>
            <Badge color="#6366F1">security</Badge>
            <Badge color="#10B981">100% agreement</Badge>
          </div>
          <div style={{ color: "#E2E8F0", fontSize: 15, fontWeight: 700 }}>SQL injection via unsanitized user input in query builder</div>
          <code style={{ color: "#94A3B8", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", marginTop: 4, display: "block" }}>
            src/api/queries.ts:42-58
          </code>
        </div>
        {/* Expert breakdown */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ color: "#64748B", fontSize: 10, fontWeight: 700, marginBottom: 10, letterSpacing: "0.08em" }}>EXPERT ANALYSIS BREAKDOWN</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { expert: EXPERTS[0], analysis: "Identified as CWE-89: Improper Neutralization of Special Elements used in an SQL Command. The `sort_by` parameter is directly interpolated into the query without validation against an allowlist or parameterization. Recommends tagged template literals with parameterized queries.", focus: "Attack vectors + CWE classification" },
              { expert: EXPERTS[1], analysis: "Cross-referenced 3 other files that use the same `buildQuery` function. Found that `src/api/reports.ts` and `src/api/analytics.ts` have the same vulnerability pattern. This is a systemic issue, not isolated.", focus: "Cross-file pattern detection" },
              { expert: EXPERTS[2], analysis: "Verified that no input validation exists upstream in the middleware chain for the `sort_by` field. The OpenAPI spec defines it as a free-form string with no enum constraint. Suggests adding Zod schema validation at the API boundary.", focus: "Correctness verification + boundary analysis" },
              { expert: EXPERTS[3], analysis: "Confirmed the vulnerability exists. Suggests using a query builder library (Drizzle, Kysely) instead of raw SQL to eliminate the category of vulnerability entirely.", focus: "Alternative architecture suggestion" },
            ].map((item, i) => (
              <div key={i} style={{ background: "#1E293B", borderRadius: 8, padding: 10, borderLeft: `3px solid ${item.expert.color}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  <ExpertDot expert={item.expert} active size={20} />
                  <span style={{ color: "#E2E8F0", fontSize: 11, fontWeight: 600 }}>{item.expert.name}</span>
                  <span style={{ color: "#64748B", fontSize: 10, marginLeft: "auto", fontStyle: "italic" }}>{item.focus}</span>
                </div>
                <div style={{ color: "#CBD5E1", fontSize: 11, lineHeight: "17px" }}>{item.analysis}</div>
              </div>
            ))}
          </div>
        </div>
        {/* Synthesized fix */}
        <div style={{ padding: "12px 16px" }}>
          <div style={{ color: "#10B981", fontSize: 10, fontWeight: 700, marginBottom: 8, letterSpacing: "0.08em" }}>SYNTHESIZED RECOMMENDATION</div>
          <div style={{ color: "#CBD5E1", fontSize: 12, lineHeight: "18px", marginBottom: 10 }}>
            Apply parameterized queries immediately to fix the direct vulnerability. Add Zod schema validation at the API boundary for defense-in-depth. Audit <code style={{ color: "#F59E0B", background: "#F59E0B15", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>reports.ts</code> and <code style={{ color: "#F59E0B", background: "#F59E0B15", padding: "1px 4px", borderRadius: 3, fontSize: 11 }}>analytics.ts</code> for the same pattern (Gemini cross-file detection). Long-term: evaluate migration to Kysely/Drizzle for structural elimination of SQL injection risk.
          </div>
          <div style={{ background: "#10B98108", border: "1px solid #10B98120", borderRadius: 6, overflow: "hidden" }}>
            <div style={{ padding: "6px 10px", borderBottom: "1px solid #10B98120", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "#10B981", fontSize: 10, fontWeight: 700 }}>SUGGESTED FIX</span>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: "#64748B", fontSize: 10, cursor: "pointer" }}>Copy</span>
                <span style={{ color: "#64748B", fontSize: 10, cursor: "pointer" }}>Apply</span>
              </div>
            </div>
            <pre style={{ margin: 0, padding: "10px 12px", color: "#E2E8F0", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", lineHeight: "18px" }}>{FINDINGS[0].fix}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──
export default function CodeJuryUX() {
  const [activeScreen, setActiveScreen] = useState(0);

  const screens = [InstallScreen, InitScreen, ReviewScreen, ProgressScreen, ReportScreen, ConsensusScreen, FindingScreen];
  const ActiveComponent = screens[activeScreen];

  return (
    <div style={{ minHeight: "100vh", background: "#020617", color: "#E2E8F0", fontFamily: "'DM Sans', -apple-system, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&family=JetBrains+Mono:wght@300;400;500;600;700;800&display=swap');
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: #0F172A; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "20px 28px", borderBottom: "1px solid #1E293B", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "linear-gradient(135deg, #6366F1, #EC4899)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Shield size={20} style={{ color: "#fff" }} />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>CodeJury</div>
            <div style={{ fontSize: 11, color: "#64748B", marginTop: -1 }}>Mixture-of-Experts Code Review</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#475569", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: "#6366F1", fontWeight: 600 }}>UX Flow</span> — Installation to Review Report
        </div>
      </div>

      <div style={{ display: "flex", maxWidth: 1200, margin: "0 auto" }}>
        {/* Sidebar nav */}
        <div style={{ width: 200, borderRight: "1px solid #1E293B", padding: "16px 0", position: "sticky", top: 0, height: "calc(100vh - 69px)", overflowY: "auto", flexShrink: 0 }}>
          {SCREENS.map((s, i) => (
            <button key={s.id} onClick={() => setActiveScreen(i)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 20px",
              background: activeScreen === i ? "#1E293B" : "transparent",
              border: "none", borderLeft: activeScreen === i ? "3px solid #6366F1" : "3px solid transparent",
              cursor: "pointer", transition: "all 0.15s", textAlign: "left",
            }}>
              <span style={{ color: activeScreen === i ? "#6366F1" : "#475569", fontSize: 10, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{s.num}</span>
              <span style={{ color: activeScreen === i ? "#E2E8F0" : "#94A3B8", fontSize: 12, fontWeight: activeScreen === i ? 600 : 400 }}>{s.label}</span>
            </button>
          ))}
          <div style={{ padding: "16px 20px", marginTop: 8, borderTop: "1px solid #1E293B" }}>
            <div style={{ color: "#475569", fontSize: 10, marginBottom: 8, fontWeight: 600, letterSpacing: "0.08em" }}>EXPERT PANEL</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {EXPERTS.map(ex => (
                <div key={ex.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ExpertDot expert={ex} active size={18} />
                  <span style={{ color: "#94A3B8", fontSize: 10 }}>{ex.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: "24px 32px", minHeight: "calc(100vh - 69px)", overflowY: "auto" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ color: "#6366F1", fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
              {SCREENS[activeScreen].num}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#E2E8F0" }}>{SCREENS[activeScreen].label}</span>
            <div style={{ flex: 1, height: 1, background: "#1E293B", marginLeft: 8 }} />
            <div style={{ display: "flex", gap: 4 }}>
              <button onClick={() => setActiveScreen(Math.max(0, activeScreen - 1))} disabled={activeScreen === 0}
                style={{ padding: "4px 8px", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, color: activeScreen === 0 ? "#334155" : "#94A3B8", cursor: activeScreen === 0 ? "default" : "pointer", display: "flex", alignItems: "center" }}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setActiveScreen(Math.min(SCREENS.length - 1, activeScreen + 1))} disabled={activeScreen === SCREENS.length - 1}
                style={{ padding: "4px 8px", background: "#1E293B", border: "1px solid #334155", borderRadius: 4, color: activeScreen === SCREENS.length - 1 ? "#334155" : "#94A3B8", cursor: activeScreen === SCREENS.length - 1 ? "default" : "pointer", display: "flex", alignItems: "center" }}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <ActiveComponent key={activeScreen} />
        </div>
      </div>
    </div>
  );
}
