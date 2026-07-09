import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;
function getAi() {
  if (!aiClient) {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is missing");
    }
    aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return aiClient;
}

const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB limit
  }
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Habilitar CORS para poder consumir la API desde cualquier lugar
  app.use(cors());

  // Add JSON parsing for regular routes if needed
  app.use(express.json());

  // API Route for auditing
  app.post("/api/audit", (req, res, next) => {
    upload.single("audio")(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ error: `Error subiendo archivo: ${err.message}` });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const { script, expectedCategory, objections, availableCategories } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "Audio file is required." });
      }
      if (!script) {
        return res.status(400).json({ error: "Script is required." });
      }
      if (!expectedCategory) {
        return res.status(400).json({ error: "Expected category (tipificación) is required." });
      }
      if (!availableCategories) {
        return res.status(400).json({ error: "Available categories are required." });
      }

      const ai = getAi();
      const base64Audio = file.buffer.toString("base64");
      
      const prompt = `Eres un auditor experto en calidad (QA) de call centers.
Escucha el audio de esta llamada de servicio al cliente.

Tu tarea es:
1. Verificar si el operador siguió la estructura general y los puntos clave de este guión (no es necesario que sea al pie de la letra, puede omitir saludos robóticos o partes que fluyan natural en la conversación, pero no la esencia):
GUIÓN: """${script}"""

2. Evaluar el manejo de objeciones por parte del operador (si el cliente presentó objeciones). Guíate por esto:
OBJECIONES ESPERADAS Y SU MANEJO: """${objections || 'Ninguna pauta específica de objeciones proporcionada.'}"""

3. Verificar si la tipificación dada por el operador es correcta. Para evaluar esto, compara lo que ocurrió en la llamada con la lista de tipificaciones posibles.
TIPIFICACIONES DISPONIBLES (Nombre: Descripción): 
"""${availableCategories}"""
TIPIFICACIÓN DADA POR EL OPERADOR (A verificar): "${expectedCategory}"

Evalúa el desempeño y devuelve un objeto JSON con la siguiente estructura. TODAS LAS RESPUESTAS DEBEN ESTAR EN ESPAÑOL.
{
  "scriptFollowed": boolean,
  "scriptDeviations": string[], // lista de desviaciones u omisiones IMPORTANTES (en español)
  "objectionsHandled": boolean, // true si manejó bien la objeción o si no hubo objeciones
  "objectionsFeedback": string, // comentarios sobre las objeciones presentadas por el cliente y cómo se manejaron (en español)
  "categoryCorrect": boolean, // true si la tipificación dada es correcta según las opciones
  "actualCategory": string, // La tipificación CORRECTA de la lista
  "feedback": string // comentarios generales para el operador (en español)
}

Concéntrate estrictamente en extraer los hechos del audio y compararlos con las instrucciones proporcionadas. Devuelve SOLO el objeto JSON.`;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                inlineData: {
                  mimeType: file.mimetype || "audio/mp3",
                  data: base64Audio
                }
              },
              { text: prompt }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        }
      });

      let reportText = response.text;
      
      if (!reportText) {
        throw new Error("Empty response from model");
      }

      // Clean up markdown block if present
      reportText = reportText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();

      const report = JSON.parse(reportText);
      res.json(report);

    } catch (error: any) {
      console.error("Error analyzing call:", error);
      res.status(500).json({ error: error.message || "An error occurred during analysis." });
    }
  });

  // Global JSON Error handler for API routes
  app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  // Vite middleware for development
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
