import { Router, type IRouter } from "express";
import {
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
    "You are a careful research assistant for a Science Olympiad student.",
    "Answer the question clearly and accurately at an advanced high-school level.",
    "Separate established facts from reasonable interpretation.",
    "Do not invent citations, URLs, experiments, or numerical values.",
    "When useful, suggest what kind of primary source the student should verify.",
    "Use short headings and concise paragraphs. End with a section titled Verification checklist.",
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

export default router;