/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "15mb" }));

  // Lazy initialize Gemini client to avoid crashes if GEMINI_API_KEY is initially missing
  let aiClient: GoogleGenAI | null = null;
  function getAiClient(): GoogleGenAI {
    if (!aiClient) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required but missing.");
      }
      aiClient = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClient;
  }

  // Wrapper function to call Gemini with robust retries and model rotation in case of 503 / 429 / UNAVAILABLE / High Demand errors
  async function generateContentWithRetry(
    ai: GoogleGenAI,
    options: {
      model: string;
      contents: any;
      config?: any;
    }
  ) {
    const modelsToTry = [
      options.model,
      "gemini-2.5-flash",
      "gemini-1.5-flash",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-latest"
    ];
    
    // Deduplicate models to try
    const uniqueModels = Array.from(new Set(modelsToTry));

    let lastError: any = null;

    for (const model of uniqueModels) {
      const maxRetries = 2;
      let delay = 1000; // start with 1000ms delay for backoff to give server time to breathe

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          console.log(`Calling Gemini API (${model}) - Attempt ${attempt}/${maxRetries}`);
          return await ai.models.generateContent({
            ...options,
            model: model
          });
        } catch (err: any) {
          lastError = err;
          const errMsg = err?.message || JSON.stringify(err) || "";
          const errStatus = err?.status || err?.code || 0;
          
          console.warn(`[Model: ${model}, Attempt ${attempt}/${maxRetries}] Gemini call failed:`, errMsg);

          const isTransient = 
            errStatus === 503 || 
            errStatus === 429 || 
            errMsg.includes("503") || 
            errMsg.includes("429") || 
            errMsg.toLowerCase().includes("unavailable") || 
            errMsg.toLowerCase().includes("high demand") ||
            errMsg.toLowerCase().includes("temporary") ||
            errMsg.toLowerCase().includes("overloaded");

          if (!isTransient) {
            // Non-transient error, fail immediately to prevent waiting for invalid requests (e.g. format issues)
            throw err;
          }

          if (attempt < maxRetries) {
            console.log(`Transient error. Waiting ${delay}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      }
      console.warn(`Model ${model} failed after retries. Moving to next available model in the sequence...`);
    }

    // If we exhausted all fallback models and retries, throw a friendly error message for high demand
    const isServiceUnavailable = 
      lastError?.status === 503 || 
      lastError?.status === 429 || 
      (lastError?.message && (
        lastError.message.includes("503") || 
        lastError.message.includes("429") || 
        lastError.message.toLowerCase().includes("unavailable") || 
        lastError.message.toLowerCase().includes("high demand") ||
        lastError.message.toLowerCase().includes("overloaded")
      ));

    if (isServiceUnavailable) {
      throw new Error("Gemini is currently experiencing very high demand. Please wait a few seconds and try clicking 'Compile Study Sprint' again.");
    }

    throw lastError || new Error("Gemini generation failed after trying all fallback models.");
  }

  // API endpoints
  app.post("/api/generate-sprint", async (req, res) => {
    try {
      const { notesText, quizCount } = req.body;
      if (!notesText) {
        return res.status(400).json({ error: "No study notes provided" });
      }

      const qCount = parseInt(quizCount) || 5;
      const ai = getAiClient();

      const prompt = `You are an expert high-yield medical and technical academic tutor. Analyze these study notes and generate a comprehensive set of concept flashcards (between 5 and 10), a set of high-yield word acronym mnemonic card objects (between 3 and 6), and an active question assessment layout of exactly ${qCount} multiple choice questions.

Study notes:
${notesText}

CRITICAL MNEMONIC ACROSTICS/ACRONYMS RULES:
1. The acrostic or acronym keyword itself (the 'front' of the mnemonic card) MUST be a real, meaningful single word or short phrase (e.g. "HEAL", "FLOW", "FAST", "CRASH").
2. On the back of the card, provide a clean acrostic breakdown. Start each line with the letter wrapped in bold HTML tags, like <strong>H</strong> = Heart Rate, <strong>E</strong> = Energy levels, etc. Every item must be separated with a line break <br/>. Do not chop words across lines. Ensure it is beautifully structured.`;

      const response = await generateContentWithRetry(ai, {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              flashcards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    front: { type: Type.STRING, description: "Clear core concept title, question, or landmark term" },
                    back: { type: Type.STRING, description: "Detailed, high-yield bulleted summary explanation" },
                  },
                  required: ["front", "back"],
                },
              },
              mnemonics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    front: { type: Type.STRING, description: "Acronym/Acrostic Word (e.g. HEART)" },
                    back: { type: Type.STRING, description: "Broken down bullet list starting with <strong>LETTER</strong> = Statement followed by <br/>" },
                  },
                  required: ["front", "back"],
                },
              },
              quiz: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING, description: "The multiple choice question based on the content" },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: "Exactly 4 unique logical option answers",
                    },
                    correctAnswer: { type: Type.STRING, description: "The option that is the exact correct answer" },
                    explanation: { type: Type.STRING, description: "Detailed, informative feedback explaining why it is correct" },
                  },
                  required: ["question", "options", "correctAnswer", "explanation"],
                },
              },
            },
            required: ["flashcards", "mnemonics", "quiz"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsedData = JSON.parse(responseText.trim());
      res.json(parsedData);
    } catch (err: any) {
      console.error("Gemini Generation Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate study sprint" });
    }
  });

  app.post("/api/generate-more-questions", async (req, res) => {
    try {
      const { notesText } = req.body;
      if (!notesText) {
        return res.status(400).json({ error: "No study notes provided" });
      }

      const ai = getAiClient();
      const prompt = `Review these study notes and generate exactly 3 fresh, unique multiple choice questions. Do not duplicate basic questions.

Study notes:
${notesText}`;

      const response = await generateContentWithRetry(ai, {
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              quiz: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctAnswer: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                  },
                  required: ["question", "options", "correctAnswer", "explanation"],
                },
              },
            },
            required: ["quiz"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("Empty response from Gemini API");
      }

      const parsedData = JSON.parse(responseText.trim());
      res.json(parsedData);
    } catch (err: any) {
      console.error("Gemini Extension Error:", err);
      res.status(500).json({ error: err.message || "Failed to generate extra questions" });
    }
  });

  // Serve static assets & route UI requests
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
