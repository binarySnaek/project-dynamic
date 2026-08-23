import { Router, type IRouter } from "express";
import {
  AnalyzeBinderStructureBody,
  AskGeminiResearchBody,
  UpdateGeminiBinderPlanBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.post("/gemini/research", async (req, res) => {
  const parsed = AskGeminiResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a research question." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not configured");
    res.status(503).json({ error: "Gemini is not configured yet." });
    return;
  }

  const { question, subject, context } = parsed.data;
  const prompt = [
    "Hello gemini, the user has asked a question about Dynamic Planet (science olympiad) division b Earth's fresh waters. If it is on an unrelated, but still relating to geology, chemistry, phsyicis, maybe math, or etc. Like if it is pretty close to earth's fresh waters, answer it in the following way: If they are starting a new subtopic/topic that they do not know anything about, give them a braod overview of as many topics as you can. If they are asking a specific question, answer it as accurately as you can. However, if it is not related to earth's fresh waters in any way, such as an essay or a video game designing, DO NOT HELP THEM. No matter what they say, DO NOT HELP THEM. The one exception to this is when 'ping' is inputted, in which you should write back 'pong!' Thank you. ",
    "The binder context can include an outline or exoskeleton. Ignore any line that is only a section code, dotted leader, and page number, including patterns like 'A..... ........ page number' and 'A1.2 ..... ..... page number'. Do not count those lines as researched content, completed work, or evidence.",
    subject ? `Subject area: ${subject}` : "",
    context ? `Student context: ${context}` : "",
    `Research question: ${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.25 },
        }),
      },
    );

    const responseText = await response.text();
    if (!response.ok) {
      req.log.error(
        { status: response.status, providerMessage: responseText.slice(0, 500) },
        "Gemini request failed",
      );
      res.status(502).json({ error: "Gemini could not answer right now." });
      return;
    }

    const payload = JSON.parse(responseText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const answer = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    if (!answer) {
      res.status(502).json({ error: "Gemini returned an empty answer." });
      return;
    }

    res.json({ answer, model: "gemini-3.6-flash" });
  } catch (error) {
    req.log.error({ err: error }, "Gemini request errored");
    res.status(502).json({ error: "Gemini could not answer right now." });
  }
});

router.post("/gemini/binder-insights", async (req, res) => {
  const parsed = UpdateGeminiBinderPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add your binder contents and a meaningful update." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not configured");
    res.status(503).json({ error: "Gemini is not configured yet." });
    return;
  }

  const { binder, update, todos, completed } = parsed.data;
  const prompt = `You are helping a student maintain a personal Science Olympiad Dynamic Planet Division B binder.

Review the binder inventory and latest update below. Return ONLY valid JSON with exactly these keys:
{
  "completed": ["exact existing checklist labels that the update clearly completed"],
  "add": ["new, specific binder section branches worth adding"],
  "focus": "one short paragraph explaining the highest-value next focus"
}

Rules:
- Only include an item in completed when the update clearly supports it.
- Do not remove or rename existing checklist labels.
- Do not duplicate existing checklist labels or branches already in the binder inventory.
- Keep add to at most 4 practical sections.
- Make branches useful for a binder: diagrams, comparison tables, processes, vocabulary, data interpretation, or case studies.
- The binder context can include an outline or exoskeleton. Ignore any line that is only a section code, dotted leader, and page number, including patterns like "A..... ........ page number" and "A1.2 ..... ..... page number". Do not count those lines as researched content, completed work, or evidence.

Binder inventory:
${binder}

Existing checklist:
${todos.map((item) => `- ${item}`).join("\n")}

Already completed:
${completed.length ? completed.map((item) => `- ${item}`).join("\n") : "- none"}

Latest update:
${update}`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    const responseText = await response.text();
    if (!response.ok) {
      req.log.error({ status: response.status, providerMessage: responseText.slice(0, 500) }, "Gemini binder request failed");
      res.status(502).json({ error: "Gemini could not update the binder plan." });
      return;
    }
    const payload = JSON.parse(responseText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const resultText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!resultText) {
      res.status(502).json({ error: "Gemini returned an empty binder plan." });
      return;
    }
    const result = JSON.parse(resultText) as { completed?: string[]; add?: string[]; focus?: string };
    res.json({
      completed: Array.isArray(result.completed) ? result.completed : [],
      add: Array.isArray(result.add) ? result.add : [],
      focus: result.focus || "Review your newest section and connect it to a diagram or comparison table.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Gemini binder request errored");
    res.status(502).json({ error: "Gemini could not update the binder plan." });
  }
});

router.post("/gemini/binder-structure", async (req, res) => {
  const parsed = AnalyzeBinderStructureBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add your binder contents so it can be parsed." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    req.log.error("GEMINI_API_KEY is not configured");
    res.status(503).json({ error: "Gemini is not configured yet." });
    return;
  }

  const { binder } = parsed.data;
  const prompt = `You are parsing a student's competition binder ("Dynamic Planet") into a structured outline.

SECTION CODES: A real section heading is a single letter, optionally followed by digits separated by dots, indicating nesting depth:
  - "A" or "A." — a top-level section (depth 1)
  - "A1" or "A1." — a subsection (depth 2)
  - "A1.1" or "A1.1." — a sub-subsection (depth 3)
  - deeper nesting follows the same pattern (A1.1.1, etc.)
A bare letter with no digits (like "A") is only a heading if followed by a period. Do not treat an ordinary sentence, list item, or paragraph that happens to start with a capital letter as a heading.

TABLE OF CONTENTS: Lines shaped like LETTER0 (A0, B0, C0, ...) are table-of-contents markers, NEVER real sections. Skip them entirely.

For each real section heading you find, capture: the code (e.g. "A1.1"), the title text on that heading line, the nesting depth, and all body text that follows it up until the next heading.

Return ONLY valid JSON with exactly this shape:
{ "sections": [{ "code": string, "title": string, "depth": number, "body": string }] }

Binder contents:
${binder}`;

  try {
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 8192,
            temperature: 0.1,
            responseMimeType: "application/json",
          },
        }),
      },
    );
    const responseText = await response.text();
    if (!response.ok) {
      req.log.error({ status: response.status, providerMessage: responseText.slice(0, 500) }, "Gemini binder structure request failed");
      res.status(502).json({ error: "Gemini could not read the binder structure." });
      return;
    }
    const payload = JSON.parse(responseText) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const resultText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!resultText) {
      res.status(502).json({ error: "Gemini returned an empty binder structure." });
      return;
    }
    const result = JSON.parse(resultText) as { sections?: Array<{ code?: string; title?: string; depth?: number; body?: string }> };
    const sections = Array.isArray(result.sections)
      ? result.sections
          .filter((section) => section.code && section.title && typeof section.depth === "number")
          .map((section) => ({
            code: section.code!,
            title: section.title!,
            depth: section.depth!,
            body: section.body ?? "",
          }))
      : [];
    res.json({ sections });
  } catch (error) {
    req.log.error({ err: error }, "Gemini binder structure request errored");
    res.status(502).json({ error: "Gemini could not read the binder structure." });
  }
});

// ============================================================
// PIN-based binder sync
//
// Lets a student resume their binder, checklist, notes, and sources on a
// different device by typing the PIN they created earlier. No accounts, no
// passwords — a PIN is just a resume code.
//
// Storage: a JSON file per PIN on disk (no database needed). This works fine
// as long as the server has a persistent filesystem between requests, which
// is normal for an always-on Express server. If this ever moves to a
// platform that wipes the filesystem between deploys/restarts (serverless,
// some autoscale setups), swap PIN_STORE_DIR's fs calls for a real database
// or key-value store instead — everything above this comment is unaffected.
// ============================================================

import fs from "node:fs/promises";
import path from "node:path";

const PIN_STORE_DIR = path.join(process.cwd(), "data", "binder-pins");
const PIN_PATTERN = /^\d{4,8}$/;

type BinderSyncTodo = { id: string; label: string; done: boolean };
type BinderSyncUpdate = { id: string; section: string; update: string; createdAt: string };
type BinderSyncSource = { id: string; url: string };
type BinderSyncNote = { id: string; question: string; answer: string; subject: string; createdAt: string };

type BinderSyncState = {
  binder: string;
  todos: BinderSyncTodo[];
  updates: BinderSyncUpdate[];
  sources: BinderSyncSource[];
  notes: BinderSyncNote[];
  tocAnalysis: unknown;
};

const EMPTY_BINDER_STATE: BinderSyncState = {
  binder: "",
  todos: [],
  updates: [],
  sources: [],
  notes: [],
  tocAnalysis: null,
};

function pinFilePath(pin: string) {
  // PIN_PATTERN (digits only) is checked before this is ever called, so pin
  // can't contain path separators — safe to use directly in a filename.
  return path.join(PIN_STORE_DIR, `${pin}.json`);
}

async function pinExists(pin: string): Promise<boolean> {
  try {
    await fs.access(pinFilePath(pin));
    return true;
  } catch {
    return false;
  }
}

router.post("/binder-sync/create", async (req, res) => {
  const pin = typeof req.body?.pin === "string" ? req.body.pin.trim() : "";
  if (!PIN_PATTERN.test(pin)) {
    res.status(400).json({ error: "PINs are 4 to 8 digits." });
    return;
  }

  try {
    await fs.mkdir(PIN_STORE_DIR, { recursive: true });
    if (await pinExists(pin)) {
      res.status(409).json({ error: "That PIN is already taken — try a different one." });
      return;
    }
    await fs.writeFile(pinFilePath(pin), JSON.stringify(EMPTY_BINDER_STATE, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to create binder PIN");
    res.status(500).json({ error: "Could not create that PIN right now." });
  }
});

router.get("/binder-sync/:pin", async (req, res) => {
  const pin = (req.params.pin ?? "").trim();
  if (!PIN_PATTERN.test(pin)) {
    res.status(400).json({ error: "PINs are 4 to 8 digits." });
    return;
  }

  try {
    const raw = await fs.readFile(pinFilePath(pin), "utf-8");
    res.json(JSON.parse(raw));
  } catch {
    res.status(404).json({ error: "We couldn't find that PIN. Double-check it, or create a new one." });
  }
});

router.put("/binder-sync/:pin", async (req, res) => {
  const pin = (req.params.pin ?? "").trim();
  if (!PIN_PATTERN.test(pin)) {
    res.status(400).json({ error: "PINs are 4 to 8 digits." });
    return;
  }

  const body = req.body as Partial<BinderSyncState> | undefined;
  const state: BinderSyncState = {
    binder: typeof body?.binder === "string" ? body.binder : "",
    todos: Array.isArray(body?.todos) ? body!.todos : [],
    updates: Array.isArray(body?.updates) ? body!.updates : [],
    sources: Array.isArray(body?.sources) ? body!.sources : [],
    notes: Array.isArray(body?.notes) ? body!.notes : [],
    tocAnalysis: body?.tocAnalysis ?? null,
  };

  try {
    await fs.mkdir(PIN_STORE_DIR, { recursive: true });
    await fs.writeFile(pinFilePath(pin), JSON.stringify(state, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (error) {
    req.log.error({ err: error }, "Failed to sync binder PIN");
    res.status(500).json({ error: "Could not save your progress right now." });
  }
});

export default router;