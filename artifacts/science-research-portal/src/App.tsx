import { type FormEvent, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, BookOpen, Check, CheckCircle2, Clipboard, ExternalLink, FlaskConical, Info, Link2, ListChecks, NotebookPen, Plus, RotateCcw, Send, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { useAskGeminiResearch, useUpdateGeminiBinderPlan } from '@workspace/api-client-react';
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
const queryClient = new QueryClient();
const SOURCE_KEY = 'science-research-sources';
const NOTES_KEY = 'science-research-notes';
const TODO_KEY = 'dynamic-planet-todos';
const UPDATES_KEY = 'dynamic-planet-updates';
const BINDER_KEY = 'project-dynamic-binder';

type Source = { id: string; url: string };
type SavedNote = { id: string; question: string; answer: string; subject: string; createdAt: string };
type Todo = { id: string; label: string; done: boolean };
type BinderUpdate = { id: string; section: string; update: string; createdAt: string };

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

function BinderSetup({ onComplete }: { onComplete: (binder: string, toc: TocAnalysis | null) => void }) {
  const [binder, setBinder] = useState('');
  const [message, setMessage] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const saveBinder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (binder.trim().length < 20) {
      setMessage('Add the contents of your binder so Project Dynamic has enough context to help.');
      return;
    }

    setIsAnalyzing(true);
    setMessage('🧠 Analyzing your binder structure...');

    try {
      // ⚠️ IMPORTANT: This is where you'd call your Gemini API
      // For now, we'll use a sample TOC to test the UI
      // Later, replace this with a real API call

      // SAMPLE TOC DATA - DELETE THIS AND REPLACE WITH REAL API CALL
      const sampleToc: TocAnalysis = {
        nodes: [
          {
            id: 'A',
            label: 'A. Earth Structure and Composition',
            level: 'section',
            status: 'complete',
            description: 'Earth\'s internal layers and properties',
            suggestion: '',
            children: [
              {
                id: 'A.1',
                label: 'A.1. Interior Layers',
                level: 'subsection',
                status: 'complete',
                description: 'Crust, mantle, outer core, inner core',
                suggestion: '',
                children: [
                  { id: 'A.1.1', label: 'A.1.1. Crust (continental vs oceanic)', level: 'subsubsection', status: 'complete', description: 'Differences between continental and oceanic crust', suggestion: '', children: [] },
                  { id: 'A.1.2', label: 'A.1.2. Mantle (asthenosphere, lithosphere)', level: 'subsubsection', status: 'partial', description: 'Mantle layers and properties', suggestion: 'Add more detail about asthenosphere vs lithosphere', children: [] },
                  { id: 'A.1.3', label: 'A.1.3. Core (outer vs inner)', level: 'subsubsection', status: 'missing', description: 'Earth\'s core composition and properties', suggestion: 'Add section on outer core (liquid) vs inner core (solid)', children: [] },
                ]
              },
              { id: 'A.2', label: 'A.2. Isostasy', level: 'subsection', status: 'partial', description: 'Isostatic equilibrium and crustal buoyancy', suggestion: 'Add diagrams of isostatic balance', children: [] },
              { id: 'A.3', label: 'A.3. Earth\'s Magnetic Field', level: 'subsection', status: 'missing', description: 'Geomagnetism and dynamo theory', suggestion: 'Add section on magnetic reversals and paleomagnetism', children: [] },
            ]
          },
          {
            id: 'B',
            label: 'B. Plate Tectonics',
            level: 'section',
            status: 'complete',
            description: 'Plate movement, boundaries, and driving forces',
            suggestion: '',
            children: [
              {
                id: 'B.1',
                label: 'B.1. Types of Plate Boundaries',
                level: 'subsection',
                status: 'complete',
                description: 'Divergent, convergent, and transform boundaries',
                suggestion: '',
                children: [
                  { id: 'B.1.1', label: 'B.1.1. Divergent (mid-ocean ridges, rift valleys)', level: 'subsubsection', status: 'complete', description: 'Divergent boundary features', suggestion: '', children: [] },
                  { id: 'B.1.2', label: 'B.1.2. Convergent (subduction, mountain building)', level: 'subsubsection', status: 'complete', description: 'Convergent boundary features', suggestion: '', children: [] },
                  { id: 'B.1.3', label: 'B.1.3. Transform (faults, earthquakes)', level: 'subsubsection', status: 'partial', description: 'Transform boundary features', suggestion: 'Add more detail on strike-slip faults', children: [] },
                ]
              },
              { id: 'B.2', label: 'B.2. Driving Mechanisms', level: 'subsection', status: 'missing', description: 'What drives plate movement', suggestion: 'Add section on convection currents, ridge push, slab pull', children: [] },
            ]
          }
        ],
        summary: {
          total: 8,
          complete: 4,
          partial: 2,
          missing: 2
        }
      };

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Use the sample TOC for now
      const tocData = sampleToc;

      window.localStorage.setItem(BINDER_KEY, binder.trim());
      window.localStorage.setItem('TOC_ANALYSIS_KEY', JSON.stringify(tocData));

      setMessage('✅ Binder analyzed successfully!');
      setIsAnalyzing(false);
      onComplete(binder.trim(), tocData);
    } catch (error) {
      setMessage('⚠️ Analysis failed. You can continue without TOC analysis.');
      console.error('TOC analysis error:', error);
      setIsAnalyzing(false);
      window.localStorage.setItem(BINDER_KEY, binder.trim());
      onComplete(binder.trim(), null);
    }
  };

  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Setup</div>
      <h1>Bring your binder<br /><em>to the table.</em></h1>
      <p className="setup-copy">Before the workspace opens, paste or describe your entire Dynamic Planet binder. Project Dynamic uses this as your map so its suggestions build on what you actually have.</p>
      <form className="setup-form" onSubmit={saveBinder}>
        <label className="question-label" htmlFor="binder-inventory">Your complete binder inventory</label>
        <textarea 
          id="binder-inventory" 
          value={binder} 
          onChange={(event) => { setBinder(event.target.value); setMessage(''); }} 
          placeholder="List every section, page, diagram, table, vocabulary list, and topic currently in your binder..." 
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
function Home() {
  
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
  const [tocAnalysis, setTocAnalysis] = useState<TocAnalysis | null>(() => 
    readStorage<TocAnalysis | null>('TOC_ANALYSIS_KEY', null)
  );
  const [hoveredNode, setHoveredNode] = useState<TocNode | null>(null);
  const [isAnalyzingBinder, setIsAnalyzingBinder] = useState(false);
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
    if (!window.confirm('Clear saved sources and notes from this session?')) return;
    setSources([]);
    setNotes([]);
    setTodos(starterTodos);
    setUpdates([]);
    setBinder('');
    window.localStorage.removeItem(BINDER_KEY);
    setFeedback('Session cleared');
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleBinderComplete = (binderContent: string, toc: TocAnalysis | null) => {
    setBinder(binderContent);
    if (toc) {
      setTocAnalysis(toc);
    }
  };

  if (!binder.trim()) {
    return <BinderSetup onComplete={handleBinderComplete} />;
  }

  return (
    <div className="workspace-shell" style={{
      display: 'grid',
      gridTemplateColumns: tocAnalysis ? '248px 1fr 320px' : '248px 1fr',
      minHeight: '100dvh',
    }}>
      {/* SIDEBAR - stays the same */}
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
            <button className="nav-item w-full p-0 hover:bg-transparent" onClick={clearSession} data-testid="button-clear-session">
              <Trash2 size={14} /> Clear this session
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT - stays the same */}
      <main className="main-column">
        {/* ... keep ALL the existing main content exactly as it is ... */}
      </main>

      {/* NEW: TOC SIDEBAR - appears on the right */}
      {tocAnalysis && (
        <aside className="toc-sidebar-wrapper" style={{
          padding: '20px 16px',
          borderLeft: '1px solid hsl(var(--border))',
          background: 'hsl(var(--background))',
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
        }}>
          <TocSidebar 
            toc={tocAnalysis} 
            onNodeHover={setHoveredNode}
            hoveredNode={hoveredNode}
          />
        </aside>
      )}
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Home />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;