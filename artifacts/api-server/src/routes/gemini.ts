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

// ============================================================
// BINDER STRUCTURE - COMPLETELY BYPASSED VALIDATION
// ============================================================
router.post("/gemini/binder-structure", async (req, res) => {
  console.log('🔥 binder-structure route hit!');
  console.log('📥 req.body:', JSON.stringify(req.body, null, 2).slice(0, 500));

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ No Gemini API key');
    res.status(503).json({ error: "Gemini is not configured yet." });
    return;
  }

  try {
    // ============================================
    // Try EVERY possible place the data could be
    // ============================================
    const body = req.body?.data || req.body;
    const sections = body?.sections || [];

    console.log('📊 Sections found:', sections.length);
    if (sections.length > 0) {
      console.log('📊 First section:', JSON.stringify(sections[0], null, 2));
    }

    // ============================================
    // If no sections, try to parse from the binder field
    // ============================================
    let finalSections = sections;

    if (finalSections.length === 0 && body?.binder) {
      console.log('📄 No sections, but binder found - attempting to parse');
      // If binder is provided but no sections, try to parse it
      // For now, just create a single section from the binder
      finalSections = [{
        code: 'A',
        title: 'Binder Content',
        body: body.binder.slice(0, 5000) // Truncate to avoid size issues
      }];
    }

    if (finalSections.length === 0) {
      console.error('❌ No sections or binder found in request');
      res.status(400).json({ error: "No sections or binder content provided." });
      return;
    }

    // ============================================
    // Build a simple prompt for each section
    // ============================================
    const sectionResults = [];

    for (let i = 0; i < Math.min(finalSections.length, 5); i++) {
      const section = finalSections[i];
      console.log(`🔍 Processing section ${i+1}/${Math.min(finalSections.length, 5)}: ${section.code || 'unknown'}`);

      const prompt = `
Analyze this ONE binder section:

Code: ${section.code || 'unknown'}
Title: ${section.title || 'Untitled'}
Content:
${(section.body || '').slice(0, 2000)}

Determine if this section is COMPLETE, PARTIAL, or MISSING.
If PARTIAL or MISSING, suggest what's missing.

Return ONLY valid JSON:
{
  "code": "${section.code || 'unknown'}",
  "status": "complete|partial|missing",
  "note": "Brief note on this section",
  "missingSubtopics": ["concept 1", "concept 2"],
  "newSections": ["New Section Title"]
}`;

      try {
        console.log(`📤 Calling Gemini for section ${i+1}...`);

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
          console.log(`📥 Gemini response for section ${i+1}:`, response.status);
          if (!response.ok) {
            console.error(`❌ Gemini error body for section ${i+1}:`, responseText.slice(0, 1000));
          }

          if (response.ok) {
          try {
            const payload = JSON.parse(responseText) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const resultText = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
            if (resultText) {
              const result = JSON.parse(resultText);
              sectionResults.push({
                code: section.code || 'unknown',
                status: result.status || 'partial',
                note: result.note || 'Analyzed by Gemini',
                missingSubtopics: result.missingSubtopics || [],
                newSections: result.newSections || [],
              });
              continue;
            }
          } catch (parseError) {
            console.error(`❌ Failed to parse Gemini response for section ${i+1}:`, parseError);
          }
        }

        // Fallback for this section
        const wordCount = (section.body || '').trim().split(/\s+/).filter(Boolean).length;
        sectionResults.push({
          code: section.code || 'unknown',
          status: wordCount === 0 ? 'missing' : wordCount < 25 ? 'partial' : 'complete',
          note: wordCount === 0 ? 'No content found' : wordCount < 25 ? 'Thin content' : 'Has content',
          missingSubtopics: [],
          newSections: [],
        });
      } catch (sectionError) {
        console.error(`❌ Section ${i+1} failed:`, sectionError);
        sectionResults.push({
          code: section.code || 'unknown',
          status: 'partial',
          note: 'Analysis failed - using fallback',
          missingSubtopics: [],
          newSections: [],
        });
      }
    }

    console.log(`✅ Returning ${sectionResults.length} results`);
    res.json({ sections: sectionResults });

  } catch (error) {
    console.error('❌ Fatal error in binder-structure:', error);
    res.status(500).json({ error: "Internal server error: " + (error instanceof Error ? error.message : 'unknown') });
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