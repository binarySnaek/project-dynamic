import { type FormEvent, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, BookOpen, Check, CheckCircle2, Clipboard, ExternalLink, FlaskConical, Info, Link2, ListChecks, NotebookPen, Plus, RotateCcw, Send, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { useAskGeminiResearch, useUpdateGeminiBinderPlan, useAnalyzeBinderStructure } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import './index.css';

type TocNode = {
  id: string;
  label: string;
  level: 'section' | 'subsection' | 'subsubsection';
  status: 'complete' | 'partial' | 'missing';
  description: string;
  suggestion?: string;
  children: TocNode[];
};

type TocAnalysis = {
  nodes: TocNode[];
  summary: {
    total: number;
    complete: number;
    partial: number;
    missing: number;
  };
};

type BinderSkeleton = {
  sections: {
    id: string;
    label: string;
    hasContent: boolean;
    notes: string;
    subsections: {
      id: string;
      label: string;
      hasContent: boolean;
      notes: string;
    }[];
  }[];
  status: 'sketched' | 'reviewing' | 'analyzed';
  missingTopics?: string[];
  recommendations?: string[];
};

type GapAnalysis = {
  topic: string;
  status: 'complete' | 'partial' | 'missing';
  binderHas: string;
  binderMissing: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
};

type SkeletonLine = {
  code: string;
  title: string;
  depth: number;
  body: string;
};

// Sent to Gemini as part of the binder-structure analysis request (see analyzeBinder
// below) so the backend prompt follows the same table-of-contents rule the local
// parser already enforces — LETTER0 lines (e.g. A0, B0) are TOC entries, not sections.
const GEMINI_FORMAT_INSTRUCTIONS = `Contents will be in the form of LETTER, LETTER.NUMBER, or LETTER.NUMBER.NUMBER, UNLESS it is in a table of contents, which will ALWAYS be in the form of LETTER0 (e.g. A0, B0). Never treat a LETTER0 line as a real section — it only marks a table-of-contents entry and should be ignored when building the outline.`;

// Shape expected back from the useAnalyzeGeminiBinderStructure hook: one status/note
// pair per skeleton code (e.g. "B2.1"), covering every code sent in the request.
type BinderStructureAnalysisResult = {
  sections: { code: string; status: TocNode['status']; note: string }[];
};

const TOC_MARKER_PATTERN = /^[A-Za-z]+0$/;
// Subsections/sub-subsections always have a digit right after the letter(s), e.g.
// "A1.", "A1.1" — no ordinary English word looks like that, so this is unambiguous.
const CODED_HEADING_PATTERN = /^([A-Za-z]{1,2}\d+(?:\.\d+)*)\.?\s+(.+)$/;
// Top-level sections are a single letter with NO digit, e.g. "A." — this is the
// dangerous case, since "A" alone can't be told apart from an ordinary word. The
// old version allowed zero digits here too, so "The", "Plate", "Convergent", etc.
// at the start of any paragraph all matched as if they were section codes. Locking
// this to exactly one letter AND a mandatory trailing period closes that hole.
const BARE_LETTER_HEADING_PATTERN = /^([A-Za-z])\.\s+(.+)$/;
const MAX_HEADING_WORDS = 14;

function skeletonDepth(code: string): number {
  const digits = code.replace(/^[A-Za-z]+/, '');
  if (!digits) return 1;
  return 1 + digits.split('.').filter(Boolean).length;
}

// A real section title (e.g. "A. Plate Tectonics", "A1. Convergent Boundaries",
// "A1.1 Subduction Zones") is a short topic name on its own line — not a full
// sentence. This guards against the classic false positive: a lettered list
// INSIDE a paragraph ("A. First reason... B. Second reason...") that happens to
// match the same code shape as a genuine heading.
function looksLikeRealHeading(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_HEADING_WORDS) return false;
  // Bails if the "title" clearly keeps going as prose — a period or semicolon
  // followed by more words is the shape of a sentence, not a topic name.
  if (/[.;]\s+[A-Za-z]/.test(title)) return false;
  return true;
}

// Pure structure parsing — no AI needed, so this step is instant and never fails.
function parseSkeletonLines(rawText: string): SkeletonLine[] {
  const entries: SkeletonLine[] = [];
  let current: SkeletonLine | null = null;

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(CODED_HEADING_PATTERN) || line.match(BARE_LETTER_HEADING_PATTERN);

    if (match && TOC_MARKER_PATTERN.test(match[1])) {
      // Table-of-contents line (e.g. "A0 Rocks") — never a real section, skip entirely.
      continue;
    }

    const isRealHeading = match && looksLikeRealHeading(match[2]);

    if (isRealHeading) {
      if (current) entries.push(current);
      current = { code: match[1], title: match[2].trim(), depth: skeletonDepth(match[1]), body: '' };
    } else if (current) {
      current.body = current.body ? `${current.body} ${line}` : line;
    }
  }
  if (current) entries.push(current);
  return entries;
}

// Fallback only. Used if the Gemini structure-analysis call fails, so a flaky network
// doesn't leave the student stuck without any TOC at all.
function heuristicStatus(body: string): { status: TocNode['status']; note: string } {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return { status: 'missing', note: 'No content found under this heading yet.' };
  if (wordCount < 25) return { status: 'partial', note: 'This section is thin — consider adding more detail or an example.' };
  return { status: 'complete', note: '' };
}

function buildTocTree(lines: SkeletonLine[], statuses: Map<string, { status: TocNode['status']; note: string }>): TocNode[] {
  const roots: TocNode[] = [];
  const stack: { depth: number; node: TocNode }[] = [];

  for (const line of lines) {
    const info = statuses.get(line.code);
    const node: TocNode = {
      id: line.code,
      label: `${line.code} ${line.title}`,
      level: line.depth === 1 ? 'section' : line.depth === 2 ? 'subsection' : 'subsubsection',
      status: info?.status ?? 'partial',
      description: line.body || 'No content found under this heading yet.',
      suggestion: info?.note,
      children: [],
    };

    while (stack.length && stack[stack.length - 1].depth >= line.depth) stack.pop();
    if (stack.length) stack[stack.length - 1].node.children.push(node);
    else roots.push(node);
    stack.push({ depth: line.depth, node });
  }

  return roots;
}

const queryClient = new QueryClient();
const SOURCE_KEY = 'science-research-sources';
const NOTES_KEY = 'science-research-notes';
const TODO_KEY = 'dynamic-planet-todos';
const UPDATES_KEY = 'dynamic-planet-updates';
const BINDER_KEY = 'project-dynamic-binder';
const TOC_ANALYSIS_KEY = 'TOC_ANALYSIS_KEY';
const ACTIVE_PIN_KEY = 'project-dynamic-pin';
const PIN_PATTERN = /^\d{4,8}$/;

type Source = { id: string; url: string };
type SavedNote = { id: string; question: string; answer: string; subject: string; createdAt: string };
type Todo = { id: string; label: string; done: boolean };
type BinderUpdate = { id: string; section: string; update: string; createdAt: string };

// Everything the PIN system saves on the server and restores on another device.
// Keep this in sync with what the /api/binder-sync routes accept and return.
type BinderSyncState = {
  binder: string;
  todos: Todo[];
  updates: BinderUpdate[];
  sources: Source[];
  notes: SavedNote[];
  tocAnalysis: TocAnalysis | null;
};

// NOTE: these three assume the binder-sync router is mounted at "/api" on your
// server, matching how the other Gemini routes are likely reached (e.g.
// "/api/gemini/research"). If your server mounts things differently, update
// the "/api" prefix in these three functions to match.
async function fetchPinState(pin: string): Promise<{ ok: true; state: BinderSyncState } | { ok: false; error: string }> {
  try {
    const response = await fetch(`/api/binder-sync/${pin}`);
    const data = await response.json();
    if (!response.ok) return { ok: false, error: data.error || "We couldn't find that PIN." };
    return { ok: true, state: data as BinderSyncState };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

async function createPin(pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const response = await fetch('/api/binder-sync/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await response.json();
    if (!response.ok) return { ok: false, error: data.error || 'Could not create that PIN.' };
    return { ok: true };
  } catch {
    return { ok: false, error: 'Could not reach the server. Check your connection and try again.' };
  }
}

// Best-effort background save — local storage stays the source of truth for the
// current tab, so a failed sync just means "not backed up yet," not data loss.
function pushPinState(pin: string, state: BinderSyncState, onSettled: (ok: boolean) => void) {
  fetch(`/api/binder-sync/${pin}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
    .then((response) => onSettled(response.ok))
    .catch(() => onSettled(false));
}

const starterTodos: Todo[] = [
  { id: 'earth-structure', label: 'Earth structure and composition', done: false },
  { id: 'plate-tectonics', label: 'Plate tectonics and boundaries', done: false },
  { id: 'minerals-rocks', label: 'Minerals, rocks, and the rock cycle', done: false },
  { id: 'surface-processes', label: 'Surface processes and landforms', done: false },
  { id: 'hazards', label: 'Geologic hazards and preparedness', done: false },
  { id: 'maps', label: 'Maps, models, and data interpretation', done: false },
];

const samples = [
  'How do mycorrhizal fungi help plants survive drought?',
  'What makes a reaction exothermic at the molecular level?',
  'How does ocean acidification affect shell-forming organisms?',
];

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Overwrites every localStorage slot Home() reads on boot. Used both when a PIN
// loads real saved data, and when a fresh PIN is created and old local leftovers
// need clearing so setup starts clean.
function writeLocalState(state: Partial<BinderSyncState>) {
  window.localStorage.setItem(BINDER_KEY, JSON.stringify(state.binder ?? ''));
  window.localStorage.setItem(TODO_KEY, JSON.stringify(state.todos ?? starterTodos));
  window.localStorage.setItem(UPDATES_KEY, JSON.stringify(state.updates ?? []));
  window.localStorage.setItem(SOURCE_KEY, JSON.stringify(state.sources ?? []));
  window.localStorage.setItem(NOTES_KEY, JSON.stringify(state.notes ?? []));
  window.localStorage.setItem(TOC_ANALYSIS_KEY, JSON.stringify(state.tocAnalysis ?? null));
}

function renderAnswer(text: string) {
  return text.split(/\n\s*\n/).map((paragraph, index) => {
    const cleaned = paragraph.replace(/^#{1,4}\s+/gm, '');
    return (
      <p key={`${paragraph.slice(0, 12)}-${index}`}>
        {cleaned.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
          part.startsWith('**') && part.endsWith('**')
            ? <strong key={partIndex}>{part.slice(2, -2)}</strong>
            : part,
        )}
      </p>
    );
  });
}

function BinderSetup({ onComplete, initialValue = '' }: { onComplete: (binder: string) => void; initialValue?: string }) {
  const [binder, setBinder] = useState(initialValue);
  const [message, setMessage] = useState('');
  const isAnalyzing = false;

  const saveBinder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (binder.trim().length < 20) {
      setMessage('Add the contents of your binder so Project Dynamic has enough context to help.');
      return;
    }
    // Was previously saved as a raw string, but readStorage() always JSON.parses on
    // read — that throws on real multi-line binder text and silently falls back to
    // '', which is why the binder appeared to reset itself on every reload.
    window.localStorage.setItem(BINDER_KEY, JSON.stringify(binder.trim()));
    onComplete(binder.trim());
  };

  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Setup</div>
      <h1>Bring your binder<br /><em>to the table.</em></h1>
      <p className="setup-copy">Before the workspace opens, paste or describe your entire Dynamic Planet binder. Project Dynamic uses this as your map so its suggestions build on what you actually have.</p>

      <div style={{
        marginTop: '20px',
        padding: '16px 20px',
        background: 'hsl(var(--primary) / 0.06)',
        borderRadius: '16px',
        border: '1px solid hsl(var(--primary) / 0.12)',
        width: '100%',
        maxWidth: '650px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: 0, lineHeight: '1.6' }}>
          Built with 💙 by{' '}
          <strong style={{ color: 'hsl(var(--primary))' }}>DeepSeek</strong>
          {' '}·{' '}
          <strong style={{ color: 'hsl(var(--primary))' }}>Agent from Replit</strong>
          {' '}· and{' '}
          <strong style={{ color: 'hsl(var(--primary))' }}>you</strong> 🚀
        </p>
        <p style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground) / 0.6)', margin: '4px 0 0' }}>
          Special thanks to the Science Olympiad community
        </p>
      </div>

      <form className="setup-form" onSubmit={saveBinder}>
        <label className="question-label" htmlFor="binder-inventory">Your complete binder inventory</label>
        <textarea 
          id="binder-inventory" 
          value={binder} 
          onChange={(event) => { setBinder(event.target.value); setMessage(''); }} 
          placeholder="Paste your entire binder content here..." 
          data-testid="input-binder-inventory" 
          disabled={isAnalyzing}
        />
        {message && <div className="setup-message" role="alert" data-testid="status-binder-setup">{message}</div>}
        <button className="primary-button" type="submit" disabled={isAnalyzing} data-testid="button-open-project-dynamic">
          {isAnalyzing ? '🔍 Analyzing...' : <><BookOpen size={15} /> Open Project Dynamic</>}
        </button>
      </form>
      <div className="setup-note"><Info size={14} /> Your binder inventory stays in this browser and is sent to Gemini only when you ask for research or plan updates.</div>
    </div>
  );
}

function SkeletonReview({ lines, onApprove, onEdit, isAnalyzing }: { lines: SkeletonLine[]; onApprove: () => void; onEdit: () => void; isAnalyzing: boolean }) {
  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Structure check</div>
      <h1>Does this<br /><em>look right?</em></h1>
      <p className="setup-copy">This is just the shape of your binder — codes and titles, no content review yet. Confirm it before Gemini reads everything else.</p>

      <div style={{ width: '100%', maxWidth: '650px', background: 'hsl(var(--card) / 0.6)', borderRadius: '16px', border: '1px solid hsl(var(--card-border))', padding: '20px 24px', marginTop: '24px', textAlign: 'left' }} data-testid="tree-skeleton-review">
        {lines.map((line) => (
          <div key={line.code} style={{ paddingLeft: `${(line.depth - 1) * 20}px`, fontSize: '13px', padding: '4px 0' }} data-testid={`row-skeleton-${line.code}`}>
            <span style={{ fontWeight: 600, marginRight: '8px', color: 'hsl(var(--primary))' }}>{line.code}</span>
            <span>{line.title}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
        <button className="outline-button" onClick={onEdit} disabled={isAnalyzing} data-testid="button-edit-skeleton">Let me fix it</button>
        <button className="primary-button" onClick={onApprove} disabled={isAnalyzing} data-testid="button-approve-skeleton">
          {isAnalyzing ? '🔍 Analyzing...' : 'Looks right — analyze it'}
        </button>
      </div>
    </div>
  );
}

function AnalyzingScreen({ message, progress }: { message: string; progress: number }) {
  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Reading your binder</div>
      <h1>One moment.</h1>
      <p className="setup-copy">{message || 'Gemini is matching your notes to each section...'}</p>
      <div style={{ width: '100%', maxWidth: '420px', height: '6px', background: 'hsl(var(--muted))', borderRadius: '99px', overflow: 'hidden', marginTop: '20px' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'hsl(var(--primary))', borderRadius: '99px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

function TocSidebar({ toc, onNodeHover, hoveredNode }: { 
  toc: TocAnalysis; 
  onNodeHover: (node: TocNode | null) => void;
  hoveredNode: TocNode | null;
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'complete': return '#3b82f6';
      case 'partial': return '#eab308';
      case 'missing': return '#ef4444';
      default: return '#6b7280';
    }
  };

  const getStatusEmoji = (status: string) => {
    switch (status) {
      case 'complete': return '✅';
      case 'partial': return '⚠️';
      case 'missing': return '❌';
      default: return '📄';
    }
  };

  const getCelebrationEmoji = (status: string) => {
    if (status === 'complete') {
      const emojis = ['🎉', '🌟', '✨', '💫', '🏆', '⭐', '👏', '🎊'];
      return emojis[Math.floor(Math.random() * emojis.length)];
    }
    return '';
  };

  const renderNode = (node: TocNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node.id);
    const hasChildren = node.children && node.children.length > 0;
    const isLeaf = !hasChildren;

    if (isLeaf) {
      const color = getStatusColor(node.status);
      const emoji = getStatusEmoji(node.status);
      const celebration = getCelebrationEmoji(node.status);
      const isHovered = hoveredNode?.id === node.id;

      return (
        <div 
          key={node.id}
          className="toc-leaf"
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            borderLeft: `3px solid ${color}`,
            background: isHovered ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
            borderRadius: '6px',
            transition: 'background 0.2s ease',
            cursor: 'pointer',
          }}
          onMouseEnter={() => onNodeHover(node)}
          onMouseLeave={() => onNodeHover(null)}
        >
          <div className="flex items-center gap-2 py-1.5 px-2 text-sm">
            <span>{emoji}</span>
            <span className="flex-1 truncate">{node.label}</span>
            {celebration && <span className="text-xs animate-pulse">{celebration}</span>}
          </div>
        </div>
      );
    }

    return (
      <div key={node.id}>
        <div 
          className="toc-parent"
          style={{
            paddingLeft: `${depth * 16 + 8}px`,
            cursor: 'pointer',
            borderRadius: '6px',
            transition: 'background 0.2s ease',
          }}
          onClick={() => toggleExpand(node.id)}
          onMouseEnter={() => onNodeHover(node)}
          onMouseLeave={() => onNodeHover(null)}
        >
          <div className="flex items-center gap-2 py-1.5 px-2 text-sm font-medium hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md">
            <span className="text-xs transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
              ▶
            </span>
            <span>{node.label}</span>
            <span className="text-xs text-gray-400 ml-auto">
              {node.children.filter(c => c.status === 'complete').length}/{node.children.length}
            </span>
          </div>
        </div>
        {isExpanded && (
          <div className="toc-children">
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="toc-sidebar" style={{
      position: 'sticky',
      top: '80px',
      maxHeight: 'calc(100vh - 120px)',
      overflowY: 'auto',
      padding: '16px 12px',
      background: 'hsl(var(--card) / 0.6)',
      borderRadius: '20px',
      border: '1px solid hsl(var(--card-border))',
      backdropFilter: 'blur(10px)',
    }}>
      <div className="toc-header mb-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">📑 Binder TOC</h3>
          <div className="flex gap-2 text-xs">
            <span style={{ color: '#3b82f6' }}>● {toc.summary.complete}</span>
            <span style={{ color: '#eab308' }}>● {toc.summary.partial}</span>
            <span style={{ color: '#ef4444' }}>● {toc.summary.missing}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-2 text-[10px] text-gray-400">
          <span>🔵 Complete</span>
          <span>🟡 Has gaps</span>
          <span>🔴 Missing</span>
        </div>
      </div>

      <div className="toc-tree">
        {toc.nodes.map(node => renderNode(node, 0))}
      </div>

      {hoveredNode && (
        <div className="toc-tooltip" style={{
          position: 'fixed',
          bottom: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '420px',
          padding: '16px 20px',
          background: 'hsl(var(--card))',
          borderRadius: '16px',
          border: '1px solid hsl(var(--card-border))',
          boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          zIndex: 1000,
          backdropFilter: 'blur(20px)',
        }}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">
              {hoveredNode.status === 'complete' ? '🎉' : 
               hoveredNode.status === 'partial' ? '📝' : '🔍'}
            </span>
            <div>
              <div className="font-semibold text-sm">{hoveredNode.label}</div>
              <div className="text-xs text-gray-500 mt-1">{hoveredNode.description}</div>
              {hoveredNode.suggestion && (
                <div className="text-xs mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  💡 {hoveredNode.suggestion}
                </div>
              )}
              {hoveredNode.status === 'complete' && (
                <div className="text-xs mt-1 text-blue-500">✨ All content covered!</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// PIN SYSTEM — lets a student resume their binder on a different
// device by typing the PIN they created earlier. Mandatory: no PIN,
// no entry, matching how a plain resume-code gate is supposed to work.
// ============================================

function PinGate() {
  const [pin, setPin] = useState<string | null>(() => readStorage<string | null>(ACTIVE_PIN_KEY, null));

  // Already unlocked on this device (a PIN was entered/created here before) —
  // skip straight to the workspace instead of asking again every visit.
  if (pin) {
    return (
      <Home
        pin={pin}
        onForgetPin={() => {
          window.localStorage.removeItem(ACTIVE_PIN_KEY);
          setPin(null);
        }}
      />
    );
  }

  return (
    <PinLanding
      onUnlock={(newPin) => {
        window.localStorage.setItem(ACTIVE_PIN_KEY, JSON.stringify(newPin));
        setPin(newPin);
      }}
    />
  );
}

function PinLanding({ onUnlock }: { onUnlock: (pin: string) => void }) {
  const [mode, setMode] = useState<'choose' | 'enter' | 'create'>('choose');
  const [pinInput, setPinInput] = useState('');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);

  const openMode = (next: 'enter' | 'create') => {
    setMode(next);
    setPinInput('');
    setError('');
  };

  const submitEnter = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = pinInput.trim();
    if (!PIN_PATTERN.test(trimmed)) {
      setError('Enter the 4 to 8 digit PIN you created.');
      return;
    }
    setIsBusy(true);
    setError('');
    const result = await fetchPinState(trimmed);
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    writeLocalState(result.state);
    onUnlock(trimmed);
  };

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = pinInput.trim();
    if (!PIN_PATTERN.test(trimmed)) {
      setError('Choose a PIN that is 4 to 8 digits.');
      return;
    }
    setIsBusy(true);
    setError('');
    const result = await createPin(trimmed);
    setIsBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    // Fresh PIN — clear out any old local leftovers so setup starts clean.
    writeLocalState({});
    onUnlock(trimmed);
  };

  if (mode === 'choose') {
    return (
      <div className="setup-screen">
        <div className="setup-mark"><FlaskConical size={22} /></div>
        <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic</div>
        <h1>Welcome back?<br /><em>Or starting fresh.</em></h1>
        <p className="setup-copy">A PIN saves your binder, checklist, and notes so you can pick them up on any device — no account or password needed.</p>
        <div style={{ display: 'flex', gap: '10px', marginTop: '24px' }}>
          <button className="primary-button" onClick={() => openMode('enter')} data-testid="button-have-pin">I have a PIN</button>
          <button className="outline-button" onClick={() => openMode('create')} data-testid="button-new-pin">Create a PIN</button>
        </div>
        <div className="setup-note"><Info size={14} /> Treat your PIN like a resume code, not a password — anyone who has it can open your binder.</div>
      </div>
    );
  }

  const isCreate = mode === 'create';
  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic</div>
      {isCreate ? <h1>Pick a PIN<br /><em>to save your spot.</em></h1> : <h1>Enter your<br /><em>PIN.</em></h1>}
      <p className="setup-copy">
        {isCreate
          ? "4 to 8 digits, whatever you'll remember. You'll still paste your binder in on the next screen — this PIN is just what lets you come back to it later."
          : 'Type the PIN you created earlier to load your binder, checklist, and notes.'}
      </p>
      <form className="setup-form" onSubmit={isCreate ? submitCreate : submitEnter}>
        <label className="question-label" htmlFor="pin-input">PIN</label>
        <input
          id="pin-input"
          inputMode="numeric"
          maxLength={8}
          value={pinInput}
          onChange={(event) => { setPinInput(event.target.value.replace(/\D/g, '')); setError(''); }}
          placeholder="e.g. 4271"
          data-testid="input-pin"
          style={{ fontSize: '20px', letterSpacing: '4px', textAlign: 'center' }}
        />
        {error && <div className="setup-message" role="alert" data-testid="status-pin-error">{error}</div>}
        <button className="primary-button" type="submit" disabled={isBusy} data-testid="button-submit-pin">
          {isBusy ? 'Checking...' : isCreate ? 'Create PIN & continue' : 'Unlock my binder'}
        </button>
      </form>
      <button className="outline-button" style={{ marginTop: '12px' }} onClick={() => setMode('choose')} data-testid="button-pin-back">Back</button>
    </div>
  );
}

function Home({ pin, onForgetPin }: { pin: string; onForgetPin: () => void }) {
  const [question, setQuestion] = useState('');
  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; model: string } | null>(null);
  const [sources, setSources] = useState<Source[]>(() => readStorage<Source[]>(SOURCE_KEY, []));
  const [notes, setNotes] = useState<SavedNote[]>(() => readStorage<SavedNote[]>(NOTES_KEY, []));
  const [todos, setTodos] = useState<Todo[]>(() => readStorage<Todo[]>(TODO_KEY, starterTodos));
  const [updates, setUpdates] = useState<BinderUpdate[]>(() => readStorage<BinderUpdate[]>(UPDATES_KEY, []));
  const [binder, setBinder] = useState(() => readStorage<string>(BINDER_KEY, ''));
  const [sourceUrl, setSourceUrl] = useState('');
  const [newTodo, setNewTodo] = useState('');
  const [updateSection, setUpdateSection] = useState('');
  const [updateText, setUpdateText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const [insightFocus, setInsightFocus] = useState('');
  const askResearch = useAskGeminiResearch();
  const updateBinderPlan = useUpdateGeminiBinderPlan();
  const analyzeBinderStructure = useAnalyzeBinderStructure();
  const [tocAnalysis, setTocAnalysis] = useState<TocAnalysis | null>(() => 
    readStorage<TocAnalysis | null>(TOC_ANALYSIS_KEY, null)
  );
  const [hoveredNode, setHoveredNode] = useState<TocNode | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis[]>([]);
  const [skeletonLines, setSkeletonLines] = useState<SkeletonLine[]>([]);
  const [stage, setStage] = useState<'review' | 'analyzing' | 'ready'>('ready');
  const [editingBinder, setEditingBinder] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [isResettingBinder, setIsResettingBinder] = useState(false);
  const hasHydratedRef = useRef(true);

  useEffect(() => {
    window.localStorage.setItem(SOURCE_KEY, JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);
  useEffect(() => {
    window.localStorage.setItem(TODO_KEY, JSON.stringify(todos));
  }, [todos]);
  useEffect(() => {
    window.localStorage.setItem(UPDATES_KEY, JSON.stringify(updates));
  }, [updates]);

  // Pushes the current binder/checklist/notes/sources to the server under this
  // PIN a moment after anything changes, so another device can load it later.
  // Skips the very first run after mount/hydration — that state either just
  // came from the server (re-saving it would be pointless) or from a brand
  // new PIN (nothing to push yet).
  useEffect(() => {
    if (hasHydratedRef.current) {
      hasHydratedRef.current = false;
      return;
    }
    setSyncStatus('syncing');
    const timeout = window.setTimeout(() => {
      pushPinState(pin, { binder, todos, updates, sources, notes, tocAnalysis }, (ok) => {
        setSyncStatus(ok ? 'idle' : 'error');
      });
    }, 900);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, binder, todos, updates, sources, notes, tocAnalysis]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    if (trimmedQuestion.length < 3) {
      setValidationMessage('Write at least three characters so the question has enough direction.');
      return;
    }
    setValidationMessage('');
    setErrorMessage('');
    setAnswer(null);
    askResearch.mutate(
      {
        data: {
          question: trimmedQuestion,
          ...(subject ? { subject } : {}),
          ...(context.trim() ? { context: context.trim() } : {}),
        },
      },
      {
        onSuccess: (result) => {
          setAnswer(result);
          setFeedback('Research note ready to review');
        },
        onError: (error) => {
          const apiError = error as { error?: string; message?: string };
          setErrorMessage(apiError.error || apiError.message || 'The research desk could not complete that question.');
        },
      },
    );
  };

  const askForInsights = () => {
    setQuestion('Based on my Dynamic Planet binder progress, what should I add next and what branches of sections should I investigate?');
    setSubject('Dynamic Planet — Division B');
    setContext([
      `Binder checklist: ${todos.map((todo) => `${todo.done ? '[done]' : '[open]'} ${todo.label}`).join('; ')}`,
      updates.length ? `My updates: ${updates.map((item) => `${item.section}: ${item.update}`).join(' | ')}` : 'I have not logged any updates yet.',
      'Suggest practical binder sections, diagrams, vocabulary, comparison tables, and study checks. Prioritize gaps and do not assume I have completed anything not marked done.',
    ].join('\n'));
    window.setTimeout(() => document.getElementById('question-field')?.focus(), 0);
    setFeedback('Insight prompt prepared from your binder');
  };

  const toggleTodo = (id: string) => {
    setTodos((current) => current.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo));
    setFeedback('Binder checklist updated');
  };

  const addTodo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = newTodo.trim();
    if (!label) return;
    setTodos((current) => [...current, { id: `${Date.now()}`, label, done: false }]);
    setNewTodo('');
    setFeedback('Section added to your checklist');
  };

  const addUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const section = updateSection.trim();
    const update = updateText.trim();
    if (!section || !update) return;
    setUpdates((current) => [{ id: `${Date.now()}`, section, update, createdAt: new Date().toISOString() }, ...current]);
    setUpdateSection('');
    setUpdateText('');
    setFeedback('Binder update saved locally');
    updatePlan(update);
  };

  const updatePlan = (latestUpdate: string) => {
    updateBinderPlan.mutate({
      data: {
        binder,
        update: latestUpdate,
        todos: todos.map((todo) => todo.label),
        completed: todos.filter((todo) => todo.done).map((todo) => todo.label),
      },
    }, {
      onSuccess: (result) => {
        setTodos((current) => {
          const completedLabels = new Set(result.completed);
          const existingLabels = new Set(current.map((todo) => todo.label.toLowerCase()));
          const added = result.add.filter((label) => label.trim() && !existingLabels.has(label.toLowerCase())).map((label) => ({ id: `${Date.now()}-${label}`, label, done: false }));
          return [...current.map((todo) => completedLabels.has(todo.label) ? { ...todo, done: true } : todo), ...added];
        });
        setInsightFocus(result.focus);
        setFeedback(result.add.length ? 'AI updated your checklist with new branches' : 'AI checked your binder progress');
      },
      onError: () => setFeedback('Update saved; AI plan update is unavailable right now'),
    });
  };

  const chooseSample = (sample: string) => {
    setQuestion(sample);
    setValidationMessage('');
    document.getElementById('question-field')?.focus();
  };

  const saveAnswer = () => {
    if (!answer) return;
    const note: SavedNote = {
      id: `${Date.now()}`,
      question: question.trim(),
      answer: answer.answer,
      subject: subject || 'General science',
      createdAt: new Date().toISOString(),
    };
    setNotes((current) => [note, ...current]);
    setFeedback('Saved to this research session');
  };

  const addSource = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedUrl = sourceUrl.trim();
    if (!trimmedUrl) return;
    const normalizedUrl = /^https?:\/\//i.test(trimmedUrl) ? trimmedUrl : `https://${trimmedUrl}`;
    try {
      new URL(normalizedUrl);
      setSources((current) => [{ id: `${Date.now()}`, url: normalizedUrl }, ...current]);
      setSourceUrl('');
      setFeedback('Source link saved locally');
    } catch {
      setValidationMessage('Add a full, valid source link such as nasa.gov or https://... .');
    }
  };

  const copyAnswer = async () => {
    if (!answer) return;
    try {
      await navigator.clipboard.writeText(answer.answer);
      setFeedback('Answer copied to clipboard');
    } catch {
      setFeedback('Select the answer text to copy it');
    }
  };

  const clearSession = () => {
    if (!window.confirm("Clear your binder, checklist, and notes, and log out of this PIN? (Nothing already saved online under this PIN is touched — entering this PIN again would still have your old data.)")) return;
    hasHydratedRef.current = true;
    writeLocalState({});
    onForgetPin();
  };

  const switchPin = () => {
    if (syncStatus === 'syncing' && !window.confirm('Still saving your latest changes — switch PINs anyway?')) return;
    onForgetPin();
  };

  // ============================================
  // RESET BINDER - Clear current binder and start fresh
  // ============================================
  const resetBinder = () => {
    if (!window.confirm('Reset your binder? This will clear your current binder, TOC, and analysis. Your checklist, notes, and sources will stay.')) return;

    setIsResettingBinder(true);
    setFeedback('🔄 Clearing binder...');

    // Clear binder and TOC from localStorage
    window.localStorage.setItem(BINDER_KEY, JSON.stringify(''));
    window.localStorage.setItem(TOC_ANALYSIS_KEY, JSON.stringify(null));

    // Reset state
    setBinder('');
    setTocAnalysis(null);
    setGapAnalysis([]);
    setSkeletonLines([]);
    setStage('ready');
    setEditingBinder(true);
    setIsResettingBinder(false);

    setFeedback('📋 Binder cleared! Paste your new binder below.');
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ============================================
  // GEMINI SKIM - Creates binder skeleton
  // ============================================
  const skimBinder = (binderContent: string) => {
    setSkeletonLines(parseSkeletonLines(binderContent));
    setStage('review');
  };

  // Takes a code -> {status, note} map (either from Gemini or the local fallback),
  // builds the TOC tree + gap list from it, and lands the workspace on 'ready'.
  const finishAnalysis = (
    statuses: Map<string, { status: TocNode['status']; note: string }>,
    resultMessage: string,
  ) => {
    const nodes = buildTocTree(skeletonLines, statuses);

    const flatten = (list: TocNode[]): TocNode[] => list.flatMap((n) => [n, ...flatten(n.children)]);
    const flat = flatten(nodes);
    const complete = flat.filter((n) => n.status === 'complete').length;
    const partial = flat.filter((n) => n.status === 'partial').length;
    const missing = flat.filter((n) => n.status === 'missing').length;

    const gaps: GapAnalysis[] = flat.filter((n) => n.status !== 'complete').map((n) => ({
      topic: n.label,
      status: n.status === 'partial' ? 'partial' : 'missing',
      binderHas: n.description,
      binderMissing: n.suggestion || '',
      suggestion: n.suggestion || 'Add more detail here.',
      priority: n.status === 'missing' ? 'high' : 'medium',
    }));

    setAnalysisProgress(100);
    setGapAnalysis(gaps);
    setTocAnalysis({ nodes, summary: { total: flat.length, complete, partial, missing } });
    window.localStorage.setItem(TOC_ANALYSIS_KEY, JSON.stringify({ nodes, summary: { total: flat.length, complete, partial, missing } }));
    setStage('ready');
    setFeedback(resultMessage);
  };

  const analyzeBinder = () => {
    setStage('analyzing');
    setAnalysisMessage('🧠 Matching your notes to each section...');
    setAnalysisProgress(30);

    analyzeBinderStructure.mutate(
      {
        data: {
          sections: skeletonLines.map((line) => ({ code: line.code, title: line.title, body: line.body })),
          formatInstructions: GEMINI_FORMAT_INSTRUCTIONS,
        },
      },
      {
        onSuccess: (result: BinderStructureAnalysisResult) => {
          const statuses = new Map(result.sections.map((item) => [item.code, { status: item.status, note: item.note }] as const));
          finishAnalysis(statuses, '🎉 Binder structure and gaps mapped!');
        },
        onError: () => {
          // Gemini call failed — fall back to the local word-count pass so the
          // student still gets a usable TOC instead of being stuck on this screen.
          const statuses = new Map(skeletonLines.map((line) => [line.code, heuristicStatus(line.body)] as const));
          finishAnalysis(statuses, 'AI analysis unavailable — showing a quick local estimate instead');
        },
      },
    );
  };

  const editSkeleton = () => setEditingBinder(true);

  const handleBinderComplete = (binderContent: string) => {
    setBinder(binderContent);
    setEditingBinder(false);
    skimBinder(binderContent);
  };

  if (!binder.trim() || editingBinder) {
    return <BinderSetup onComplete={handleBinderComplete} initialValue={binder} />;
  }

  if (stage === 'review') {
    return <SkeletonReview lines={skeletonLines} onApprove={analyzeBinder} onEdit={editSkeleton} isAnalyzing={false} />;
  }

  if (stage === 'analyzing') {
    return <AnalyzingScreen message={analysisMessage} progress={analysisProgress} />;
  }

  // ============================================
  // GEMINI DEEP ANALYSIS - Finds gaps
  // ============================================

  return (
    <div className="workspace-shell" style={{
      display: 'grid',
      gridTemplateColumns: tocAnalysis ? '248px 1fr 320px' : '248px 1fr',
      minHeight: '100dvh',
    }}>
      {/* SIDEBAR */}
      <aside className="sidebar" data-testid="sidebar-workspace">
        <div className="flex items-center gap-3">
          <div className="brand-mark" aria-hidden="true"><FlaskConical size={19} strokeWidth={1.7} /></div>
          <div>
            <div className="eyebrow" style={{ color: 'hsl(var(--sidebar-primary))' }}>Science Olympiad</div>
            <div className="text-sm font-semibold tracking-tight">Fieldwork</div>
          </div>
        </div>
        <nav className="sidebar-nav" aria-label="Workspace sections">
          <button className="nav-item active" onClick={() => scrollTo('question-desk')} data-testid="button-nav-desk">
            <Sparkles size={15} /> Research desk
          </button>
          <button className="nav-item" onClick={() => scrollTo('saved-notes')} data-testid="button-nav-notes">
            <NotebookPen size={15} /> Saved notes
            {notes.length > 0 && <span className="ml-auto text-[10px]" style={{ color: 'hsl(var(--sidebar-primary))' }}>{notes.length}</span>}
          </button>
          <button className="nav-item" onClick={() => scrollTo('binder-plan')} data-testid="button-nav-plan">
            <ListChecks size={15} /> Binder plan
            {todos.filter((todo) => todo.done).length > 0 && <span className="ml-auto text-[10px]" style={{ color: 'hsl(var(--sidebar-primary))' }}>{todos.filter((todo) => todo.done).length}/{todos.length}</span>}
          </button>
          <button className="nav-item" onClick={() => scrollTo('binder-updates')} data-testid="button-nav-updates">
            <NotebookPen size={15} /> My updates
            {updates.length > 0 && <span className="ml-auto text-[10px]" style={{ color: 'hsl(var(--sidebar-primary))' }}>{updates.length}</span>}
          </button>
          <button className="nav-item" onClick={() => scrollTo('source-shelf')} data-testid="button-nav-sources">
            <Link2 size={15} /> Source shelf
            {sources.length > 0 && <span className="ml-auto text-[10px]" style={{ color: 'hsl(var(--sidebar-primary))' }}>{sources.length}</span>}
          </button>
        </nav>
        <div className="sidebar-foot">
          <div className="eyebrow mb-3" style={{ color: 'rgba(247,239,218,.45)' }}>A good habit</div>
          <p className="m-0 text-xs leading-relaxed" style={{ color: 'rgba(247,239,218,.64)' }}>Ask narrowly. Check the original paper, dataset, or agency page before you cite it.</p>
          <div className="mt-5 border-t pt-4" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
            <div className="text-[10px] mb-2" style={{ color: 'rgba(247,239,218,.45)' }}>PIN {pin}</div>
            <button className="nav-item w-full p-0 hover:bg-transparent" onClick={switchPin} data-testid="button-switch-pin">
              <RotateCcw size={14} /> Switch PIN
            </button>
            <button className="nav-item w-full p-0 hover:bg-transparent" onClick={resetBinder} disabled={isResettingBinder} data-testid="button-reset-binder">
              <BookOpen size={14} /> {isResettingBinder ? 'Resetting...' : 'Reset Binder'}
            </button>
            <button className="nav-item w-full p-0 hover:bg-transparent" onClick={clearSession} data-testid="button-clear-session">
              <Trash2 size={14} /> Clear this session
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-column">
        <header className="topbar">
          <div className="mobile-brand">
            <div className="brand-mark" aria-hidden="true"><FlaskConical size={16} strokeWidth={1.7} /></div>
            <span className="eyebrow">Science Olympiad / Fieldwork</span>
          </div>
          <div className="topbar-status ml-auto" data-testid="status-local-session">
            <span className="status-dot" aria-hidden="true" />
            {syncStatus === 'syncing' ? 'Saving to your PIN...' : syncStatus === 'error' ? "Couldn't reach the server — saved locally only" : `Saved to PIN ${pin}`}
          </div>
        </header>

        <div className="main-content">
          <section className="intro" data-testid="section-introduction">
            <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Division B</div>
            <h1>Build a binder<br />with <em>solid ground.</em></h1>
            <p>Your personal Dynamic Planet field notebook. Track sections, log what you finished, and ask for the next useful branch to add.</p>
            <button className="insight-button" onClick={askForInsights} data-testid="button-binder-insights"><WandSparkles size={15} /> Ask what to add next</button>
          </section>

          <div className="work-grid">
            <div>
              <section className="question-card" id="question-desk" data-testid="card-question-desk">
                <div className="card-heading">
                  <div>
                    <div className="step-number">01 / RESEARCH</div>
                    <h2>What are you trying to understand?</h2>
                    <p>Ask about a Dynamic Planet concept, event, diagram, or data set.</p>
                  </div>
                  <BookOpen size={20} strokeWidth={1.5} style={{ color: 'hsl(var(--muted-foreground))' }} />
                </div>

                <form onSubmit={submitQuestion} data-testid="form-research-question">
                  <label className="question-label" htmlFor="question-field">Research question</label>
                  <textarea
                    id="question-field"
                    className="question-input"
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    placeholder="e.g. Why do desert plants open their stomata at night?"
                    maxLength={4000}
                    data-testid="input-research-question"
                  />
                  <div className="field-row">
                    <div>
                      <label className="question-label" htmlFor="subject-field">Subject <span style={{ opacity: .65 }}>(optional)</span></label>
                      <select id="subject-field" className="field-control" value={subject} onChange={(event) => setSubject(event.target.value)} data-testid="select-research-subject">
                        <option value="">Choose a subject</option>
                        <option value="Dynamic Planet — Division B">Dynamic Planet — Division B</option>
                        <option value="Anatomy and Physiology">Anatomy and Physiology</option>
                        <option value="Biology">Biology</option>
                        <option value="Chemistry">Chemistry</option>
                        <option value="Earth and Space Science">Earth and Space Science</option>
                        <option value="Environmental Science">Environmental Science</option>
                        <option value="Physics">Physics</option>
                      </select>
                    </div>
                    <div>
                      <label className="question-label" htmlFor="context-field">What do you already know? <span style={{ opacity: .65 }}>(optional)</span></label>
                      <textarea id="context-field" className="field-control context-input" value={context} onChange={(event) => setContext(event.target.value)} maxLength={2000} placeholder="Class notes, constraints, or terms to define..." data-testid="input-research-context" />
                    </div>
                  </div>
                  {validationMessage && <div className="mt-3 text-xs" style={{ color: 'hsl(var(--destructive))' }} data-testid="status-validation">{validationMessage}</div>}
                  <div className="form-footer">
                    <div className="helper-text">For school-approved Science Olympiad research. Verify every answer against primary sources.</div>
                    <button className="primary-button" type="submit" disabled={askResearch.isPending} data-testid="button-submit-research">
                      {askResearch.isPending ? <><RotateCcw size={14} className="animate-spin" /> Thinking through it...</> : <><Send size={14} /> Start research</>}
                    </button>
                  </div>
                </form>

                <div className="sample-area">
                  <div className="sample-label">Need a first thread?</div>
                  <div className="sample-list">
                    {samples.map((sample, index) => (
                      <button className="sample-button" key={sample} onClick={() => chooseSample(sample)} data-testid={`button-sample-question-${index}`}>{sample}</button>
                    ))}
                  </div>
                </div>
              </section>

              {askResearch.isPending && (
                <section className="response-card" aria-label="Research response loading" data-testid="status-research-loading">
                  <div className="skeleton h-4 w-36" />
                  <div className="mt-7 grid gap-3"><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-[92%]" /><div className="skeleton h-4 w-[76%]" /></div>
                  <div className="mt-5 grid gap-3"><div className="skeleton h-4 w-[88%]" /><div className="skeleton h-4 w-[66%]" /></div>
                </section>
              )}

              {errorMessage && !askResearch.isPending && (
                <div className="error-box" data-testid="status-research-error">
                  <span className="flex items-center gap-2"><AlertCircle size={16} /> {errorMessage}</span>
                  <button className="outline-button" onClick={(event) => { event.preventDefault(); setErrorMessage(''); submitQuestion(event as unknown as FormEvent<HTMLFormElement>); }} data-testid="button-retry-research">Retry</button>
                </div>
              )}

              {answer && !askResearch.isPending && (
                <section className="response-card" data-testid="card-research-response">
                  <div className="response-meta">
                    <div className="response-title"><Sparkles size={17} /><h2>Research brief</h2></div>
                    <div className="model-label" data-testid="text-research-model">via {answer.model}</div>
                  </div>
                  <div className="answer-body" data-testid="text-research-answer">
                    {renderAnswer(answer.answer)}
                  </div>
                  <div className="notice">
                    <Info size={15} />
                    <span>This is a research starting point, not a source. Confirm claims, numbers, and definitions in the original publication or agency page before using them in your work.</span>
                  </div>
                  <div className="response-footer">
                    <span className="eyebrow self-center" style={{ color: 'hsl(var(--muted-foreground))' }}>Keep what is useful</span>
                    <div className="response-actions">
                      <button className="outline-button" onClick={copyAnswer} data-testid="button-copy-answer"><Clipboard size={14} /> Copy brief</button>
                      <button className="primary-button" onClick={saveAnswer} data-testid="button-save-note"><NotebookPen size={14} /> Save as note</button>
                    </div>
                  </div>
                </section>
              )}
            </div>

            <aside className="session-stack" aria-label="Research session">
              <section className="session-card binder-card" id="binder-plan" data-testid="card-binder-plan">
                <div className="session-header">
                  <div><div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>02 / PLAN</div><h3>Binder plan</h3><p>{todos.filter((todo) => todo.done).length} of {todos.length} sections checked off.</p></div>
                  <span className="session-count" data-testid="text-todo-count">{todos.filter((todo) => todo.done).length}</span>
                </div>
                <div className="todo-list">
                  {todos.map((todo) => <button className={`todo-item ${todo.done ? 'done' : ''}`} key={todo.id} onClick={() => toggleTodo(todo.id)} data-testid={`button-todo-${todo.id}`}><CheckCircle2 size={16} /><span>{todo.label}</span></button>)}
                </div>
                <form className="add-todo-form" onSubmit={addTodo}>
                  <input value={newTodo} onChange={(event) => setNewTodo(event.target.value)} placeholder="Add a section branch..." aria-label="New binder section" data-testid="input-new-todo" />
                  <button className="icon-button" type="submit" aria-label="Add binder section" data-testid="button-add-todo"><Plus size={15} /></button>
                </form>
              </section>

              <section className="session-card updates-card" id="binder-updates" data-testid="card-binder-updates">
                <div className="session-header">
                  <div><div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>03 / LOG</div><h3>My updates</h3><p>Tell the AI what made it into your binder.</p></div>
                  <span className="session-count" data-testid="text-update-count">{updates.length}</span>
                </div>
                <form className="update-form" onSubmit={addUpdate}>
                  <input value={updateSection} onChange={(event) => setUpdateSection(event.target.value)} placeholder="Section name" aria-label="Updated section name" data-testid="input-update-section" />
                  <textarea value={updateText} onChange={(event) => setUpdateText(event.target.value)} placeholder="What did you add or learn?" aria-label="Binder update" data-testid="input-update-text" />
                  <button className="primary-button" type="submit" disabled={updateBinderPlan.isPending} data-testid="button-save-update"><Plus size={14} /> {updateBinderPlan.isPending ? 'Updating plan...' : 'Log + update plan'}</button>
                </form>
                {insightFocus && <div className="insight-box"><WandSparkles size={14} /><span><strong>AI focus:</strong> {insightFocus}</span></div>}
                {updates.length > 0 && <div className="update-list">{updates.slice(0, 4).map((item) => <article className="update-item" key={item.id}><div><strong>{item.section}</strong><p>{item.update}</p></div><button className="icon-button" onClick={() => setUpdates((current) => current.filter((update) => update.id !== item.id))} aria-label="Delete binder update"><Trash2 size={13} /></button></article>)}</div>}
              </section>

              <section className="session-card" id="source-shelf" data-testid="card-source-shelf">
                <div className="session-header">
                  <div><div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>04 / TRACE</div><h3>Source shelf</h3><p>Keep the links you plan to check.</p></div>
                  <span className="session-count" data-testid="text-source-count">{sources.length}</span>
                </div>
                <form className="source-form" onSubmit={addSource} data-testid="form-add-source">
                  <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Add a source URL" aria-label="Source URL" data-testid="input-source-url" />
                  <button className="primary-button !p-2.5" type="submit" aria-label="Save source URL" data-testid="button-add-source"><Plus size={15} /></button>
                </form>
                {sources.length === 0 ? <div className="empty-mini"><Link2 size={17} className="mx-auto mb-2 opacity-50" />No links yet. Add the original paper, dataset, or agency page you find.</div> : (
                  <div className="source-list">
                    {sources.map((source) => (
                      <div className="source-item" key={source.id} data-testid={`item-source-${source.id}`}>
                        <a href={source.url} target="_blank" rel="noreferrer" data-testid={`link-source-${source.id}`}>{source.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}<ExternalLink size={11} className="ml-1 inline" /></a>
                        <button className="icon-button" onClick={() => setSources((current) => current.filter((item) => item.id !== source.id))} aria-label="Remove source" data-testid={`button-remove-source-${source.id}`}><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="session-card" id="saved-notes" data-testid="card-saved-notes">
                <div className="session-header">
                  <div><div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>05 / KEEP</div><h3>Saved notes</h3><p>Only this browser can see this session.</p></div>
                  <span className="session-count" data-testid="text-note-count">{notes.length}</span>
                </div>
                {notes.length === 0 ? <div className="empty-mini"><NotebookPen size={17} className="mx-auto mb-2 opacity-50" />Your useful answers will live here.</div> : (
                  <div className="note-list">
                    {notes.map((note) => (
                      <article className="note-item" key={note.id} data-testid={`item-note-${note.id}`}>
                        <time>{new Date(note.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} / {note.subject}</time>
                        <p>{note.question}</p>
                        <button className="icon-button ml-auto" onClick={() => setNotes((current) => current.filter((item) => item.id !== note.id))} aria-label="Delete saved note" data-testid={`button-delete-note-${note.id}`}><Trash2 size={13} /></button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </aside>
          </div>

          <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t pt-5" style={{ borderColor: 'hsl(var(--border))' }}>
            <span className="eyebrow" style={{ color: 'hsl(var(--muted-foreground))' }}>Fieldwork protocol / verify before you cite</span>
            <span className="text-[11px]" style={{ color: 'hsl(var(--muted-foreground))' }}>Built for curious teams, one question at a time.</span>
          </footer>
        </div>
      </main>

      {/* TOC SIDEBAR - appears on the right */}
      {(tocAnalysis) && (
        <aside className="toc-sidebar-wrapper" style={{
          padding: '20px 16px',
          borderLeft: '1px solid hsl(var(--border))',
          background: 'hsl(var(--background))',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* TOC Sidebar Component */}
          {tocAnalysis && (
            <TocSidebar 
              toc={tocAnalysis} 
              onNodeHover={setHoveredNode}
              hoveredNode={hoveredNode}
            />
          )}
        </aside>
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <PinGate />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;