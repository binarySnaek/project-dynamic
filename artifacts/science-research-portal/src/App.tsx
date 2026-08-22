import { type FormEvent, useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, BookOpen, Check, Clipboard, ExternalLink, FlaskConical, Info, Link2, NotebookPen, Plus, RotateCcw, Send, Sparkles, Trash2 } from 'lucide-react';
import { useAskGeminiResearch } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import './index.css';

const queryClient = new QueryClient();
const SOURCE_KEY = 'science-research-sources';
const NOTES_KEY = 'science-research-notes';

type Source = { id: string; url: string };
type SavedNote = { id: string; question: string; answer: string; subject: string; createdAt: string };

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

function Home() {
  const [question, setQuestion] = useState('');
  const [subject, setSubject] = useState('');
  const [context, setContext] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; model: string } | null>(null);
  const [sources, setSources] = useState<Source[]>(() => readStorage<Source[]>(SOURCE_KEY, []));
  const [notes, setNotes] = useState<SavedNote[]>(() => readStorage<SavedNote[]>(NOTES_KEY, []));
  const [sourceUrl, setSourceUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationMessage, setValidationMessage] = useState('');
  const [feedback, setFeedback] = useState('');
  const askResearch = useAskGeminiResearch();

  useEffect(() => {
    window.localStorage.setItem(SOURCE_KEY, JSON.stringify(sources));
  }, [sources]);

  useEffect(() => {
    window.localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);

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
    setFeedback('Session cleared');
  };

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

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
              <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Research desk / 01</div>
              <h1>Turn a question<br />into <em>solid ground.</em></h1>
              <p>A focused starting point for school-approved Science Olympiad research. Get a clear explanation, then follow the trail back to primary sources.</p>
            </section>

            <div className="work-grid">
              <div>
                <section className="question-card" id="question-desk" data-testid="card-question-desk">
                  <div className="card-heading">
                    <div>
                      <div className="step-number">01 / ASK</div>
                      <h2>What are you trying to understand?</h2>
                      <p>Specific questions lead to more useful, checkable notes.</p>
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
                      {answer.answer.split(/\n\s*\n/).map((paragraph, index) => <p key={`${paragraph.slice(0, 12)}-${index}`}>{paragraph}</p>)}
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
                <section className="session-card" id="source-shelf" data-testid="card-source-shelf">
                  <div className="session-header">
                    <div><div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>02 / TRACE</div><h3>Source shelf</h3><p>Keep the links you plan to check.</p></div>
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
                    <div><div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>03 / KEEP</div><h3>Saved notes</h3><p>Only this browser can see this session.</p></div>
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