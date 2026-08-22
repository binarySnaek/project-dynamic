import { type FormEvent, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, BookOpen, Check, CheckCircle2, Clipboard, ExternalLink, FlaskConical, Info, Link2, ListChecks, NotebookPen, Plus, RotateCcw, Send, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { useAskGeminiResearch, useUpdateGeminiBinderPlan } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import './index.css';

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

function BinderSetup({ onComplete }: { onComplete: (binder: string) => void }) {
  const [binder, setBinder] = useState('');
  const [message, setMessage] = useState('');

  const saveBinder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (binder.trim().length < 20) {
      setMessage('Add the contents of your binder so Project Dynamic has enough context to help.');
      return;
    }
    window.localStorage.setItem(BINDER_KEY, binder.trim());
    onComplete(binder.trim());
  };

  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Setup</div>
      <h1>Bring your binder<br /><em>to the table.</em></h1>
      <p className="setup-copy">Before the workspace opens, paste or describe your entire Dynamic Planet binder. Project Dynamic uses this as your map so its suggestions build on what you actually have.</p>
      <form className="setup-form" onSubmit={saveBinder}>
        <label className="question-label" htmlFor="binder-inventory">Your complete binder inventory</label>
        <textarea id="binder-inventory" value={binder} onChange={(event) => { setBinder(event.target.value); setMessage(''); }} placeholder="List every section, page, diagram, table, vocabulary list, and topic currently in your binder..." data-testid="input-binder-inventory" />
        {message && <div className="setup-message" role="alert" data-testid="status-binder-setup">{message}</div>}
        <button className="primary-button" type="submit" data-testid="button-open-project-dynamic"><BookOpen size={15} /> Open Project Dynamic</button>
      </form>
      <div className="setup-note"><Info size={14} /> Your binder inventory stays in this browser and is sent to Gemini only when you ask for research or plan updates.</div>
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

  if (!binder.trim()) {
    return <BinderSetup onComplete={setBinder} />;
  }

  return (
    <div className="workspace">
      <div className="workspace-shell">
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

        <main className="main-column">
          <header className="topbar">
            <div className="mobile-brand">
              <div className="brand-mark" aria-hidden="true"><FlaskConical size={16} strokeWidth={1.7} /></div>
              <span className="eyebrow">Science Olympiad / Fieldwork</span>
            </div>
            <div className="topbar-status ml-auto" data-testid="status-local-session">
              <span className="status-dot" aria-hidden="true" /> Session saved locally
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
      </div>
      {feedback && <div className="save-toast" role="status" data-testid="status-feedback"><Check size={14} className="mr-2 inline" />{feedback}</div>}
      <Toaster />
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