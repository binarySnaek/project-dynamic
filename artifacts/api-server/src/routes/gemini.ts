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
    "Hello gemini, the user has asked a question. If they are starting a new subtopic/topic that they do not know anything about, give them a braod overview of as many topics as you can. If they are asking a specific question, answer it as accurately as you can. Thank you. " ,
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

export default router;