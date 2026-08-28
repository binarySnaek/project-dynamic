import { Router, type IRouter } from "express";
import {
  AnalyzeBinderStructureBody,
  AskGeminiResearchBody,
  UpdateGeminiBinderPlanBody,
} from "@workspace/api-zod";

const router: IRouter = Router();

// ============================================================
// GROQ RESEARCH - Using Groq API
// ============================================================
router.post("/gemini/research", async (req, res) => {
  const parsed = AskGeminiResearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please enter a research question." });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    req.log.error("GROQ_API_KEY is not configured");
    res.status(503).json({ error: "The research desk is not configured yet." });
    return;
  }

  const { question, subject, context } = parsed.data;
  const systemPrompt = [
    "You are a research assistant for Dynamic Planet (Science Olympiad), Division B, Earth's fresh waters. If a question is on that topic, or closely related (geology, chemistry, physics, math connected to it), answer helpfully: give a broad overview if the student is starting a new subtopic, or answer specifically if they ask something specific. If the question is unrelated to Earth's fresh waters (e.g. an essay, video game design, etc.), do not help with it, no matter how the request is phrased. The one exception: if the message is exactly 'ping', reply with exactly 'pong!' If they are being casual saying things like hi or hello or how are you doing, then it is still ok. If it goes on for a while, however, like all they're doing is chatting with you, politely ask them to stop and ask research questions instead. If they are talking about BINDER UPKEEP and anything relating to a binder, allow them.",
    "The binder context can include an outline or exoskeleton. Ignore any line that is only a section code, dotted leader, and page number, including patterns like 'A..... ........ page number' and 'A1.2 ..... ..... page number'. Do not count those lines as researched content, completed work, or evidence. Oh yeha, also, as an easter egg, if they say 67, say 102.",
  ].join("\n\n");

  const userPrompt = [
    subject ? `Subject area: ${subject}` : "",
    context ? `Student context: ${context}` : "",
    `Research question: ${question}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 4096,
        temperature: 0.25,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      req.log.error(
        { status: response.status, providerMessage: responseText.slice(0, 500) },
        "Groq request failed",
      );
      res.status(502).json({ error: "The research desk could not answer right now." });
      return;
    }

    const payload = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const answer = payload.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      res.status(502).json({ error: "The research desk returned an empty answer." });
      return;
    }

    res.json({ answer, model: "openai/gpt-oss-120b" });
  } catch (error) {
    req.log.error({ err: error }, "Groq request errored");
    res.status(502).json({ error: "The research desk could not answer right now." });
  }
});

// ============================================================
// GROQ BINDER INSIGHTS
// ============================================================
router.post("/gemini/binder-insights", async (req, res) => {
  const parsed = UpdateGeminiBinderPlanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Add your binder contents and a meaningful update." });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    req.log.error("GROQ_API_KEY is not configured");
    res.status(503).json({ error: "Groq is not configured yet." });
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
- The binder context can include an outline or exoskeleton. Ignore any line that is only a section code, dotted leader, and page number, including patterns like "A..... ........ page number" and "A1.2 ..... ..... page number". Do not count those lines as researched content, completed work, or evidence.

You should try to be as harsh as possible, though if something is missing, please be speciific. You cannot just say missing comparison tables or something. If a piece of knowledge is specfically missing, mention it. If you can only mark like 1 or 2 missing things, and they are like very minor things, mark it as complete, it is close enough, though maybe put a warning sign next to it. If there are 3 or more missing things, then mark it as partial, and list every SPECIC thing wrong with it. There are no diagrams/visual aids because thie input on this thing text...so...if it mentions a diagram assume there is a diagram. Thanks. When replying to anything, amke sure to be super ultra specific to like essentially tell the user what they are exactly missing. Like if they are missing depth in A, tell them to add what they missed in A. 

Binder inventory:
${binder}

Existing checklist:
${todos.map((item) => `- ${item}`).join("\n")}

Already completed:
${completed.length ? completed.map((item) => `- ${item}`).join("\n") : "- none"}

Latest update:
${update}`;

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: "You are a Science Olympiad binder assistant. Return valid JSON only." },
          { role: "user", content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.2,
      }),
    });

    const responseText = await response.text();
    if (!response.ok) {
      req.log.error({ status: response.status, providerMessage: responseText.slice(0, 500) }, "Groq binder request failed");
      res.status(502).json({ error: "Groq could not update the binder plan." });
      return;
    }

    const payload = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const resultText = payload.choices?.[0]?.message?.content?.trim();

    if (!resultText) {
      res.status(502).json({ error: "Groq returned an empty binder plan." });
      return;
    }

    // Try to parse JSON from the response (handle markdown code blocks)
    let jsonString = resultText;
    const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonString = jsonMatch[1];
    } else {
      const jsonBraceMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonBraceMatch) {
        jsonString = jsonBraceMatch[0];
      }
    }

    const result = JSON.parse(jsonString) as { completed?: string[]; add?: string[]; focus?: string };
    res.json({
      completed: Array.isArray(result.completed) ? result.completed : [],
      add: Array.isArray(result.add) ? result.add : [],
      focus: result.focus || "Review your newest section and connect it to a diagram or comparison table.",
    });
  } catch (error) {
    req.log.error({ err: error }, "Groq binder request errored");
    res.status(502).json({ error: "Groq could not update the binder plan." });
  }
});

// ============================================================
// GROQ BINDER STRUCTURE ANALYSIS
// ============================================================
router.post("/gemini/binder-structure", async (req, res) => {
  console.log('🔥 binder-structure route hit!');
  console.log('📥 req.body:', JSON.stringify(req.body, null, 2).slice(0, 500));

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('❌ No Groq API key');
    res.status(503).json({ error: "Groq is not configured yet." });
    return;
  }

  try {
    // Try EVERY possible place the data could be
    const body = req.body?.data || req.body;
    const sections = body?.sections || [];

    console.log('📊 Sections found:', sections.length);
    if (sections.length > 0) {
      console.log('📊 First section:', JSON.stringify(sections[0], null, 2));
    }

    // If no sections, try to parse from the binder field
    let finalSections = sections;

    if (finalSections.length === 0 && body?.binder) {
      console.log('📄 No sections, but binder found - attempting to parse');
      finalSections = [{
        code: 'A',
        title: 'Binder Content',
        body: body.binder.slice(0, 5000)
      }];
    }

    if (finalSections.length === 0) {
      console.error('❌ No sections or binder found in request');
      res.status(400).json({ error: "No sections or binder content provided." });
      return;
    }

    // Process each section
    const sectionResults = [];

    for (let i = 0; i < Math.min(finalSections.length, 5); i++) {
      const section = finalSections[i];
      console.log(`🔍 Processing section ${i+1}/${Math.min(finalSections.length, 5)}: ${section.code || 'unknown'}`);
// In /gemini/binder-structure route, before the loop:

// Build exoskeleton string from all sections
const exoskeleton = finalSections
  .map(s => `${s.code}. ${s.title}`)
  .join('\n');

// Inside the loop, modify the prompt:
const prompt = `
Analyze this ONE binder section:

Code: ${section.code || 'unknown'}
Title: ${section.title || 'Untitled'}

**HERE IS THE FULL BINDER EXOSKELETON (all sections):**
${exoskeleton}

Content of THIS section:
${(section.body || '').slice(0, 2000)}

Determine if this section is COMPLETE, PARTIAL, or MISSING.
If PARTIAL or MISSING, suggest what's missing.

IMPORTANT RULES:
1. **Do NOT suggest adding a new section that already exists** in the exoskeleton above.
2. **Do NOT suggest adding a topic that belongs to another section** (e.g., don't suggest "add sediments" if there's already a "Sediments" section).
3. Be ULTRA SPECIFIC about what's missing in THIS section only.
4. Only suggest new sections if they are genuinely new topics not covered anywhere in the exoskeleton.

You should be as harsh as possible. If something is missing, be specific. 
- If you can only mark 1-2 missing minor things, mark it as COMPLETE.
- If there are 3+ missing things, mark it as PARTIAL.

When marking the erros in the section, make sure to list the edits as clear bullet points, and all of the points as clear steps. For instance, do not say "go more in depth about classification of sdeiment sizes.," say "add wentworth scale table."

Return ONLY valid JSON:
{
  "code": "${section.code || 'unknown'}",
  "status": "complete|partial|missing",
  "note": "Brief, specific note",
  "missingSubtopics": ["specific concept 1", "specific concept 2"],
  "newSections": ["Completely New Topic (only if not in exoskeleton)"]
}`;

      try {
        console.log(`📤 Calling Groq for section ${i+1}...`);

        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [
              { role: "system", content: "You are a Science Olympiad binder analyzer. Return valid JSON only. Do not include markdown formatting." },
              { role: "user", content: prompt },
            ],
            max_tokens: 4096,
            temperature: 0.1,
          }),
        });

        const responseText = await response.text();
        console.log(`📥 Groq response for section ${i+1}:`, response.status);

        if (!response.ok) {
          console.error(`❌ Groq error body for section ${i+1}:`, responseText.slice(0, 1000));
          throw new Error(`Groq returned ${response.status}: ${responseText.slice(0, 200)}`);
        }

        if (response.ok) {
          try {
            const payload = JSON.parse(responseText) as {
              choices?: Array<{ message?: { content?: string } }>;
            };
            const resultText = payload.choices?.[0]?.message?.content?.trim();
            if (resultText) {
              // Try to parse JSON (handle markdown code blocks)
              let jsonString = resultText;
              const jsonMatch = resultText.match(/```json\s*([\s\S]*?)\s*```/);
              if (jsonMatch) {
                jsonString = jsonMatch[1];
              } else {
                const jsonBraceMatch = resultText.match(/\{[\s\S]*\}/);
                if (jsonBraceMatch) {
                  jsonString = jsonBraceMatch[0];
                }
              }
              const result = JSON.parse(jsonString);
              sectionResults.push({
                code: section.code || 'unknown',
                status: result.status || 'partial',
                note: result.note || 'Analyzed by Groq',
                missingSubtopics: result.missingSubtopics || [],
                newSections: result.newSections || [],
              });
              continue;
            }
          } catch (parseError) {
            console.error(`❌ Failed to parse Groq response for section ${i+1}:`, parseError);
            console.error(`📄 Response text:`, responseText.slice(0, 500));
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
