import { type FormEvent, useEffect, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { 
  AlertCircle, BookOpen, Check, CheckCircle2, Clipboard, ExternalLink, 
  FlaskConical, Info, Link2, ListChecks, NotebookPen, Plus, RotateCcw, 
  Send, Sparkles, Trash2, WandSparkles, MessageSquare, X, ChevronDown,
  Settings, FileText, Book, ChevronRight, RefreshCw, Save,
  Download, Upload, Shield, User, Sun, Moon, Palette
} from 'lucide-react';
import { useAskGeminiResearch, useUpdateGeminiBinderPlan, useAnalyzeBinderStructure } from '@workspace/api-client-react';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

import './index.css';
// ============================================
// THEME SYSTEManalyzeBnder
// ============================================
// Add at the top of the file or in a global.d.ts file
declare global {
  interface Window {
    tooltipTimeout?: NodeJS.Timeout | null;
  }
}
type ThemeColors = {
  primary: string;
  primaryLight: string;
  primaryDark: string;
  primaryGlow: string;
  accent: string;
  sidebarPrimary: string;
  sidebarAccent: string;
  sidebarBg: string; // ADD THIS
  secondary: string;
  // Also add these missing ones
  background: string;
  cardBg: string;
  border: string;
  text: string;
  mutedText: string;
};
const themes: Record<string, ThemeColors> = {
  blue: {
    primary: '#3b82f6',
    primaryLight: '#60a5fa',
    primaryDark: '#2563eb',
    primaryGlow: 'rgba(59, 130, 246, 0.25)',
    accent: '#f97316',
    sidebarPrimary: '#93c5fd',
    sidebarAccent: '#1e3a5f',
    sidebarBg: '#0f1a2e',
    secondary: '#bfdbfe',
    background: '#e8f0fe',
    cardBg: '#f0f7ff',
    border: '#c5d9f0',
    text: '#1a2a4a',
    mutedText: '#5a7a9a',
  },
  purple: {
    primary: '#8b5cf6',
    primaryLight: '#a78bfa',
    primaryDark: '#7c3aed',
    primaryGlow: 'rgba(139, 92, 246, 0.25)',
    accent: '#ec4899',
    sidebarPrimary: '#c4b5fd',
    sidebarAccent: '#2e1065',
    sidebarBg: '#1a0a2e',
    secondary: '#ddd6fe',
    background: '#f0ecf8',
    cardBg: '#f8f5ff',
    border: '#d5c8f0',
    text: '#2a1a4a',
    mutedText: '#6a5a8a',
  },
  green: {
    primary: '#22c55e',
    primaryLight: '#4ade80',
    primaryDark: '#16a34a',
    primaryGlow: 'rgba(34, 197, 94, 0.25)',
    accent: '#f59e0b',
    sidebarPrimary: '#86efac',
    sidebarAccent: '#14532d',
    sidebarBg: '#0a1a0e',
    secondary: '#bbf7d0',
    background: '#e8f5ec',
    cardBg: '#f0faf5',
    border: '#c5e8d0',
    text: '#1a2a1a',
    mutedText: '#5a7a5a',
  },
  pink: {
    primary: '#ec4899',
    primaryLight: '#f472b6',
    primaryDark: '#db2777',
    primaryGlow: 'rgba(236, 72, 153, 0.25)',
    accent: '#f97316',
    sidebarPrimary: '#f9a8d4',
    sidebarAccent: '#831843',
    sidebarBg: '#2a0a1a',
    secondary: '#fbcfe8',
    background: '#f8ecf2',
    cardBg: '#fff5f8',
    border: '#f0c5d8',
    text: '#4a1a2a',
    mutedText: '#8a5a6a',
  },
  orange: {
    primary: '#f97316',
    primaryLight: '#fb923c',
    primaryDark: '#ea580c',
    primaryGlow: 'rgba(249, 115, 22, 0.25)',
    accent: '#ec4899',
    sidebarPrimary: '#fdba74',
    sidebarAccent: '#7c2d12',
    sidebarBg: '#2a1a0a',
    secondary: '#fed7aa',
    background: '#f8f0e8',
    cardBg: '#fff8f0',
    border: '#f0d8c5',
    text: '#4a2a1a',
    mutedText: '#8a6a5a',
  },
};
// ============================================
// TYPES
// ============================================

type TocNode = {
  id: string;
  label: string;
  level: 'section' | 'subsection' | 'subsubsection';
  status: 'complete' | 'partial' | 'missing';
  description: string;
  suggestion?: string;
  missingSubtopics?: string[];  // NEW
  newSections?: string[];       // NEW
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

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isThinking?: boolean;
  subject?: string;
};

type BinderSyncState = {
  binder: string;
  todos: Todo[];
  updates: BinderUpdate[];
  sources: Source[];
  notes: SavedNote[];
  tocAnalysis: TocAnalysis | null;
};

type Source = { id: string; url: string };
type SavedNote = { id: string; question: string; answer: string; subject: string; createdAt: string };
type Todo = { id: string; label: string; done: boolean };
type BinderUpdate = { id: string; section: string; update: string; createdAt: string };

// At the top of your file, update the type
type BinderStructureAnalysisResult = {
  sections?: { 
    code: string; 
    status: TocNode['status']; 
    note: string;
    missingSubtopics?: string[];
    newSections?: string[];
  }[];
  data?: {
    sections?: { 
      code: string; 
      status: TocNode['status']; 
      note: string;
      missingSubtopics?: string[];
      newSections?: string[];
    }[];
  };
  result?: {
    sections?: { 
      code: string; 
      status: TocNode['status']; 
      note: string;
      missingSubtopics?: string[];
      newSections?: string[];
    }[];
  };
  code?: string;
  status?: TocNode['status'];
  note?: string;
  missingSubtopics?: string[];
  newSections?: string[];
};

// ============================================
// CONSTANTS & HELPERS
// ============================================

const GEMINI_FORMAT_INSTRUCTIONS = `Contents will be in the form of LETTER, LETTER.NUMBER, or LETTER.NUMBER.NUMBER, UNLESS it is in a table of contents, which will ALWAYS be in the form of LETTER0 (e.g. A0, B0). Never treat a LETTER0 line as a real section — it only marks a table-of-contents entry and should be ignored when building the outline.`;
const TOC_MARKER_PATTERN = /^[A-Za-z]+0$/;
const CODED_HEADING_PATTERN = /^([A-Za-z]{1,2}\d+(?:\.\d+)*)\.?\s+(.+)$/;
const BARE_LETTER_HEADING_PATTERN = /^([A-Za-z])\.\s+(.+)$/;
const MAX_HEADING_WORDS = 14;
const PIN_PATTERN = /^\d{4,8}$/;
const GEMINI_REQUEST_DELAY_MS = 20000;
const CHAT_COOLDOWN_MS = 20000;

const queryClient = new QueryClient();

// Base keys (without PIN)
const BASE_SOURCE_KEY = 'science-research-sources';
const BASE_NOTES_KEY = 'science-research-notes';
const BASE_TODO_KEY = 'dynamic-planet-todos';
const BASE_UPDATES_KEY = 'dynamic-planet-updates';
const BASE_BINDER_KEY = 'project-dynamic-binder';
const BASE_TOC_ANALYSIS_KEY = 'TOC_ANALYSIS_KEY';  // <-- This must be defined here
const BASE_CHAT_KEY = 'project-dynamic-chat';
const ACTIVE_PIN_KEY = 'project-dynamic-pin';

// Function to get PIN-specific keys
function getStorageKeys(pin: string) {
  return {
    SOURCE_KEY: `${BASE_SOURCE_KEY}-${pin}`,
    NOTES_KEY: `${BASE_NOTES_KEY}-${pin}`,
    TODO_KEY: `${BASE_TODO_KEY}-${pin}`,
    UPDATES_KEY: `${BASE_UPDATES_KEY}-${pin}`,
    BINDER_KEY: `${BASE_BINDER_KEY}-${pin}`,
    TOC_ANALYSIS_KEY: `${BASE_TOC_ANALYSIS_KEY}-${pin}`,
    CHAT_KEY: `${BASE_CHAT_KEY}-${pin}`,
  };
}

function skeletonDepth(code: string): number {
  const digits = code.replace(/^[A-Za-z]+/, '');
  if (!digits) return 1;
  return 1 + digits.split('.').filter(Boolean).length;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}

function looksLikeRealHeading(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > MAX_HEADING_WORDS) return false;
  if (/[.;]\s+[A-Za-z]/.test(title)) return false;
  return true;
}

function parseSkeletonLines(rawText: string): SkeletonLine[] {
  const entries: SkeletonLine[] = [];
  let current: SkeletonLine | null = null;

  // Skip these patterns (they're NOT real sections)
  const isTOCEntry = (line: string): boolean => {
    // 1. "Table of Contents" or "CONTENTS" line
    if (/table\s*of\s*contents/i.test(line) || /^contents$/i.test(line)) {
      return true;
    }

    // 2. Lines with dots followed by a page number like "a1.......5a" or "…………….…1a"
    if (/[\.…]{3,}\s*\d+[a-z]?/.test(line)) {
      return true;
    }

    // 3. Lines that are JUST a page number like "1a", "2a", "6b" (no section code)
    if (/^\s*\d+[a-z]\s*$/.test(line)) {
      return true;
    }

    // 4. Lines that start with a LOWERCASE section code
    //    e.g., "a0. overview……………….…1a" or "a1. stream drainage systems……………….….1a"
    if (/^[a-z]+\d*\.?\s+/.test(line)) {
      return true;
    }

    // 5. Lines that start with a section code but then have dots and a page number
    //    e.g., "a1. stream drainage systems……………….….1a"
    if (/^[a-z]+\d*\.?\s+[^\n]+[\.…]{3,}\s*\d+[a-z]?/.test(line)) {
      return true;
    }

    return false;
  };

  // Check if this is a REAL section heading (starts with UPPERCASE)
  const isRealHeadingLine = (line: string): boolean => {
    // Must match a section code pattern
    const match = line.match(CODED_HEADING_PATTERN) || line.match(BARE_LETTER_HEADING_PATTERN);
    if (!match) return false;

    const code = match[1];
    const title = match[2].trim();

    // Skip TOC marker pattern (A0, B0) - but note these are UPPERCASE
    if (TOC_MARKER_PATTERN.test(code)) return false;

    // Skip if it has dots and page number in the title
    if (/[\.…]{3,}\s*\d+[a-z]?/.test(title)) return false;

    // ============================================
    // KEY CHANGE: Only keep UPPERCASE sections
    // ============================================
    // Check if the first letter of the code is UPPERCASE
    const firstChar = code.charAt(0);
    if (firstChar !== firstChar.toUpperCase()) {
      return false; // Skip lowercase sections (TOC entries)
    }

    // Must look like a real heading (not too long, not a sentence)
    return looksLikeRealHeading(title);
  };

  for (const rawLine of rawText.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    // Skip TOC entries
    if (isTOCEntry(line)) continue;

    // Check if this is a real heading
    const match = line.match(CODED_HEADING_PATTERN) || line.match(BARE_LETTER_HEADING_PATTERN);
    const isRealHeading = match && isRealHeadingLine(line);

    if (isRealHeading) {
      if (current) entries.push(current);
      current = { 
        code: match[1], 
        title: match[2].trim().replace(/[\.…]{3,}.*$/, ''), // Remove dots and page numbers from title
        depth: skeletonDepth(match[1]), 
        body: '' 
      };
    } else if (current) {
      current.body = current.body ? `${current.body} ${line}` : line;
    }
  }
  if (current) entries.push(current);
  return entries;
}

function heuristicStatus(body: string): { status: TocNode['status']; note: string } {
  const wordCount = body.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount === 0) return { status: 'missing', note: '(FALLBACK) No content found under this heading yet.' };
  if (wordCount < 25) return { status: 'partial', note: '(FALLBACK) This section is thin — consider adding more detail.' };
  return { status: 'complete', note: '' };
}

// ============================================
// SECTION MANAGEMENT FUNCTIONS
// ============================================

function parseSectionCode(code: string): { letter: string; numbers: number[] } {
  const match = code.match(/^([A-Z]+)(\d+(?:\.\d+)*)$/);
  if (!match) throw new Error(`Invalid section code: ${code}`);
  return {
    letter: match[1],
    numbers: match[2].split('.').map(Number),
  };
}

function generateSectionCode(letter: string, numbers: number[]): string {
  return `${letter}${numbers.join('.')}`;
}

function findSectionIndex(skeleton: SkeletonLine[], code: string): number {
  return skeleton.findIndex(s => s.code === code);
}

function insertSection(
  skeleton: SkeletonLine[],
  insertAfter: string | null,
  newTitle: string,
  newBody: string = ''
): SkeletonLine[] {
  const newSkeleton = [...skeleton];

  if (!insertAfter) {
    const newSection: SkeletonLine = {
      code: 'A1',
      title: newTitle,
      body: newBody,
      depth: 1,
    };
    newSkeleton.unshift(newSection);
    return renumberAllSections(newSkeleton);
  }

  const insertIndex = findSectionIndex(newSkeleton, insertAfter);
  if (insertIndex === -1) throw new Error(`Section ${insertAfter} not found`);

  const afterCode = newSkeleton[insertIndex].code;
  const afterParts = parseSectionCode(afterCode);

  const newNumbers = [...afterParts.numbers];
  newNumbers[newNumbers.length - 1]++;

  const newSection: SkeletonLine = {
    code: generateSectionCode(afterParts.letter, newNumbers),
    title: newTitle,
    body: newBody,
    depth: afterParts.numbers.length,
  };

  newSkeleton.splice(insertIndex + 1, 0, newSection);
  return renumberFromIndex(newSkeleton, insertIndex + 1);
}

function renumberFromIndex(skeleton: SkeletonLine[], startIndex: number): SkeletonLine[] {
  const newSkeleton = [...skeleton];
  for (let i = startIndex; i < newSkeleton.length; i++) {
    const prevCode = newSkeleton[i - 1]?.code || newSkeleton[i].code;
    const prevParts = parseSectionCode(prevCode);
    const currentParts = parseSectionCode(newSkeleton[i].code);
    if (prevParts.letter === currentParts.letter && 
        prevParts.numbers.length === currentParts.numbers.length) {
      const newNumbers = [...prevParts.numbers];
      newNumbers[newNumbers.length - 1] = (i - startIndex) + 1;
      for (let j = 0; j < prevParts.numbers.length - 1; j++) {
        newNumbers[j] = prevParts.numbers[j];
      }
      newSkeleton[i].code = generateSectionCode(prevParts.letter, newNumbers);
    }
  }
  return newSkeleton;
}

function renumberAllSections(skeleton: SkeletonLine[]): SkeletonLine[] {
  const newSkeleton = [...skeleton];
  let letterCounts: Record<string, number> = {};
  for (let i = 0; i < newSkeleton.length; i++) {
    const parts = parseSectionCode(newSkeleton[i].code);
    if (!letterCounts[parts.letter]) letterCounts[parts.letter] = 0;
    letterCounts[parts.letter]++;
    const newNumbers = [letterCounts[parts.letter]];
    for (let j = 1; j < parts.numbers.length; j++) {
      newNumbers.push(parts.numbers[j]);
    }
    newSkeleton[i].code = generateSectionCode(parts.letter, newNumbers);
  }
  return newSkeleton;
}

function deleteSection(skeleton: SkeletonLine[], code: string): SkeletonLine[] {
  const deleteIndex = findSectionIndex(skeleton, code);
  if (deleteIndex === -1) throw new Error(`Section ${code} not found`);
  const newSkeleton = [...skeleton];
  newSkeleton.splice(deleteIndex, 1);
  if (deleteIndex < newSkeleton.length) {
    return renumberFromIndex(newSkeleton, deleteIndex);
  }
  return newSkeleton;
}

function replaceSection(skeleton: SkeletonLine[], code: string, newBody: string): SkeletonLine[] {
  const index = findSectionIndex(skeleton, code);
  if (index === -1) throw new Error(`Section ${code} not found`);
  const newSkeleton = [...skeleton];
  newSkeleton[index] = { ...newSkeleton[index], body: newBody };
  return newSkeleton;
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

function readStorage<T>(key: string, fallback: T): T {
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

// Note: writeLocalState now takes a pin parameter
function writeLocalState(state: Partial<BinderSyncState>, pin?: string) {
  // If no PIN provided, use the active PIN from storage
  const activePin = pin || readStorage<string | null>(ACTIVE_PIN_KEY, null);
  if (!activePin) return;

  const keys = getStorageKeys(activePin);

  if (state.binder !== undefined) {
    window.localStorage.setItem(keys.BINDER_KEY, JSON.stringify(state.binder));
  }
  if (state.todos !== undefined) {
    window.localStorage.setItem(keys.TODO_KEY, JSON.stringify(state.todos));
  }
  if (state.updates !== undefined) {
    window.localStorage.setItem(keys.UPDATES_KEY, JSON.stringify(state.updates));
  }
  if (state.sources !== undefined) {
    window.localStorage.setItem(keys.SOURCE_KEY, JSON.stringify(state.sources));
  }
  if (state.notes !== undefined) {
    window.localStorage.setItem(keys.NOTES_KEY, JSON.stringify(state.notes));
  }
  if (state.tocAnalysis !== undefined) {
    window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify(state.tocAnalysis));
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

// Converts a chunk of markdown (bold, italic, inline code, bullet/numbered
// lists, and pipe tables) into safe HTML for the chat bubbles, which render
// via dangerouslySetInnerHTML. Escapes raw text first so nothing in the
// model's reply (or a pasted binder excerpt) can inject arbitrary HTML.
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatInlineMarkdown(text: string): string {
  // Split on the \u0000-wrapped KaTeX segments so bold/italic/code regexes
  // never run over already-rendered math HTML.
  return text
    .split('\u0000')
    .map((segment, index) =>
      index % 2 === 1
        ? segment // odd indices are rendered LaTeX — pass through untouched
        : segment
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
            .replace(/`([^`]+)`/g, '<code style="background:hsl(var(--muted));padding:1px 5px;border-radius:4px;font-size:0.92em;">$1</code>'),
    )
    .join('');
}

// KaTeX is loaded globally via a <script> tag in index.html (not an npm
// import), so it's typed loosely and guarded in case the CDN script hasn't
// loaded yet.
declare global {
  interface Window {
    katex?: { renderToString: (tex: string, options?: Record<string, unknown>) => string };
  }
}

function renderLatex(tex: string, displayMode: boolean): string {
  if (!window.katex) return escapeHtml(tex); // KaTeX not loaded yet — show raw text instead of crashing.
  try {
    return window.katex.renderToString(tex, { displayMode, throwOnError: false });
  } catch {
    return escapeHtml(tex);
  }
}

// Splits out $$...$$ (block) and $...$ (inline) LaTeX segments, rendering each
// through KaTeX, and returns the line with math replaced by rendered HTML —
// everything else is left as-is for formatInlineMarkdown to handle next.
function extractAndRenderLatex(text: string): string {
  return text
    .replace(/\$\$([^$]+?)\$\$/g, (_match, tex) => `\u0000${renderLatex(tex.trim(), true)}\u0000`)
    .replace(/\$([^$\n]+?)\$/g, (_match, tex) => `\u0000${renderLatex(tex.trim(), false)}\u0000`);
}

function isTableDivider(line: string): boolean {
  return /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?$/.test(line.trim());
}

function parseTableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\||\|$/g, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

function formatChatMarkdown(rawText: string): string {
  const lines = extractAndRenderLatex(escapeHtml(rawText)).split('\n');
  const blocks: string[] = [];
  let i = 0;

  const HEADER_SIZES: Record<number, string> = { 1: '1.3em', 2: '1.15em', 3: '1.05em', 4: '1em' };

  while (i < lines.length) {
    const line = lines[i];

    // Blank line — skip, it just separates blocks.
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Header: #, ##, ###, #### — bigger/bolder text, one line each.
    // Header: #, ##, ###, #### — bigger/bolder text, one line each.
    const headerMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      blocks.push(
        `<div style="font-size:${HEADER_SIZES[level]};font-weight:700;margin:10px 0 4px;line-height:1.3;">${formatInlineMarkdown(headerMatch[2])}</div>`,
      );
      i++;
      continue;
    }

    // Horizontal rule: a line that's just ---, ***, or ___ (3+ chars, same symbol).
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(line.trim())) {
      blocks.push(`<hr style="border:none;border-top:1px solid hsl(var(--border));margin:10px 0;" />`);
      i++;
      continue;
    }

    // Table: a row of |cells| immediately followed by a |---|---| divider row.
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const headerCells = parseTableCells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(parseTableCells(lines[i]));
        i++;
      }
      const thead = `<tr>${headerCells.map((c) => `<th style="text-align:left;padding:5px 10px;border-bottom:2px solid hsl(var(--border));white-space:nowrap;">${formatInlineMarkdown(c)}</th>`).join('')}</tr>`;
      const tbody = rows
        .map((row) => `<tr>${row.map((c) => `<td style="padding:5px 10px;border-bottom:1px solid hsl(var(--border));">${formatInlineMarkdown(c)}</td>`).join('')}</tr>`)
        .join('');
      blocks.push(`<div style="overflow-x:auto;margin:6px 0;"><table style="border-collapse:collapse;font-size:0.95em;width:100%;">${thead}${tbody}</table></div>`);
      continue;
    }

    // Bullet list: consecutive lines starting with - or *
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''));
        i++;
      }
      blocks.push(`<ul style="margin:4px 0;padding-left:20px;">${items.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join('')}</ul>`);
      continue;
    }

    // Numbered list: consecutive lines starting with "1. ", "2. ", etc.
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(`<ol style="margin:4px 0;padding-left:20px;">${items.map((item) => `<li>${formatInlineMarkdown(item)}</li>`).join('')}</ol>`);
      continue;
    }

    // Otherwise: a plain paragraph line — join consecutive non-blank, non-block
    // lines together with <br>, so single newlines inside a paragraph still wrap.
    const paragraphLines: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^#{1,4}\s+/.test(lines[i]) &&
        !/^(-{3,}|\*{3,}|_{3,})$/.test(lines[i].trim()) &&
        !/^[-*]\s+/.test(lines[i]) &&
        !/^\d+\.\s+/.test(lines[i]) &&
        !(lines[i].includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1]))
      ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push(`<p style="margin:4px 0;">${paragraphLines.map(formatInlineMarkdown).join('<br>')}</p>`);
  }

  return blocks.join('');
}
// ============================================
// PIN SYSTEM FUNCTIONS
// ============================================

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

function pushPinState(pin: string, state: BinderSyncState, onSettled: (ok: boolean) => void) {
  fetch(`/api/binder-sync/${pin}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  })
    .then((response) => onSettled(response.ok))
    .catch(() => onSettled(false));
}

// ============================================
// CHAT COMPONENT
// ============================================

function ChatInterface({ 
  messages, 
  onSendMessage, 
  onClearThread, 
  isThinking,
  onSectionClick,
  tocAnalysis,
  askForInsights,
}: { 
  messages: ChatMessage[]; 
  onSendMessage: (message: string, subject?: string) => void; 
  onClearThread: () => void;
  isThinking: boolean;
  onSectionClick?: (sectionLabel: string) => void;
  tocAnalysis?: TocAnalysis | null;
  askForInsights?: () => void;
}) {
  const [input, setInput] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Ticks every 100ms only while a cooldown is actually active, to drive the
  // progress bar without a timer running constantly in the background.
  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const interval = window.setInterval(() => setNow(Date.now()), 100);
    return () => window.clearInterval(interval);
  }, [cooldownUntil]);

  const cooldownRemainingMs = Math.max(0, cooldownUntil - now);
  const isCoolingDown = cooldownRemainingMs > 0;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isThinking || isCoolingDown) return;
    onSendMessage(trimmed, selectedSubject || undefined);
    setInput('');
    setSelectedSubject('');
    setCooldownUntil(Date.now() + CHAT_COOLDOWN_MS);
    setNow(Date.now());
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  const getProblemSections = () => {
    if (!tocAnalysis) return [];
    const problemNodes: TocNode[] = [];
    const traverse = (nodes: TocNode[]) => {
      for (const node of nodes) {
        if (node.status === 'partial' || node.status === 'missing') {
          problemNodes.push(node);
        }
        if (node.children.length > 0) traverse(node.children);
      }
    };
    traverse(tocAnalysis.nodes);
    return problemNodes.slice(0, 8);
  };

  const problemSections = getProblemSections();

  return (
    <div className="chat-container" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '500px',
      maxHeight: '600px',
      background: 'hsl(var(--card) / 0.5)',
      borderRadius: '20px',
      border: '1px solid hsl(var(--card-border))',
      overflow: 'hidden',
    }}>
      {/* Chat Header */}
      <div className="chat-header" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 14px',
        borderBottom: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card) / 0.8)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MessageSquare size={16} style={{ color: 'hsl(var(--primary))' }} />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Research Chat</span>
          {messages.length > 0 && (
            <span style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
              {messages.length} messages
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {askForInsights && (
            <button
              className="outline-button"
              style={{ padding: '4px 10px', fontSize: '10px' }}
              onClick={askForInsights}
              title="Get AI suggestions for your binder"
            >
              <WandSparkles size={12} /> Insights
            </button>
          )}
          {messages.length > 0 && (
            <button
              className="outline-button"
              style={{ padding: '4px 10px', fontSize: '10px' }}
              onClick={onClearThread}
            >
              <X size={12} /> New Thread
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages" style={{
        flex: 1,
        overflowY: 'auto',
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        minHeight: '200px',
      }}>
        {messages.length === 0 ? (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'hsl(var(--muted-foreground))',
            textAlign: 'center',
            padding: '20px',
          }}>
            <Sparkles size={28} style={{ color: 'hsl(var(--primary) / 0.3)', marginBottom: '12px' }} />
            <p style={{ fontSize: '13px', margin: 0 }}>Ask a question about Dynamic Planet</p>
            <p style={{ fontSize: '11px', margin: '4px 0 0', opacity: 0.6 }}>Follow-ups and clarifications are welcome!</p>

            {problemSections.length > 0 && (
              <div style={{ marginTop: '12px', width: '100%' }}>
                <p style={{ fontSize: '10px', margin: '0 0 6px 0', opacity: 0.5 }}>Click a section for an overview:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'center' }}>
                  {problemSections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => onSectionClick?.(section.label)}
                      style={{
                        padding: '3px 10px',
                        borderRadius: '99px',
                        fontSize: '10px',
                        border: '1px solid',
                        borderColor: section.status === 'missing' ? 'hsl(var(--destructive) / 0.3)' : 'hsl(var(--accent) / 0.3)',
                        background: section.status === 'missing' ? 'hsl(var(--destructive) / 0.06)' : 'hsl(var(--accent) / 0.06)',
                        color: section.status === 'missing' ? 'hsl(var(--destructive))' : 'hsl(var(--accent))',
                        cursor: 'pointer',
                      }}
                    >
                      {section.status === 'missing' ? '🔴' : '🟡'} {section.label.replace(/^[A-Z0-9. ]+/, '').trim() || section.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                padding: '8px 14px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' 
                  ? 'hsl(var(--primary))' 
                  : 'hsl(var(--muted))',
                color: msg.role === 'user' 
                  ? 'hsl(var(--primary-foreground))' 
                  : 'hsl(var(--foreground))',
                fontSize: '13px',
                lineHeight: '1.6',
                wordBreak: 'break-word',
                maxWidth: '100%',
              }}>
                {msg.isThinking ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="thinking-dot">●</span>
                    <span style={{ opacity: 0.7 }}>Thinking...</span>
                  </span>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: formatChatMarkdown(msg.content) }} />
                )}
              </div>
              <div style={{
                fontSize: '9px',
                color: 'hsl(var(--muted-foreground))',
                marginTop: '2px',
                padding: '0 4px',
                opacity: 0.5,
              }}>
                {msg.role === 'user' ? 'You' : 'Groq'} · {formatTime(msg.timestamp)}
                {msg.subject && msg.role === 'user' && ` · ${msg.subject}`}
              </div>
            </div>
          ))
        )}
        {isThinking && messages[messages.length - 1]?.role !== 'assistant' && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            maxWidth: '85%',
            alignSelf: 'flex-start',
          }}>
            <div style={{
              padding: '8px 14px',
              borderRadius: '16px 16px 16px 4px',
              background: 'hsl(var(--muted))',
              color: 'hsl(var(--foreground))',
              fontSize: '13px',
              lineHeight: '1.6',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span className="thinking-dot">●</span>
                <span style={{ opacity: 0.7 }}>Groq is thinking...</span>
              </span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="chat-input-area" style={{
        padding: '8px 14px',
        borderTop: '1px solid hsl(var(--border))',
        background: 'hsl(var(--card) / 0.8)',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isThinking ? "Waiting for response..." : "Ask a follow-up..."}
              disabled={isThinking}
              rows={1}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid hsl(var(--input))',
                borderRadius: '12px',
                background: 'hsl(var(--background))',
                color: 'hsl(var(--foreground))',
                fontSize: '12px',
                resize: 'none',
                outline: 'none',
                minHeight: '36px',
                maxHeight: '100px',
                fontFamily: 'inherit',
              }}
            />
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              <select
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                style={{
                  padding: '2px 6px',
                  fontSize: '9px',
                  border: '1px solid hsl(var(--input))',
                  borderRadius: '6px',
                  background: 'hsl(var(--background))',
                  color: 'hsl(var(--foreground))',
                  outline: 'none',
                  maxWidth: '140px',
                }}
              >
                <option value="">Subject (optional)</option>
                <option value="Dynamic Planet — Division B">Dynamic Planet</option>
                <option value="Anatomy and Physiology">Anatomy</option>
                <option value="Biology">Biology</option>
                <option value="Chemistry">Chemistry</option>
                <option value="Earth and Space Science">Earth/Space</option>
                <option value="Environmental Science">Environmental</option>
                <option value="Physics">Physics</option>
              </select>
            </div>
          </div>
      <button
        type="submit"
        disabled={!input.trim() || isThinking || isCoolingDown}
        style={{
          padding: '8px 14px',
          borderRadius: '12px',
          border: 'none',
          background: input.trim() && !isThinking && !isCoolingDown ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
          color: input.trim() && !isThinking && !isCoolingDown ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
          cursor: input.trim() && !isThinking && !isCoolingDown ? 'pointer' : 'default',
          flexShrink: 0,
          height: '36px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Send size={14} />
      </button>
      </form>
      {isCoolingDown ? (
      <div style={{ marginTop: '6px' }}>
        <div style={{ height: '3px', background: 'hsl(var(--muted))', borderRadius: '99px', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${(cooldownRemainingMs / CHAT_COOLDOWN_MS) * 100}%`,
              background: 'hsl(var(--accent))',
              borderRadius: '99px',
              transition: 'width 0.1s linear',
            }}
          />
        </div>
        <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', marginTop: '3px', opacity: 0.6, textAlign: 'right' }}>
          Next question in {Math.ceil(cooldownRemainingMs / 1000)}s — pacing for Groq's rate limit
        </div>
      </div>
      ) : (
      <div style={{ fontSize: '8px', color: 'hsl(var(--muted-foreground))', marginTop: '4px', opacity: 0.4, textAlign: 'right' }}>
        Shift+Enter for new line
      </div>
      )}
      </div>
    </div>
  );
}

// ============================================
// SECTION MANAGER COMPONENT
// ============================================

function SectionManager({ 
  tocAnalysis, 
  onUpdateToc,
  onReevaluate,
}: { 
  tocAnalysis: TocAnalysis | null; 
  onUpdateToc: (newToc: TocAnalysis) => void;
  onReevaluate: (code: string, content?: string) => void;
}) {
  // ... state for modals, etc. (same as before)

  // Helper: flatten TOC nodes to a list with depth info
  const flattenToc = (nodes: TocNode[], depth: number = 0): { node: TocNode; depth: number; }[] => {
    let result: { node: TocNode; depth: number }[] = [];
    for (const node of nodes) {
      result.push({ node, depth });
      if (node.children.length > 0) {
        result = result.concat(flattenToc(node.children, depth + 1));
      }
    }
    return result;
  };

  const flatList = tocAnalysis ? flattenToc(tocAnalysis.nodes) : [];

  // Insert a new section after a given node
  const insertSectionInToc = (afterCode: string | null, title: string, body: string = ''): TocNode[] => {
    if (!tocAnalysis) return [];
    // Deep clone nodes
    const newNodes = JSON.parse(JSON.stringify(tocAnalysis.nodes)) as TocNode[];
    
    // Helper to find a node and its parent path
    const findNodeAndPath = (nodes: TocNode[], code: string): { node: TocNode; path: number[] } | null => {
      for (let i = 0; i < nodes.length; i++) {
        if (nodes[i].id === code) return { node: nodes[i], path: [i] };
        if (nodes[i].children.length > 0) {
          const result = findNodeAndPath(nodes[i].children, code);
          if (result) return { node: result.node, path: [i, ...result.path] };
        }
      }
      return null;
    };

    // Generate new code
    let newCode: string;
    let parentNodes: TocNode[];
    let insertIndex: number;
    let depth: number;

    if (!afterCode) {
      // Insert at beginning
      const firstNode = newNodes[0];
      if (firstNode) {
        const parts = parseSectionCode(firstNode.id);
        newCode = generateSectionCode(parts.letter, [1]);
        parentNodes = newNodes;
        insertIndex = 0;
        depth = 1;
      } else {
        // Empty TOC – just create A1
        newCode = 'A1';
        parentNodes = newNodes;
        insertIndex = 0;
        depth = 1;
      }
    } else {
      const found = findNodeAndPath(newNodes, afterCode);
      if (!found) throw new Error(`Section ${afterCode} not found`);
      const node = found.node;
      const path = found.path;
      const parts = parseSectionCode(node.id);
      // Increment last number
      const newNumbers = [...parts.numbers];
      newNumbers[newNumbers.length - 1]++;
      newCode = generateSectionCode(parts.letter, newNumbers);
      // Determine parent: if node has children, we insert as first child? Usually we insert as sibling after the node.
      // We'll insert as sibling at the same level.
      // Navigate to parent: if path.length > 1, parent is at path.slice(0, -1)
      let parent: TocNode[] = newNodes;
      for (let i = 0; i < path.length - 1; i++) {
        parent = parent[path[i]].children;
      }
      const siblingIndex = path[path.length - 1];
      parentNodes = parent;
      insertIndex = siblingIndex + 1;
      depth = node.level === 'section' ? 1 : node.level === 'subsection' ? 2 : 3;
    }

    // Create new node
    const newNode: TocNode = {
      id: newCode,
      label: `${newCode}. ${title}`,
      level: depth === 1 ? 'section' : depth === 2 ? 'subsection' : 'subsubsection',
      status: 'partial',
      description: body || 'New section – add content',
      suggestion: 'Add content and re-analyze',
      missingSubtopics: [],
      children: [],
    };

    // Insert
    parentNodes.splice(insertIndex, 0, newNode);

    // Now renumber all sibling nodes after the insertion point at the same depth
    // (We need to renumber the codes of all nodes that are at the same depth and after)
    const renumberSiblings = (nodes: TocNode[], startIndex: number, baseCode: string) => {
      const baseParts = parseSectionCode(baseCode);
      for (let i = startIndex; i < nodes.length; i++) {
        const node = nodes[i];
        const parts = parseSectionCode(node.id);
        if (parts.letter === baseParts.letter && parts.numbers.length === baseParts.numbers.length) {
          // renumber this node and its descendants? Only the top-level code matters for siblings.
          const newNumbers = [...baseParts.numbers];
          newNumbers[newNumbers.length - 1] = (i - startIndex) + 1;
          // But we need to keep higher-level numbers from the original
          // Actually we should base on the first node's numbers, but we want sequential numbers.
          // Simpler: we'll just regenerate from the first node's numbers plus offset.
          const firstParts = parseSectionCode(nodes[startIndex].id);
          const newNum = [...firstParts.numbers];
          newNum[newNum.length - 1] = (i - startIndex) + 1;
          node.id = generateSectionCode(parts.letter, newNum);
          // Update label too
          node.label = `${node.id} ${node.label.replace(/^[A-Z0-9. ]+/, '').trim()}`;
        }
      }
    };

    // Renumber siblings after insertion point
    renumberSiblings(parentNodes, insertIndex, newCode);

    // Update summary and return
    const flattened = flattenToc(newNodes);
    const summary = {
      total: flattened.length,
      complete: flattened.filter(n => n.node.status === 'complete').length,
      partial: flattened.filter(n => n.node.status === 'partial').length,
      missing: flattened.filter(n => n.node.status === 'missing').length,
    };
    onUpdateToc({ nodes: newNodes, summary });
    return newNodes;
  };

  // Similarly, implement delete and replace using similar logic (omitted for brevity, but you can adapt)

  // In the UI, use flatList to display sections with indentation based on depth.
  // Use the same Add/Delete/Replace modals, but they call these new functions.
}

// ============================================
// TOC SIDEBAR COMPONENT (for Research tab)
// ============================================

function TocSidebar({ toc, onNodeHover, hoveredNode, onSectionClick, isFullSize = false, onReevaluate, isReevaluating, reevaluateTarget }: { 
  toc: TocAnalysis; 
  onNodeHover: (node: TocNode | null) => void;
  hoveredNode: TocNode | null;
  onSectionClick?: (sectionLabel: string) => void;
  isFullSize?: boolean;
  onReevaluate?: (sectionCode: string, content?: string) => void;
  isReevaluating?: boolean;
  reevaluateTarget?: string | null;
}) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['root']));
  const [isTooltipHovered, setIsTooltipHovered] = useState(false);
  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
      case 'partial': return '🟡';
      case 'missing': return '🔴';
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

  const handleNodeClick = (node: TocNode) => {
    if (onSectionClick) {
      onSectionClick(node.label);
    }
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
            position: 'relative',
          }}
          onMouseEnter={() => {
            // Clear any pending close timeout
            if (closeTimeoutRef.current) {
              clearTimeout(closeTimeoutRef.current);
              closeTimeoutRef.current = null;
            }
            onNodeHover(node);
          }}
          onMouseLeave={() => {
            // Don't close immediately - wait to see if mouse goes to tooltip
            closeTimeoutRef.current = setTimeout(() => {
              // Only close if the mouse is not hovering the tooltip
              if (!isTooltipHovered) {
                onNodeHover(null);
              }
              closeTimeoutRef.current = null;
            }, 400);
          }}
          onClick={() => handleNodeClick(node)}
        >
          <div className="flex items-center gap-2 py-1.5 px-2 text-sm">
            <span>{emoji}</span>
            <span className="flex-1 truncate">{node.label}</span>
            {celebration && <span className="text-xs animate-pulse">{celebration}</span>}
            {node.status !== 'complete' && (
              <span style={{
                fontSize: '9px',
                padding: '1px 8px',
                borderRadius: '12px',
                background: node.status === 'partial' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                color: node.status === 'partial' ? '#eab308' : '#ef4444',
                whiteSpace: 'nowrap',
              }}>
                {node.status === 'partial' ? '⚠️ Has gaps' : '❌ Missing'}
              </span>
            )}
            {/* Re-evaluate button */}
            {isReevaluating && reevaluateTarget === node.id ? (
              <span style={{
                fontSize: '9px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: 'hsl(var(--accent) / 0.15)',
                color: 'hsl(var(--accent))',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}>
                <span className="thinking-dot" style={{ fontSize: '6px' }}>●</span>
                Analyzing...
              </span>
            ) : (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onReevaluate) {
                        // Extract the code from the label - handles "A.", "A1.", "A1.1.", etc.
                        let codeToUse = node.id;
                        const codeMatch = node.label.match(/^([A-Z][0-9.]*)/);
                        if (codeMatch) {
                          codeToUse = codeMatch[1];
                          // Keep the trailing dot if it exists (e.g., "A." -> "A.", "A1." -> "A1.")
                          // But remove trailing dot for top-level sections that might be stored as "A"
                          // Let's keep it as-is since the reevaluate function will handle all variations
                        }
                        console.log('🔍 Re-evaluate clicked for:', node.label, '-> extracted code:', codeToUse);
                        onReevaluate(codeToUse);
                      }
                    }}
                style={{
                  fontSize: '10px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  border: '1px solid hsl(var(--border))',
                  background: 'transparent',
                  color: 'hsl(var(--muted-foreground))',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--primary) / 0.1)';
                  e.currentTarget.style.borderColor = 'hsl(var(--primary))';
                  e.currentTarget.style.color = 'hsl(var(--primary))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent';
                  e.currentTarget.style.borderColor = 'hsl(var(--border))';
                  e.currentTarget.style.color = 'hsl(var(--muted-foreground))';
                }}
                title="Re-evaluate this section with Groq"
              >
                🔄
              </button>
            )}
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
      position: 'relative',
      maxHeight: isFullSize ? '600px' : 'calc(100vh - 120px)',
      overflowY: 'auto',
      padding: isFullSize ? '0' : '16px 12px',
      background: isFullSize ? 'transparent' : 'hsl(var(--card) / 0.6)',
      borderRadius: isFullSize ? '0' : '20px',
      border: isFullSize ? 'none' : '1px solid hsl(var(--card-border))',
      backdropFilter: isFullSize ? 'none' : 'blur(10px)',
    }}>
      {!isFullSize && (
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
          <div style={{ fontSize: '9px', color: 'hsl(var(--muted-foreground))', marginTop: '4px', opacity: 0.6 }}>
            Click any section to ask about it
          </div>
        </div>
      )}

      <div className="toc-tree">
        {toc.nodes.map(node => renderNode(node, 0))}
      </div>

      {/* Tooltip Popup - shows when hovering over a section in the Binder tab */}
      {/* Tooltip Popup - shows when hovering over a section in the Binder tab */}
      {/* Tooltip Popup - shows when hovering over a section in the Binder tab */}
      {hoveredNode && hoveredNode.status !== 'complete' && isFullSize && (
          <div 
            className="toc-tooltip" 
            style={{
              position: 'fixed',
              top: '50%',
              right: '40px',
              transform: 'translateY(-50%)',
              maxWidth: '380px',
              width: '100%',
              padding: '16px 20px',
              background: 'hsl(var(--card))',
              borderRadius: '16px',
              border: '1px solid hsl(var(--card-border))',
              boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
              zIndex: 1000,
              backdropFilter: 'blur(20px)',
            }}
            onMouseEnter={() => {
              // Clear any pending close timeout
              if (closeTimeoutRef.current) {
                clearTimeout(closeTimeoutRef.current);
                closeTimeoutRef.current = null;
              }
              setIsTooltipHovered(true);
            }}
            onMouseLeave={() => {
              setIsTooltipHovered(false);
              // Close the tooltip after a short delay when leaving
              closeTimeoutRef.current = setTimeout(() => {
                onNodeHover(null);
                closeTimeoutRef.current = null;
              }, 200);
            }}
          >
          <div className="flex items-start gap-3">
            <span className="text-2xl">
              {hoveredNode.status === 'partial' ? '📝' : '🔍'}
            </span>
            <div>
              <div className="font-semibold text-sm">{hoveredNode.label}</div>
              {hoveredNode.status === 'partial' && hoveredNode.missingSubtopics && hoveredNode.missingSubtopics.length > 0 && (
                <div className="text-xs mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  <div className="font-semibold text-yellow-700 dark:text-yellow-300">Missing subtopics:</div>
                  <ul className="list-disc pl-4 mt-1">
                    {hoveredNode.missingSubtopics.map((topic, idx) => (
                      <li key={idx}>{topic}</li>
                    ))}
                  </ul>
                </div>
              )}
              {hoveredNode.suggestion && (
                <div className="text-xs mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-md">
                  💡 {hoveredNode.suggestion}
                </div>
              )}

              {/* Re-evaluate button inside tooltip */}
              <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (onReevaluate) {
                      let codeToUse = hoveredNode.id;
                      const codeMatch = hoveredNode.label.match(/^([A-Z][0-9.]*)/);
                      if (codeMatch) {
                        codeToUse = codeMatch[1];
                        codeToUse = codeToUse.replace(/\.$/, '');
                      }
                      // ============================================
                      // PASS THE BINDER CONTENT TO GROQ
                      // ============================================
                      const content = hoveredNode.description || '';
                      console.log('🔍 Re-evaluate from tooltip:', {
                        label: hoveredNode.label,
                        code: codeToUse,
                        contentLength: content.length,
                        contentPreview: content.slice(0, 200)
                      });
                      // Pass both the code and the content
                      onReevaluate(codeToUse, content);
                      setTimeout(() => {
                        onNodeHover(null);
                      }, 500);
                    }
                  }}
                style={{
                  marginTop: '10px',
                  fontSize: '11px',
                  padding: '5px 14px',
                  borderRadius: '12px',
                  border: 'none',
                  background: 'hsl(var(--primary))',
                  color: 'hsl(var(--primary-foreground))',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  fontWeight: 500,
                  width: '100%',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--primary-dark))';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'hsl(var(--primary))';
                }}
              >
                🔄 Re-evaluate this section
              </button>
            </div>
          </div>
          {/* Close button */}
          <button
            onClick={() => {
              if (window.tooltipTimeout) {
                clearTimeout(window.tooltipTimeout);
                window.tooltipTimeout = null;
              }
              onNodeHover(null);
            }}
            style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              background: 'none',
              border: 'none',
              color: 'hsl(var(--muted-foreground))',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
// ============================================
// PIN GATE COMPONENTS
// ============================================

function PinGate() {
  const [pin, setPin] = useState<string | null>(() => readStorage<string | null>(ACTIVE_PIN_KEY, null));

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
    writeLocalState(result.state, trimmed);
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

// ============================================
// SETUP SCREEN COMPONENTS
// ============================================
function BinderSetup({ onComplete, initialValue = '', theme }: { 
  onComplete: (binder: string) => void; 
  initialValue?: string;
  theme?: ThemeColors;
}) {
  const [binder, setBinder] = useState(initialValue);
  const [message, setMessage] = useState('');
  const isAnalyzing = false;

  const safeTheme = theme || themes.blue;

  const saveBinder = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (binder.trim().length < 20) {
      setMessage('Add the contents of your binder so Project Dynamic has enough context to help.');
      return;
    }
    // Get the PIN from localStorage
    const pin = readStorage<string | null>(ACTIVE_PIN_KEY, null);
    if (pin) {
      const keys = getStorageKeys(pin);
      window.localStorage.setItem(keys.BINDER_KEY, JSON.stringify(binder.trim()));
    }
    onComplete(binder.trim());
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'grid',
      alignContent: 'center',
      justifyItems: 'start',
      maxWidth: '760px',
      margin: '0 auto',
      padding: '48px 24px',
      background: safeTheme.background || '#e8f0fe',
      color: safeTheme.text || '#1a2a4a',
      width: '100%',
    }}>
      {/* Setup Mark */}
      <div style={{
        width: '48px',
        height: '48px',
        display: 'grid',
        placeItems: 'center',
        marginBottom: '28px',
        border: `2px solid ${safeTheme.primary}`,
        borderRadius: '24px 24px 24px 6px',
        color: safeTheme.primary,
        background: safeTheme.cardBg || '#f0f7ff',
        boxShadow: `0 10px 30px ${safeTheme.primary}20`,
      }}>
        <FlaskConical size={22} />
      </div>

      {/* Eyebrow */}
      <div style={{ 
        color: safeTheme.primary,
        fontFamily: 'var(--app-font-mono)',
        fontSize: '10px',
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: '4px',
      }}>Project Dynamic / Setup</div>

      {/* Heading */}
      <h1 style={{
        margin: '12px 0 17px',
        font: '600 clamp(42px, 7vw, 76px)/.97 Georgia, serif',
        letterSpacing: '-0.045em',
        color: safeTheme.text || '#1a2a4a',
        marginTop: '4px',
        lineHeight: '1.1',
      }}>
        Bring your binder<br /><em style={{ color: safeTheme.primary, fontStyle: 'normal' }}>to the table.</em>
      </h1>

      {/* Description */}
      <p style={{
        maxWidth: '590px',
        margin: '0 0 12px 0',
        color: safeTheme.mutedText || '#5a7a9a',
        fontSize: '15px',
        lineHeight: '1.7',
      }}>
        Before the workspace opens, paste or describe your entire Dynamic Planet binder. Project Dynamic uses this as your map so its suggestions build on what you actually have.
      </p>

      {/* Credits */}
      <div style={{
        marginTop: '8px',
        marginBottom: '12px',
        padding: '16px 20px',
        background: `${safeTheme.primary}10`,
        borderRadius: '16px',
        border: `1px solid ${safeTheme.primary}25`,
        width: '100%',
        maxWidth: '650px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: '12px', color: safeTheme.mutedText || '#5a7a9a', margin: 0, lineHeight: '1.6' }}>
          Built with 💙 by{' '}
          <strong style={{ color: safeTheme.primary }}>DeepSeek</strong>
          {' '}·{' '}
          <strong style={{ color: safeTheme.primary }}>Agent from Replit</strong>
          {' '}· and{' '}
          <strong style={{ color: safeTheme.primary }}>you</strong> 🚀
        </p>
        <p style={{ fontSize: '10px', color: `${safeTheme.mutedText || '#5a7a9a'}99`, margin: '4px 0 0' }}>
          Special thanks to the Science Olympiad community
        </p>
      </div>

      {/* Form */}
      <form onSubmit={saveBinder} style={{
        width: 'min(100%, 650px)',
        marginTop: '8px',
        padding: '24px',
        border: `2px solid ${safeTheme.border || '#c5d9f0'}`,
        borderRadius: '28px',
        background: safeTheme.cardBg || '#f0f7ff',
        boxShadow: `0 12px 30px ${safeTheme.primary}15`,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        <label htmlFor="binder-inventory" style={{
          color: safeTheme.mutedText || '#5a7a9a',
          fontSize: '11px',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          fontFamily: 'var(--app-font-mono)',
        }}>
          Your complete binder inventory
        </label>
        <textarea 
          id="binder-inventory" 
          value={binder} 
          onChange={(event) => { setBinder(event.target.value); setMessage(''); }} 
          placeholder="Paste your entire binder content here..." 
          data-testid="input-binder-inventory" 
          disabled={isAnalyzing}
          style={{
            display: 'block',
            width: '100%',
            minHeight: '200px',
            padding: '13px',
            resize: 'vertical',
            border: `2px solid ${safeTheme.border || '#c5d9f0'}`,
            borderRadius: '16px',
            outline: 'none',
            background: safeTheme.background || '#e8f0fe',
            color: safeTheme.text || '#1a2a4a',
            fontSize: '14px',
            lineHeight: '1.55',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = safeTheme.primary;
            e.currentTarget.style.boxShadow = `0 0 0 4px ${safeTheme.primary}25`;
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = safeTheme.border || '#c5d9f0';
            e.currentTarget.style.boxShadow = 'none';
          }}
        />
        {message && <div style={{
          marginTop: '4px',
          color: '#ef4444',
          fontSize: '12px',
        }}>{message}</div>}

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={isAnalyzing} 
          data-testid="button-open-project-dynamic"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '9px',
            background: safeTheme.primary,
            color: '#fff',
            borderRadius: '16px',
            padding: '12px 17px',
            fontSize: '12px',
            fontWeight: 700,
            border: 'none',
            cursor: 'pointer',
            transition: 'transform 0.2s ease, background 0.2s ease, box-shadow 0.2s ease',
            width: '100%',
            marginTop: '4px',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = safeTheme.primaryDark;
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = `0 6px 24px ${safeTheme.primary}40`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = safeTheme.primary;
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = 'none';
          }}
        >
          {isAnalyzing ? '🔍 Analyzing...' : <><BookOpen size={15} /> Open Project Dynamic</>}
        </button>
      </form>

      {/* Note */}
      <div style={{
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-start',
        maxWidth: '570px',
        marginTop: '17px',
        color: safeTheme.mutedText || '#5a7a9a',
        fontSize: '11px',
        lineHeight: '1.5',
      }}>
        <Info size={14} style={{ color: safeTheme.primary, flexShrink: 0, marginTop: '1px' }} />
        <span>Your binder inventory stays in this browser and is sent to Groq only when you ask for research or plan updates.</span>
      </div>
    </div>
  );
}

function SkeletonReview({ lines, onApprove, onEdit, isAnalyzing }: { lines: SkeletonLine[]; onApprove: () => void; onEdit: () => void; isAnalyzing: boolean }) {
  return (
    <div className="setup-screen">
      <div className="setup-mark"><FlaskConical size={22} /></div>
      <div className="eyebrow" style={{ color: 'hsl(var(--accent))' }}>Project Dynamic / Structure check</div>
      <h1>Does this<br /><em>look right?</em></h1>
      <p className="setup-copy">This is just the shape of your binder — codes and titles, no content review yet. Confirm it before Groq reads everything else.</p>

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
      <p className="setup-copy">{message || 'Groq is matching your notes to each section...'}</p>
      <div style={{ width: '100%', maxWidth: '420px', height: '6px', background: 'hsl(var(--muted))', borderRadius: '99px', overflow: 'hidden', marginTop: '20px' }}>
        <div style={{ height: '100%', width: `${progress}%`, background: 'hsl(var(--primary))', borderRadius: '99px', transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

// ============================================
// MAIN HOME COMPONENT
// ============================================

function Home({ pin, onForgetPin }: { pin: string; onForgetPin: () => void }) {
  // ============================================
  // STATE
  // ============================================

  const [activeTab, setActiveTab] = useState<'research' | 'binder' | 'notes' | 'settings'>('research');

  // Chat state
  // Chat state
  // Chat state
  const keys = getStorageKeys(pin);

  // Chat state - use PIN-specific key
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => {
    const stored = readStorage<ChatMessage[]>(keys.CHAT_KEY, []);
    return stored.map(msg => ({
      ...msg,
      timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date()
    }));
  });
  //const [isChatThinking, setIsChatThinking] = useState(false);
  const [isChatThinking, setIsChatThinking] = useState(false);

  // Binder state - use PIN-specific keys
  const [binder, setBinder] = useState(() => readStorage<string>(keys.BINDER_KEY, ''));
  const [skeletonLines, setSkeletonLines] = useState<SkeletonLine[]>([]);
  const [tocAnalysis, setTocAnalysis] = useState<TocAnalysis | null>(() => 
    readStorage<TocAnalysis | null>(keys.TOC_ANALYSIS_KEY, null)
  );
  const [gapAnalysis, setGapAnalysis] = useState<GapAnalysis[]>([]);
  const [hoveredNode, setHoveredNode] = useState<TocNode | null>(null);
  const [editingBinder, setEditingBinder] = useState(false);
  const [stage, setStage] = useState<'review' | 'analyzing' | 'ready'>('ready');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const [isReevaluating, setIsReevaluating] = useState(false);
  const [reevaluateTarget, setReevaluateTarget] = useState<string | null>(null);
  const [showSectionManager, setShowSectionManager] = useState(false);

  // Notes state - use PIN-specific keys
  const [sources, setSources] = useState<Source[]>(() => readStorage<Source[]>(keys.SOURCE_KEY, []));
  const [notes, setNotes] = useState<SavedNote[]>(() => readStorage<SavedNote[]>(keys.NOTES_KEY, []));
  const [todos, setTodos] = useState<Todo[]>(() => readStorage<Todo[]>(keys.TODO_KEY, []));
  const [updates, setUpdates] = useState<BinderUpdate[]>(() => readStorage<BinderUpdate[]>(keys.UPDATES_KEY, []));
  const [feedback, setFeedback] = useState('');
  const [insightFocus, setInsightFocus] = useState('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const [isResettingBinder, setIsResettingBinder] = useState(false);
  const [sourceUrl, setSourceUrl] = useState('');
  const [newTodo, setNewTodo] = useState('');
  const [updateSection, setUpdateSection] = useState('');
  const [updateText, setUpdateText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationMessage, setValidationMessage] = useState('');

  // Color theme state
  const [colorTheme, setColorTheme] = useState(() => {
    const stored = readStorage<string>('project-dynamic-theme', 'blue');
    return stored;
  });
  const currentTheme = themes[colorTheme] || themes.blue;

  // Groq hooks
  const askResearch = useAskGeminiResearch();
  const updateBinderPlan = useUpdateGeminiBinderPlan();
  const analyzeBinderStructure = useAnalyzeBinderStructure();

  const hasHydratedRef = useRef(true);

  // ============================================
  // EFFECTS
  // ============================================

  // Get PIN-specific keys inside useEffect
  useEffect(() => {
    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.CHAT_KEY, JSON.stringify(chatMessages));
  }, [chatMessages, pin]);

  useEffect(() => {
    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.SOURCE_KEY, JSON.stringify(sources));
  }, [sources, pin]);

  useEffect(() => {
    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.NOTES_KEY, JSON.stringify(notes));
  }, [notes, pin]);

  useEffect(() => {
    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.TODO_KEY, JSON.stringify(todos));
  }, [todos, pin]);

  useEffect(() => {
    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.UPDATES_KEY, JSON.stringify(updates));
  }, [updates, pin]);

  useEffect(() => {
    const savedTheme = readStorage<string>('project-dynamic-theme', 'blue');
    document.documentElement.setAttribute('data-theme', savedTheme);
    setColorTheme(savedTheme);
  }, []);

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
  }, [pin, binder, todos, updates, sources, notes, tocAnalysis]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = window.setTimeout(() => setFeedback(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [feedback]);

  // ============================================
  // CHAT FUNCTIONS
  // ============================================

  const sendChatMessage = (message: string, subject?: string) => {
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: message,
      timestamp: new Date(),
      subject: subject,
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setIsChatThinking(true);

    const thinkingId = `thinking-${Date.now()}`;
    setChatMessages((prev) => [...prev, {
      id: thinkingId,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isThinking: true,
    }]);

    const recentMessages = chatMessages.slice(-8);
    const context = recentMessages.map(m => `${m.role}: ${m.content}`).join('\n');

    let skeletonContext = '';

    if (skeletonLines.length > 0) {
      const sectionTitles = skeletonLines.map(line => 
        `${line.code}: ${line.title}`
      ).join('\n');
      skeletonContext = `Binder Structure (sections only, no content):\n${sectionTitles}`;
    }

    if (gapAnalysis.length > 0) {
      const gapSummary = gapAnalysis
        .filter(g => g.status !== 'complete')
        .map(g => `- ${g.topic}: ${g.suggestion}`)
        .join('\n');
      skeletonContext += `\n\nGaps identified:\n${gapSummary}`;
    }

    if (!skeletonContext && binder.length > 0) {
      skeletonContext = `Binder preview (first 500 chars):\n${binder.slice(0, 500)}...`;
    }

      askResearch.mutate(
        {
          data: {
            question: message,
            ...(subject ? { subject } : {}),
            context: skeletonContext || 'No binder context available.', // CHANGE: use 'context' not 'binderContext'
            // context: context ? `Previous conversation:\n${context}` : '', // This is also 'context'
          },
        },
      {
        onSuccess: (result) => {
          setChatMessages((prev) => prev.filter(m => m.id !== thinkingId));
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}`,
            role: 'assistant',
            content: result.answer,
            timestamp: new Date(),
          };
          setChatMessages((prev) => [...prev, assistantMessage]);
          setIsChatThinking(false);
          setFeedback('Response received');
        },
        onError: (error) => { 
          setChatMessages((prev) => prev.filter(m => m.id !== thinkingId));
          const apiError = error as { error?: string; message?: string };
          const errorMsg: ChatMessage = {
            id: `error-${Date.now()}`,
            role: 'assistant',
            content: `❌ ${apiError.error || apiError.message || 'Something went wrong.'}`,
            timestamp: new Date(),
          };
          setChatMessages((prev) => [...prev, errorMsg]);
          setIsChatThinking(false);
        },
      },
    );
  };

  const clearChatThread = () => {
    if (chatMessages.length === 0) return;
    if (!window.confirm('Clear this research thread? Your notes and saved answers will stay.')) return;
    setChatMessages([]);
    const keys = getStorageKeys(pin);
    window.localStorage.removeItem(keys.CHAT_KEY);
    setFeedback('🧹 Research thread cleared. Ready for a new topic!');
  };

  const handleSectionClickForOverview = (sectionLabel: string) => {
    const cleanLabel = sectionLabel.replace(/^[A-Z0-9. ]+/, '').trim() || sectionLabel;
    const prompt = `Give me a broad overview of "${cleanLabel}" for Dynamic Planet. Include key concepts, important terms, and what I should know for Science Olympiad.`;
    sendChatMessage(prompt, 'Dynamic Planet — Division B');
  };

  // ============================================
  // BINDER FUNCTIONS
  // ============================================

  const skimBinder = (binderContent: string) => {
    setSkeletonLines(parseSkeletonLines(binderContent));
    setStage('review');
  };

  const finishAnalysis = (
    statuses: Map<string, { status: TocNode['status']; note: string; missingSubtopics?: string[]; newSections?: string[] }>,
    resultMessage: string,
  ) => {
    const localStatuses = new Map(statuses);

    const updateTocNodes = (nodes: TocNode[]): TocNode[] => {
      return nodes.map(node => {
        const info = localStatuses.get(node.id);
        if (info) {
          return {
            ...node,
            status: info.status || node.status,
            suggestion: info.note || node.suggestion,
            missingSubtopics: (info as any).missingSubtopics || node.missingSubtopics,
            children: node.children.map(child => {
              const childInfo = localStatuses.get(child.id);
              if (childInfo) {
                return {
                  ...child,
                  status: childInfo.status || child.status,
                  suggestion: childInfo.note || child.suggestion,
                  missingSubtopics: (childInfo as any).missingSubtopics || child.missingSubtopics,
                };
              }
              return child;
            })
          };
        }
        if (node.children && node.children.length > 0) {
          return {
            ...node,
            children: updateTocNodes(node.children)
          };
        }
        return node;
      });
    };

    let updatedNodes = tocAnalysis?.nodes || [];

    if (skeletonLines.length > 0) {
      const nodes = buildTocTree(skeletonLines, localStatuses);
      updatedNodes = nodes;
    } else {
      updatedNodes = updateTocNodes(updatedNodes);
    }

    if (!updatedNodes || updatedNodes.length === 0) {
      console.warn('⚠️ TOC nodes became empty, using existing TOC');
      updatedNodes = tocAnalysis?.nodes || [];
    }

    const flatten = (list: TocNode[]): TocNode[] => list.flatMap((n) => [n, ...flatten(n.children)]);
    const flat = flatten(updatedNodes);
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

    setGapAnalysis(gaps);

    // CRITICAL FIX: Actually set the tocAnalysis state!
    const newTocAnalysis = { nodes: updatedNodes, summary: { total: flat.length, complete, partial, missing } };
    setTocAnalysis(newTocAnalysis);

    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify(newTocAnalysis));

    setAnalysisProgress(100);
    setStage('ready');
    setFeedback(resultMessage);
  };

      const analyzeBinder = async () => {
        console.log('🔍 analyzeBinder called');
        console.log('📊 skeletonLines length:', skeletonLines.length);
        console.log('📊 skeletonLines:', skeletonLines);

        setStage('analyzing');
        setAnalysisMessage('🧠 Groq is analyzing each section of your binder...');
        setAnalysisProgress(10);

        try {
          const totalSections = skeletonLines.length;
          console.log('📊 totalSections:', totalSections);

          // ... rest of the function

      if (totalSections === 0) {
        throw new Error('No sections found in your binder. Please check your binder format.');
      }

      const initialEstimateMs = totalSections * GEMINI_REQUEST_DELAY_MS;
      setAnalysisMessage(`📖 Found ${totalSections} sections to analyze — about ${formatDuration(initialEstimateMs)} total...`);
      setAnalysisProgress(15);

      const allResults: { 
        code: string; 
        status: TocNode['status']; 
        note: string; 
        missingSubtopics?: string[]; 
        newSections?: string[];
      }[] = [];

      const analysisStartTime = Date.now();

      for (let i = 0; i < skeletonLines.length; i++) {
        const line = skeletonLines[i];
        const sectionNumber = i + 1;
        const progress = 15 + Math.floor((i / totalSections) * 70);

        if (i > 0) {
          const elapsedSoFar = Date.now() - analysisStartTime;
          const avgPerSection = elapsedSoFar / i;
          const remainingSections = totalSections - i;
          const estRemainingMs = Math.round(avgPerSection * remainingSections);
          setAnalysisMessage(`⏳ Pacing requests for Groq's rate limit... ~${formatDuration(estRemainingMs)} remaining`);
          await new Promise(resolve => setTimeout(resolve, GEMINI_REQUEST_DELAY_MS));
        }

        setAnalysisProgress(progress);
        setAnalysisMessage(`🔍 Analyzing section ${sectionNumber}/${totalSections}: ${line.code} ${line.title}`);

        const prompt = `
  Analyze this ONE binder section:

  Section: ${line.code} ${line.title}
  Content:
  ${line.body || '(No content yet)'}

  1. Is this COMPLETE, PARTIAL, or MISSING?
  2. If PARTIAL: List 2-4 specific missing concepts.
  3. If COMPLETE: What makes it complete?
  4. What NEW sections should be added?

  Return ONLY valid JSON:
  {
    "code": "${line.code}",
    "status": "complete|partial|missing",
    "note": "Brief note",
    "missingSubtopics": ["concept 1", "concept 2"],
    "newSections": ["New Section Title"]
  }`;

        try {
          // Wrap the mutate in a promise with better error handling
          const result = await new Promise<any>((resolve, reject) => {
            analyzeBinderStructure.mutate(
              {
                data: {
                  sections: [{
                    code: line.code,
                    title: line.title,
                    body: line.body || '',
                  }],
                  formatInstructions: prompt,
                  deepAnalysis: true,
                },
              },
              {
                onSuccess: (data) => {
                  console.log(`✅ Groq success for ${line.code}:`, data);
                  resolve(data);
                },
                onError: (error) => {
                  console.error(`❌ Groq error for ${line.code}:`, error);
                  reject(error);
                },
              }
            );
          });

          // Check if we got valid data back
          let sectionResult = null;

          if (result) {
            // Try different possible response structures
            if (result.sections && result.sections.length > 0) {
              sectionResult = result.sections[0];
            } else if (result.data && result.data.sections && result.data.sections.length > 0) {
              sectionResult = result.data.sections[0];
            } else if (result.result && result.result.sections && result.result.sections.length > 0) {
              sectionResult = result.result.sections[0];
            } else if (result.code && result.status) {
              // Direct response
              sectionResult = result;
            }
          }

          if (sectionResult) {
            allResults.push({
              code: line.code,
              status: sectionResult.status || 'partial',
              note: sectionResult.note || 'Analyzed by Groq',
              missingSubtopics: sectionResult.missingSubtopics || [],
              newSections: sectionResult.newSections || [],
            });
          } else {
            // Fallback to heuristic
            console.warn(`⚠️ No valid response for ${line.code}, using fallback`);
            const status = heuristicStatus(line.body);
            allResults.push({
              code: line.code,
              status: status.status,
              note: status.note,
              missingSubtopics: [],
              newSections: [],
            });
          }
        } catch (sectionError) {
          console.error(`❌ Section ${line.code} failed:`, sectionError);
          // Use heuristic fallback
          const status = heuristicStatus(line.body);
          allResults.push({
            code: line.code,
            status: status.status,
            note: status.note,
            missingSubtopics: [],
            newSections: [],
          });
        }
      }

      setAnalysisMessage('📊 Building your binder TOC...');
      setAnalysisProgress(90);

      // Build statuses map
      const statuses = new Map(allResults.map((item) => [
        item.code, 
        { 
          status: item.status, 
          note: item.note,
          missingSubtopics: item.missingSubtopics || [],
          newSections: item.newSections || []
        }
      ]));

      // Collect new sections and missing subtopics
      const allNewSections: string[] = [];
      const allMissingSubtopics: string[] = [];

      allResults.forEach(item => {
        if (item.newSections && item.newSections.length > 0) {
          allNewSections.push(...item.newSections);
        }
        if (item.missingSubtopics && item.missingSubtopics.length > 0) {
          allMissingSubtopics.push(...item.missingSubtopics);
        }
      });

      // Add new sections to todos
      if (allNewSections.length > 0) {
        const uniqueNewSections = [...new Set(allNewSections)];
        setTodos((current) => {
          const existingLabels = new Set(current.map(t => t.label.toLowerCase()));
          const toAdd = uniqueNewSections
            .filter(label => label.trim() && !existingLabels.has(label.trim().toLowerCase()))
            .map(label => ({ 
              id: `new-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, 
              label: `🔴 ${label.trim()}`, 
              done: false 
            }));
          return [...current, ...toAdd];
        });
        setFeedback(`🧠 Groq found ${uniqueNewSections.length} NEW sections to add!`);
      }

      // Add missing subtopics to todos
      if (allMissingSubtopics.length > 0) {
        const uniqueMissing = [...new Set(allMissingSubtopics)].slice(0, 15);
        setTodos((current) => {
          const existingLabels = new Set(current.map(t => t.label.toLowerCase()));
          const toAdd = uniqueMissing
            .filter(label => label.trim() && !existingLabels.has(label.trim().toLowerCase()))
            .map(label => ({ 
              id: `missing-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`, 
              label: `🟡 ${label.trim()}`, 
              done: false 
            }));
          return [...current, ...toAdd];
        });
      }

      setAnalysisProgress(100);
      finishAnalysis(statuses, '🎉 Groq analysis complete! Check your binder plan for new sections.');

    } catch (error) {
      console.error('Groq analysis failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setStage('ready');
      setAnalysisProgress(0);
      setFeedback(`❌ Groq analysis failed: ${errorMessage}`);
      setErrorMessage(`Groq analysis failed: ${errorMessage}`);
      setAnalysisMessage(`❌ ${errorMessage}`);
    }
  };

  // ============================================
  // RE-EVALUATE A SINGLE SECTION WITH GROQ
  // ============================================
  const reevaluateSection = async (sectionCode: string, providedContent?: string) => {
    console.log('🔄 Re-evaluate called for section code:', sectionCode);

    let section = skeletonLines.find(s => s.code === sectionCode);

    if (!section) {
      section = skeletonLines.find(s => s.code === sectionCode + '.');
    }

    if (!section) {
      const withoutDot = sectionCode.replace(/\.$/, '');
      section = skeletonLines.find(s => s.code === withoutDot);
    }

    if (!section) {
      console.warn('⚠️ Section not found in skeletonLines, using provided content from tooltip');
      let title = sectionCode;
      if (tocAnalysis) {
        const searchNodes = (nodes: TocNode[]): string | null => {
          for (const node of nodes) {
            if (node.id === sectionCode || node.label.includes(sectionCode)) {
              return node.label.replace(/^[A-Z0-9. ]+/, '').trim() || node.label;
            }
            if (node.children.length > 0) {
              const found = searchNodes(node.children);
              if (found) return found;
            }
          }
          return null;
        };
        const foundTitle = searchNodes(tocAnalysis.nodes);
        if (foundTitle) title = foundTitle;
      }

      section = {
        code: sectionCode,
        title: title,
        depth: 1,
        body: providedContent || 'No content available',
      };
    }

    let bodyToAnalyze = section.body || '';

    if (providedContent && providedContent.length > 0) {
      bodyToAnalyze = providedContent;
    }

    if (!bodyToAnalyze || bodyToAnalyze.trim().length === 0) {
      console.warn('⚠️ No content to analyze for section:', sectionCode);
      setFeedback(`⚠️ No content found for "${sectionCode}". Add content first.`);
      return;
    }

    setIsReevaluating(true);
    setReevaluateTarget(sectionCode);
    setFeedback(`🔍 Re-evaluating ${section.code} ${section.title}...`);
    setAnalysisMessage(`🔄 Re-evaluating "${section.title}"... Groq is analyzing this section in detail.`);

    try {
      const prompt = `
  You are an EXTREMELY THOROUGH Science Olympiad Dynamic Planet expert. Re-analyze this ONE binder section with excruciating detail.

  Section: ${section.code} ${section.title}

  Here is the ACTUAL content from the student's binder:
  ---
  ${bodyToAnalyze}
  ---

  Be VERY SPECIFIC and DEEP. Think like a national-level judge grading this binder.

  1. COMPLETENESS (be VERY picky):
     - COMPLETE: Every key concept is covered with definitions, examples, diagrams mentioned, and thorough explanations
     - PARTIAL: Has the basics but missing important details, definitions, examples, or diagrams
     - MISSING: Empty, just a title, or only 1-2 superficial sentences

  2. If PARTIAL, list EXACTLY what's missing (be specific!):
     - Missing definitions for key terms
     - Missing real-world examples
     - Missing diagrams or visual explanations
     - Missing connections to related concepts
     - Missing calculations or formulas
     - Missing comparison tables
     - Missing processes or mechanisms

  3. If COMPLETE, explain what makes it excellent.

  4. What NEW sections should be added?

  Return ONLY valid JSON:
  {
    "code": "${section.code}",
    "status": "complete|partial|missing",
    "note": "Detailed, specific note about this section's strengths and weaknesses",
    "missingSubtopics": ["specific concept 1", "specific concept 2", "specific concept 3"],
    "newSections": ["Completely New Topic"]
  }`;

      const result = await new Promise<BinderStructureAnalysisResult>((resolve, reject) => {
        analyzeBinderStructure.mutate(
          {
            data: {
              sections: [{
                code: section.code,
                title: section.title,
                body: bodyToAnalyze,
              }],
              formatInstructions: prompt,
              deepAnalysis: true,
            },
          },
          {
            onSuccess: resolve,
            onError: reject,
          }
        );
      });

      if (result && result.sections && result.sections.length > 0) {
        const sectionResult = result.sections[0];

        const updatedStatuses = new Map();
        if (tocAnalysis) {
          const flatten = (nodes: TocNode[]): TocNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
          const flat = flatten(tocAnalysis.nodes);
          flat.forEach(node => {
            updatedStatuses.set(node.id, {
              status: node.status,
              note: node.suggestion || '',
              missingSubtopics: node.missingSubtopics || [],
            });
          });
        }

        updatedStatuses.set(section.code, {
          status: sectionResult.status || 'partial',
          note: sectionResult.note || 'Re-analyzed by Groq',
          missingSubtopics: (sectionResult as any).missingSubtopics || [],
          newSections: (sectionResult as any).newSections || [],
        });

        const updateTocNodes = (nodes: TocNode[]): TocNode[] => {
          return nodes.map(node => {
            if (node.id === section.code) {
              const info = updatedStatuses.get(section.code);
              return {
                ...node,
                status: info?.status || node.status,
                suggestion: info?.note || node.suggestion,
                missingSubtopics: info?.missingSubtopics || node.missingSubtopics,
                children: node.children.map(child => {
                  const childInfo = updatedStatuses.get(child.id);
                  if (childInfo) {
                    return {
                      ...child,
                      status: childInfo.status || child.status,
                      suggestion: childInfo.note || child.suggestion,
                      missingSubtopics: childInfo.missingSubtopics || child.missingSubtopics,
                    };
                  }
                  return child;
                })
              };
            }
            if (node.children && node.children.length > 0) {
              return {
                ...node,
                children: updateTocNodes(node.children)
              };
            }
            return node;
          });
        };

        let updatedNodes = tocAnalysis?.nodes || [];

        if (skeletonLines.length > 0 && skeletonLines.some(s => s.code === section.code || s.code === section.code + '.' || s.code === section.code.replace(/\.$/, ''))) {
          const nodes = buildTocTree(skeletonLines, updatedStatuses);
          updatedNodes = nodes;
        } else {
          updatedNodes = updateTocNodes(updatedNodes);
        }

        if (!updatedNodes || updatedNodes.length === 0) {
          updatedNodes = tocAnalysis?.nodes || [];
        }

        const flatten = (list: TocNode[]): TocNode[] => list.flatMap((n) => [n, ...flatten(n.children)]);
        const flat = flatten(updatedNodes);
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

       setGapAnalysis(gaps);
setTocAnalysis({ nodes: updatedNodes, summary: { total: flat.length, complete, partial, missing } });
const keys = getStorageKeys(pin);
window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify({ nodes: updatedNodes, summary: { total: flat.length, complete, partial, missing } }));

        const statusText = sectionResult.status === 'complete' ? 'Complete! ✨' : 
                           sectionResult.status === 'partial' ? 'Has gaps (check the tooltip)' : 'Missing (needs work)';

        setFeedback(`✅ ${section.code} re-evaluated! Status: ${statusText}`);
        setAnalysisMessage(`✅ Re-evaluation complete for "${section.title}" - Status: ${sectionResult.status.toUpperCase()}`);
      }
    } catch (error) {
      console.error('❌ re-evaluate fatal error:', error);
      setFeedback(`❌ Failed to re-evaluate ${section.code}: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setIsReevaluating(false);
      setReevaluateTarget(null);
    }
  };
  // ============================================
// HANDLE TOC UPDATE (NEW - for SectionManager)
// ============================================
const handleTocUpdate = (newTocAnalysis: TocAnalysis) => {
  // Update TOC state
  setTocAnalysis(newTocAnalysis);
  
  // Derive skeletonLines from the TOC nodes
  const newSkeletonLines: SkeletonLine[] = [];
  const flattenNodes = (nodes: TocNode[], depth: number = 1) => {
    for (const node of nodes) {
      const code = node.id;
      const title = node.label.replace(/^[A-Z0-9. ]+/, '').trim() || node.id;
      newSkeletonLines.push({
        code,
        title,
        depth,
        body: node.description || '',
      });
      if (node.children.length > 0) {
        flattenNodes(node.children, depth + 1);
      }
    }
  };
  flattenNodes(newTocAnalysis.nodes);
  setSkeletonLines(newSkeletonLines);

  // Update binder string and localStorage
  const updatedBinder = newSkeletonLines
    .map(s => `${s.code}. ${s.title}\n${s.body}`)
    .join('\n\n');
  setBinder(updatedBinder);
  const keys = getStorageKeys(pin);
  window.localStorage.setItem(keys.BINDER_KEY, JSON.stringify(updatedBinder));
  window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify(newTocAnalysis));
  setFeedback('📋 Binder structure updated!');
};
  const forceRefreshToc = () => {
  if (!skeletonLines.length) {
    setFeedback('⚠️ No skeleton data to refresh from.');
    return;
  }
  
  // Build statuses from existing TOC if available
  const statuses = new Map();
  if (tocAnalysis) {
    const flatten = (nodes: TocNode[]): TocNode[] => 
      nodes.flatMap((n) => [n, ...flatten(n.children)]);
    const flat = flatten(tocAnalysis.nodes);
    flat.forEach(node => {
      statuses.set(node.id, {
        status: node.status,
        note: node.suggestion || '',
        missingSubtopics: node.missingSubtopics || [],
      });
    });
  }
  
  // Rebuild TOC tree from skeletonLines
  const updatedNodes = buildTocTree(skeletonLines, statuses);
  const flatten2 = (list: TocNode[]): TocNode[] => 
    list.flatMap((n) => [n, ...flatten2(n.children)]);
  const flat2 = flatten2(updatedNodes);
  
  const newToc = { 
    nodes: updatedNodes, 
    summary: { 
      total: flat2.length, 
      complete: flat2.filter(n => n.status === 'complete').length, 
      partial: flat2.filter(n => n.status === 'partial').length, 
      missing: flat2.filter(n => n.status === 'missing').length 
    } 
  };
  
  setTocAnalysis(newToc);
  const keys = getStorageKeys(pin);
  window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify(newToc));
  setFeedback('🔄 TOC refreshed from skeleton!');
};
  // ============================================
  // HANDLE SKELETON UPDATE
  // ============================================
  const handleskeletonupdate = (newSkeleton: SkeletonLine[]) => {
  setSkeletonLines(newSkeleton);

  // Rebuild the binder string from the updated skeleton
  const updatedBinder = newSkeleton
    .map(s => `${s.code}. ${s.title}\n${s.body}`)
    .join('\n\n');
  setBinder(updatedBinder);

  const keys = getStorageKeys(pin);
  window.localStorage.setItem(keys.BINDER_KEY, JSON.stringify(updatedBinder));

  // IMPORTANT: Rebuild the TOC analysis from scratch
  // Use existing statuses if available, or default to 'partial'
  const statuses = new Map();
  
  if (tocAnalysis) {
    // Try to preserve existing statuses
    const flatten = (nodes: TocNode[]): TocNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);
    const flat = flatten(tocAnalysis.nodes);
    flat.forEach(node => {
      const skeletonLine = newSkeleton.find(s => s.code === node.id);
      if (skeletonLine) {
        statuses.set(node.id, {
          status: node.status,
          note: node.suggestion || '',
          missingSubtopics: node.missingSubtopics || [],
        });
      }
    });
  }

  // If a section doesn't have a status yet, mark it as 'partial'
  newSkeleton.forEach(section => {
    if (!statuses.has(section.code)) {
      statuses.set(section.code, {
        status: 'partial',
        note: 'New section - needs analysis',
        missingSubtopics: [],
      });
    }
  });

  // Rebuild the TOC tree
  const updatedNodes = buildTocTree(newSkeleton, statuses);
  const flatten2 = (list: TocNode[]): TocNode[] => list.flatMap((n) => [n, ...flatten2(n.children)]);
  const flat2 = flatten2(updatedNodes);
  const complete = flat2.filter((n) => n.status === 'complete').length;
  const partial = flat2.filter((n) => n.status === 'partial').length;
  const missing = flat2.filter((n) => n.status === 'missing').length;

  const newTocAnalysis = { 
    nodes: updatedNodes, 
    summary: { total: flat2.length, complete, partial, missing } 
  };
  
  setTocAnalysis(newTocAnalysis);
  window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify(newTocAnalysis));

  setFeedback('📋 Binder structure updated! TOC rebuilt.');
};

  // ============================================
  // RESET BINDER
  // ============================================

  const resetBinder = () => {
    if (!window.confirm('Reset your binder? This will clear your current binder, TOC, and analysis. Your checklist, notes, and sources will stay.')) return;

    setIsResettingBinder(true);
    setFeedback('🔄 Clearing binder...');

    const keys = getStorageKeys(pin);
    window.localStorage.setItem(keys.BINDER_KEY, JSON.stringify(''));
    window.localStorage.setItem(keys.TOC_ANALYSIS_KEY, JSON.stringify(null));

    setBinder('');
    setTocAnalysis(null);
    setGapAnalysis([]);
    setSkeletonLines([]);
    setStage('ready');
    setEditingBinder(true);
    setIsResettingBinder(false);

    setFeedback('📋 Binder cleared! Paste your new binder below.');
  };

  // ============================================
  // NOTES FUNCTIONS
  // ============================================

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

  const addTodo = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = newTodo.trim();
    if (!label) return;
    setTodos((current) => [...current, { id: `${Date.now()}`, label, done: false }]);
    setNewTodo('');
    setFeedback('Section added to your checklist');
  };

  const toggleTodo = (id: string) => {
    setTodos((current) => current.map((todo) => todo.id === id ? { ...todo, done: !todo.done } : todo));
    setFeedback('Binder checklist updated');
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
  // Server caps binder text at 12,000 chars for this route — truncate so
  // long binders don't get silently rejected before Groq ever sees them.
  const MAX_BINDER_CHARS = 11000;
  const binderForPlan = binder.length > MAX_BINDER_CHARS
    ? binder.slice(0, MAX_BINDER_CHARS) + '\n\n[...binder truncated for length...]'
    : binder;

  updateBinderPlan.mutate({
    data: {
      binder: binderForPlan,
      update: latestUpdate.slice(0, 3900), // same guard for the update note (4000 cap)
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

  const switchPin = () => {
    if (syncStatus === 'syncing' && !window.confirm('Still saving your latest changes — switch PINs anyway?')) return;
    onForgetPin();
  };

  const clearSession = () => {
    if (!window.confirm("Clear your binder, checklist, and notes, and log out of this PIN? (Nothing already saved online under this PIN is touched — entering this PIN again would still have your old data.)")) return;
    hasHydratedRef.current = true;
    writeLocalState({});
    onForgetPin();
  };

  // ============================================
  // HANDLE BINDER COMPLETE
  // ============================================
  const handleBinderComplete = (binderContent: string) => {
    setBinder(binderContent);
    setEditingBinder(false);
    skimBinder(binderContent);
  };

  const editSkeleton = () => {
    setEditingBinder(true);
  };

  if (!binder.trim() || editingBinder) {
    return <BinderSetup onComplete={handleBinderComplete} initialValue={binder} theme={currentTheme} />;
  }

  if (stage === 'review') {
    return <SkeletonReview lines={skeletonLines} onApprove={analyzeBinder} onEdit={editSkeleton} isAnalyzing={false} />;
  }

  if (stage === 'analyzing') {
    return <AnalyzingScreen message={analysisMessage} progress={analysisProgress} />;
  }

  // ============================================
  // RENDER: CHECK SETUP STATE
  // ============================================
  // ============================================
  // HANDLE BINDER COMPLETE
  // ============================================
 
  
  // ============================================
  // RENDER: MAIN WORKSPACE
  // ============================================

  return (
            <div className="workspace-shell" style={{
              display: 'grid',
              gridTemplateColumns: '56px 1fr',
              minHeight: '100dvh',
              background: currentTheme.background || '#e8f0fe',
            }}>
            {/* ============================================
                SIDEBAR NAVIGATION
                ============================================ */}
              <aside className="nav-sidebar" style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '12px 0',
                background: currentTheme.sidebarBg || '#1a1a2e',
                borderRight: `1px solid ${currentTheme.primary}33`,
                height: '100vh',
                position: 'sticky',
                top: 0,
                overflow: 'hidden',
                gap: '4px',
              }}>
              {/* Logo - Using theme colors directly */}
              <div style={{
                width: '36px',
                height: '36px',
                display: 'grid',
                placeItems: 'center',
                marginBottom: '12px',
                background: currentTheme.primary + '20',
                borderRadius: '12px',
                color: currentTheme.primary,
              }}>
                <FlaskConical size={18} strokeWidth={1.7} />
              </div>

              {/* Nav Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', flex: 1, width: '100%', padding: '0 8px' }}>
                {[
                  { id: 'research', icon: MessageSquare, label: 'Research' },
                  { id: 'binder', icon: Book, label: 'Binder' },
                  { id: 'notes', icon: NotebookPen, label: 'Notes' },
                  { id: 'settings', icon: Settings, label: 'Settings' },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px 4px',
                        width: '100%',
                        borderRadius: '10px',
                        border: 'none',
                        background: isActive ? currentTheme.sidebarAccent : 'transparent',
                        color: isActive ? currentTheme.sidebarPrimary : 'hsl(var(--sidebar-foreground) / 0.5)',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        fontSize: '9px',
                        gap: '2px',
                        fontWeight: isActive ? 600 : 400,
                      }}
                      title={tab.label}
                    >
                      <tab.icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                      <span style={{ fontSize: '7px', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        {tab.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* PIN Display */}
              <div style={{
                fontSize: '8px',
                color: 'hsl(var(--sidebar-foreground) / 0.3)',
                padding: '4px 0',
                textAlign: 'center',
                borderTop: '1px solid hsl(var(--sidebar-border) / 0.3)',
                width: '100%',
                paddingTop: '8px',
              }}>
                <span style={{ fontFamily: 'monospace', letterSpacing: '1px' }}>
                  PIN {pin.slice(0, 2) + '•'.repeat(Math.max(pin.length - 2, 0))}
                </span>
              </div>
            </aside>

            {/* ============================================
                MAIN CONTENT AREA
                ============================================ */}
            <main className="main-column" style={{ overflow: 'hidden' }}>
              {/* Top Bar */}
                <header className="topbar" style={{
                  height: '56px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0 20px',
                  borderBottom: `1px solid ${currentTheme.border || '#c5d9f0'}`,
                  background: currentTheme.cardBg || '#f0f7ff',
                  backdropFilter: 'blur(12px)',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 600 }}>
                    {activeTab === 'research' && '🔬 Research'}
                    {activeTab === 'binder' && '📖 Binder'}
                    {activeTab === 'notes' && '📝 Notes'}
                    {activeTab === 'settings' && '⚙️ Settings'}
                  </span>
                </div>
                <div className="topbar-status" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: 'hsl(var(--muted-foreground))' }}>
                  <span className="status-dot" style={{
                    display: 'inline-block',
                    width: '6px',
                    height: '6px',
                    borderRadius: '99px',
                    background: syncStatus === 'syncing' ? 'hsl(var(--accent))' : 
                                syncStatus === 'error' ? 'hsl(var(--destructive))' : currentTheme.primary,
                  }} />
                  {syncStatus === 'syncing' ? 'Saving...' : 
                   syncStatus === 'error' ? 'Offline' : 'Saved'}
                </div>
              </header>

        {/* Content */}
        <div className="main-content" style={{
          padding: '20px 24px',
          height: 'calc(100vh - 56px)',
          overflowY: 'auto',
        }}>
          {/* ============================================
              ERROR DISPLAY - Shows Groq failures
              ============================================ */}
          {errorMessage && (
            <div style={{
              background: 'hsl(var(--destructive) / 0.08)',
              border: '2px solid hsl(var(--destructive))',
              borderRadius: '16px',
              padding: '20px 24px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
            }}>
              <AlertCircle size={24} style={{ color: 'hsl(var(--destructive))', flexShrink: 0, marginTop: '2px' }} />
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 4px 0', color: 'hsl(var(--destructive))' }}>
                  ❌ Groq Analysis Failed
                </h4>
                <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: '0', whiteSpace: 'pre-wrap' }}>
                  {errorMessage}
                </p>
                <button 
                  className="primary-button" 
                  style={{ marginTop: '12px', fontSize: '12px', padding: '6px 16px' }}
                  onClick={() => {
                    setErrorMessage('');
                    setAnalysisMessage('');
                    // Reset to review stage so user can try again
                    setStage('review');
                    setFeedback('🔄 Ready to try again');
                  }}
                >
                  <RotateCcw size={14} /> Try Again
                </button>
              </div>
            </div>
          )}
          {/* ============================================
              TAB: RESEARCH
              ============================================ */}
          {activeTab === 'research' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: '16px', height: '100%' }}>
              {/* Chat Area */}
              <div>
                <section className="question-card" id="question-desk" style={{
                  padding: '0',
                  background: 'transparent',
                  border: 'none',
                  boxShadow: 'none',
                  height: '100%',
                }}>
                  <div className="card-heading" style={{ padding: '0 0 12px 0' }}>
                    <div>
                      <div className="step-number" style={{ color: 'hsl(var(--accent))', fontSize: '10px' }}>01 / RESEARCH</div>
                      <h2 style={{ fontSize: '18px', margin: '4px 0 0' }}>Research Chat</h2>
                      <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', margin: '2px 0 0' }}>
                        Ask questions, get answers, and follow up naturally. Click on any 🟡 or 🔴 section in the TOC for an overview.
                      </p>
                    </div>
                  </div>

                  <ChatInterface
                    messages={chatMessages}
                    onSendMessage={sendChatMessage}
                    onClearThread={clearChatThread}
                    isThinking={isChatThinking}
                    onSectionClick={handleSectionClickForOverview}
                    tocAnalysis={tocAnalysis}
                    askForInsights={() => {
                      sendChatMessage('Based on my Dynamic Planet binder progress, what should I add next?', 'Dynamic Planet — Division B');
                    }}
                  />
                </section>
              </div>

              {/* TOC Sidebar */}
              <div style={{ position: 'sticky', top: '0', height: '100%', overflowY: 'auto' }}>
                {tocAnalysis ? (
              <TocSidebar 
                toc={tocAnalysis} 
                onNodeHover={setHoveredNode}
                hoveredNode={hoveredNode}
                onSectionClick={handleSectionClickForOverview}
                isReevaluating={isReevaluating}
                reevaluateTarget={reevaluateTarget}
              />
                ) : (
                  <div style={{
                    padding: '20px',
                    textAlign: 'center',
                    color: 'hsl(var(--muted-foreground))',
                    background: 'hsl(var(--card) / 0.5)',
                    borderRadius: '16px',
                    border: '1px solid hsl(var(--card-border))',
                  }}>
                    <Book size={24} style={{ opacity: 0.3, marginBottom: '8px' }} />
                    <p style={{ fontSize: '12px' }}>No binder analyzed yet.</p>
                    <p style={{ fontSize: '11px', opacity: 0.6 }}>Go to Settings to upload your binder.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ============================================
              TAB: BINDER
              ============================================ */}
          {activeTab === 'binder' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Left: Full TOC or Section Manager */}
<div>
  <div style={{
    background: 'hsl(var(--card) / 0.5)',
    borderRadius: '16px',
    border: '1px solid hsl(var(--card-border))',
    padding: '20px',
    maxHeight: '500px',
    overflowY: 'auto',
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
      <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>
        {showSectionManager ? '🔧 Section Manager' : '📑 Full Binder TOC'}
        <span style={{ fontSize: '11px', fontWeight: 400, color: 'hsl(var(--muted-foreground))', marginLeft: '8px' }}>
          {tocAnalysis ? `${tocAnalysis.summary.complete} ✅ · ${tocAnalysis.summary.partial} 🟡 · ${tocAnalysis.summary.missing} 🔴` : 'No binder loaded'}
        </span>
      </h3>
      <div style={{ display: 'flex', gap: '6px' }}>
        {/* ADD THE REFRESH BUTTON HERE */}
        <button 
          className="outline-button" 
          onClick={forceRefreshToc}
          style={{ fontSize: '10px', padding: '4px 12px' }}
          title="Refresh TOC from skeleton"
        >
          🔄 Refresh TOC
        </button>
        <button 
          className="outline-button" 
          onClick={() => setShowSectionManager(!showSectionManager)}
          style={{ fontSize: '10px', padding: '4px 12px' }}
        >
          {showSectionManager ? '📖 View TOC' : '🔧 Manage Sections'}
        </button>
      </div>
    </div>

                  {tocAnalysis ? (
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                      {showSectionManager ? (
  <SectionManager
    tocAnalysis={tocAnalysis}                 // pass the full TOC
    onUpdateToc={handleTocUpdate}            // new handler for TOC updates
    onReevaluate={reevaluateSection}
  />
) : (
                        <TocSidebar 
                          toc={tocAnalysis} 
                          onNodeHover={setHoveredNode}
                          hoveredNode={hoveredNode}
                          onSectionClick={handleSectionClickForOverview}
                          isFullSize={true}
                          onReevaluate={reevaluateSection}
                          isReevaluating={isReevaluating}
                          reevaluateTarget={reevaluateTarget}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '40px 20px', color: 'hsl(var(--muted-foreground))' }}>
                      <Book size={32} style={{ opacity: 0.2, marginBottom: '12px' }} />
                      <p>No binder loaded. Upload one in Settings.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right: Updates + Reset */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Updates Log */}
                <div style={{
                  background: 'hsl(var(--card) / 0.5)',
                  borderRadius: '16px',
                  border: '1px solid hsl(var(--card-border))',
                  padding: '20px',
                  flex: 1,
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                    📝 Binder Updates
                    <span style={{ fontSize: '11px', fontWeight: 400, color: 'hsl(var(--muted-foreground))', marginLeft: '8px' }}>
                      {updates.length} logged
                    </span>
                  </h3>

                  <form className="update-form" onSubmit={addUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    <input 
                      value={updateSection} 
                      onChange={(e) => setUpdateSection(e.target.value)} 
                      placeholder="Section name" 
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--input))',
                        background: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        fontSize: '11px',
                        outline: 'none',
                      }}
                    />
                    <textarea 
                      value={updateText} 
                      onChange={(e) => setUpdateText(e.target.value)} 
                      placeholder="What did you add or learn?" 
                      rows={2}
                      style={{
                        padding: '6px 10px',
                        borderRadius: '8px',
                        border: '1px solid hsl(var(--input))',
                        background: 'hsl(var(--background))',
                        color: 'hsl(var(--foreground))',
                        fontSize: '11px',
                        resize: 'vertical',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <button className="primary-button" type="submit" style={{ padding: '6px 12px', fontSize: '11px' }}>
                      <Plus size={12} /> Log Update
                    </button>
                  </form>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '150px', overflowY: 'auto' }}>
                    {updates.slice(0, 10).map((item) => (
                      <div key={item.id} style={{
                        padding: '6px 10px',
                        background: 'hsl(var(--background) / 0.5)',
                        borderRadius: '8px',
                        borderLeft: '2px solid hsl(var(--primary))',
                        fontSize: '11px',
                      }}>
                        <strong>{item.section}</strong>
                        <p style={{ margin: '2px 0 0', color: 'hsl(var(--muted-foreground))', fontSize: '10px' }}>{item.update}</p>
                        <button 
                          className="icon-button" 
                          onClick={() => setUpdates((current) => current.filter((u) => u.id !== item.id))}
                          style={{ padding: '2px', float: 'right' }}
                        >
                          <Trash2 size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reset Binder Button */}
                <div style={{
                  background: 'hsl(var(--destructive) / 0.06)',
                  borderRadius: '16px',
                  border: '1px solid hsl(var(--destructive) / 0.15)',
                  padding: '16px 20px',
                }}>
                  <h3 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '4px', color: 'hsl(var(--destructive))' }}>
                    ⚠️ Reset Binder
                  </h3>
                  <p style={{ fontSize: '11px', color: 'hsl(var(--muted-foreground))', marginBottom: '10px' }}>
                    This will clear your current binder and TOC. Your notes, sources, and checklist will stay.
                  </p>
                  <button 
                    className="primary-button" 
                    onClick={resetBinder} 
                    disabled={isResettingBinder}
                    style={{ 
                      padding: '8px 16px', 
                      fontSize: '12px',
                      background: 'hsl(var(--destructive))',
                    }}
                  >
                    <RefreshCw size={14} /> {isResettingBinder ? 'Resetting...' : 'Reset Binder'}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ============================================
              TAB: NOTES
              ============================================ */}
          {activeTab === 'notes' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Sources */}
              <div style={{
                background: 'hsl(var(--card) / 0.5)',
                borderRadius: '16px',
                border: '1px solid hsl(var(--card-border))',
                padding: '20px',
                maxHeight: '500px',
                overflowY: 'auto',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                  🔗 Source Shelf
                  <span style={{ fontSize: '11px', fontWeight: 400, color: 'hsl(var(--muted-foreground))', marginLeft: '8px' }}>
                    {sources.length} saved
                  </span>
                </h3>

                <form className="source-form" onSubmit={addSource} style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
                  <input 
                    value={sourceUrl} 
                    onChange={(e) => setSourceUrl(e.target.value)} 
                    placeholder="Add a source URL" 
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid hsl(var(--input))',
                      background: 'hsl(var(--background))',
                      color: 'hsl(var(--foreground))',
                      fontSize: '11px',
                      outline: 'none',
                    }}
                  />
                  <button className="primary-button" type="submit" style={{ padding: '6px 12px', fontSize: '11px' }}>
                    <Plus size={12} /> Add
                  </button>
                </form>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {sources.map((source) => (
                    <div key={source.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      background: 'hsl(var(--background) / 0.5)',
                      borderRadius: '8px',
                      fontSize: '11px',
                    }}>
                      <a href={source.url} target="_blank" rel="noreferrer" style={{ color: 'hsl(var(--primary))', textDecoration: 'none' }}>
                        {source.url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 40)}
                      </a>
                      <button className="icon-button" onClick={() => setSources((current) => current.filter((s) => s.id !== source.id))} style={{ padding: '2px' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Saved Notes */}
              <div style={{
                background: 'hsl(var(--card) / 0.5)',
                borderRadius: '16px',
                border: '1px solid hsl(var(--card-border))',
                padding: '20px',
                maxHeight: '500px',
                overflowY: 'auto',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                  📝 Saved Notes
                  <span style={{ fontSize: '11px', fontWeight: 400, color: 'hsl(var(--muted-foreground))', marginLeft: '8px' }}>
                    {notes.length} saved
                  </span>
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {notes.map((note) => (
                    <div key={note.id} style={{
                      padding: '8px 12px',
                      background: 'hsl(var(--background) / 0.5)',
                      borderRadius: '8px',
                      borderLeft: '2px solid hsl(var(--primary))',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontSize: '11px', fontWeight: 500, margin: 0 }}>{note.question.slice(0, 60)}...</p>
                          <p style={{ fontSize: '10px', color: 'hsl(var(--muted-foreground))', margin: '2px 0 0' }}>
                            {new Date(note.createdAt).toLocaleDateString()} · {note.subject}
                          </p>
                        </div>
                        <button className="icon-button" onClick={() => setNotes((current) => current.filter((n) => n.id !== note.id))} style={{ padding: '2px' }}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ============================================
              TAB: SETTINGS
              ============================================ */}
          {activeTab === 'settings' && (
            <div style={{ maxWidth: '600px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px' }}>⚙️ Settings</h2>

              {/* PIN Section */}
              <div style={{
                background: 'hsl(var(--card) / 0.5)',
                borderRadius: '16px',
                border: '1px solid hsl(var(--card-border))',
                padding: '20px',
                marginBottom: '16px',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                  🔐 PIN
                </h3>
                <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '12px' }}>
                  Your current PIN: <strong style={{ fontFamily: 'monospace', letterSpacing: '2px' }}>
                    {pin.slice(0, 2) + '•'.repeat(Math.max(pin.length - 2, 0))}
                  </strong>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(pin);
                      setFeedback('📋 PIN copied to clipboard!');
                    }}
                    style={{
                      marginLeft: '8px',
                      padding: '2px 8px',
                      fontSize: '10px',
                      borderRadius: '6px',
                      border: '1px solid hsl(var(--border))',
                      background: 'transparent',
                      color: 'hsl(var(--muted-foreground))',
                      cursor: 'pointer',
                    }}
                  >
                    Copy PIN
                  </button>
                </p>
                <button className="outline-button" onClick={switchPin} style={{ fontSize: '12px' }}>
                  <RotateCcw size={14} /> Switch PIN
                </button>
                <button className="outline-button" onClick={clearSession} style={{ fontSize: '12px', marginLeft: '8px', borderColor: 'hsl(var(--destructive))' }}>
                  <Trash2 size={14} /> Clear Session
                </button>
              </div>

              {/* Color Theme Section */}
              <div style={{
                background: 'hsl(var(--card) / 0.5)',
                borderRadius: '16px',
                border: '1px solid hsl(var(--card-border))',
                padding: '20px',
                marginBottom: '16px',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                  🎨 Theme Color
                </h3>
                <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '12px' }}>
                  Choose your favorite color for the app
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  {[
                    { name: 'Blue', value: 'blue', color: '#3b82f6' },
                    { name: 'Purple', value: 'purple', color: '#8b5cf6' },
                    { name: 'Green', value: 'green', color: '#22c55e' },
                    { name: 'Pink', value: 'pink', color: '#ec4899' },
                    { name: 'Orange', value: 'orange', color: '#f97316' },
                  ].map((theme) => {
                    // Use the colorTheme state to determine if this theme is active
                    const isActive = colorTheme === theme.value;
                    return (
                      <button
                        key={theme.value}
                        onClick={() => {
                          setColorTheme(theme.value);
                          document.documentElement.setAttribute('data-theme', theme.value);
                          setFeedback(`🎨 Theme changed to ${theme.name}!`);
                        }}
                        style={{
                          width: '40px',
                          height: '40px',
                          borderRadius: '50%',
                          border: isActive ? '3px solid hsl(var(--foreground))' : '2px solid hsl(var(--border))',
                          background: theme.color,
                          cursor: 'pointer',
                          transition: 'all 0.2s ease',
                          transform: isActive ? 'scale(1.1)' : 'scale(1)',
                          boxShadow: isActive ? `0 0 20px ${theme.color}40` : 'none',
                        }}
                        title={theme.name}
                      />
                    );
                  })}
                </div>
                <div style={{ marginTop: '8px', fontSize: '10px', color: 'hsl(var(--muted-foreground))' }}>
                  Current theme: <strong>
                    {colorTheme === 'blue' && 'Blue'}
                    {colorTheme === 'purple' && 'Purple'}
                    {colorTheme === 'green' && 'Green'}
                    {colorTheme === 'pink' && 'Pink'}
                    {colorTheme === 'orange' && 'Orange'}
                    {!['blue', 'purple', 'green', 'pink', 'orange'].includes(colorTheme) && 'Blue'}
                  </strong>
                </div>
              </div>

              {/* Binder Section */}
              <div style={{
                background: 'hsl(var(--card) / 0.5)',
                borderRadius: '16px',
                border: '1px solid hsl(var(--card-border))',
                padding: '20px',
                marginBottom: '16px',
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>
                  📄 Binder
                </h3>
                <p style={{ fontSize: '12px', color: 'hsl(var(--muted-foreground))', marginBottom: '12px' }}>
                  {binder.length > 0 ? `Binder loaded (${binder.length} characters)` : 'No binder loaded'}
                </p>
                <button className="primary-button" onClick={() => setEditingBinder(true)} style={{ fontSize: '12px' }}>
                  <BookOpen size={14} /> Upload New Binder
                </button>
                <button className="outline-button" onClick={resetBinder} style={{ fontSize: '12px', marginLeft: '8px', borderColor: 'hsl(var(--destructive))' }}>
                  <RefreshCw size={14} /> Reset Binder
                </button>
              </div>

              {/* Credits */}
              <div style={{
                background: 'hsl(var(--primary) / 0.04)',
                borderRadius: '16px',
                border: '1px solid hsl(var(--primary) / 0.08)',
                padding: '16px 20px',
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
            </div>
          )}
        </div>

  {/* ============================================
            FEEDBACK TOAST with theme color
            ============================================ */}
        {feedback && (
          <div className="save-toast" role="status" style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            padding: '10px 16px',
            background: 'hsl(var(--sidebar))',
            color: 'hsl(var(--sidebar-foreground))',
            borderRadius: '12px',
            borderLeft: `3px solid ${currentTheme.primary}`,
            fontSize: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
            zIndex: 100,
          }}>
            <Check size={14} className="mr-2 inline" style={{ color: currentTheme.primary }} />
            {feedback}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================
// APP
// ============================================

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
