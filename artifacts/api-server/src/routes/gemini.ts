import { Router, type IRouter } from "express";
import { AskGeminiResearchBody } from "@workspace/api-zod";

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

export default router;