import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";

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

const CONFIG_DIR = path.join(process.cwd(), "config");

async function readConfig() {
  try {
    const script = await fs.readFile(path.join(CONFIG_DIR, "script.txt"), "utf-8");
    const objections = await fs.readFile(path.join(CONFIG_DIR, "objections.txt"), "utf-8");
    const categories = await fs.readFile(path.join(CONFIG_DIR, "categories.txt"), "utf-8");
    return { script, objections, categories };
  } catch (error) {
    console.error("Error reading config files:", error);
    return { script: "", objections: "", categories: "" };
  }
}

async function fetchAudioAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Error descargando audio de URL: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Habilitar CORS para poder consumir la API desde cualquier lugar
  app.use(cors());

  // Add JSON parsing for regular routes if needed
  app.use(express.json());

  // Endpoint to get config
  app.get("/api/config", async (req, res) => {
    const config = await readConfig();
    res.json(config);
  });

  // Endpoint to update config
  app.post("/api/config", async (req, res) => {
    try {
      const { script, objections, categories } = req.body;
      if (script !== undefined) await fs.writeFile(path.join(CONFIG_DIR, "script.txt"), script);
      if (objections !== undefined) await fs.writeFile(path.join(CONFIG_DIR, "objections.txt"), objections);
      if (categories !== undefined) await fs.writeFile(path.join(CONFIG_DIR, "categories.txt"), categories);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Batch API Route for auditing up to 10 files/urls
  app.post("/api/audit-batch", (req, res, next) => {
    upload.array("audios", 10)(req, res, (err) => {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).json({ error: `Error subiendo archivo: ${err.message}` });
      }
      next();
    });
  }, async (req, res) => {
    try {
      const config = await readConfig();
      if (!config.script || !config.categories) {
        return res.status(400).json({ error: "Falta configurar el guión o las tipificaciones en el servidor (archivos en carpeta config/)." });
      }

      let items: any[] = [];
      try {
        items = JSON.parse(req.body.items || "[]");
      } catch (e) {
        return res.status(400).json({ error: "Formato de items inválido." });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: "No se proporcionaron llamadas para auditar." });
      }
      if (items.length > 10) {
        return res.status(400).json({ error: "Máximo 10 llamadas por solicitud." });
      }

      const files = req.files as Express.Multer.File[] || [];
      const ai = getAi();

      const results: any[] = [];
      const batchSize = 5;
      
      for (let i = 0; i < items.length; i += batchSize) {
        if (i > 0) {
          // Wait 60 seconds before processing the next batch to avoid rate limits
          console.log(`Waiting 60 seconds before processing batch ${Math.floor(i / batchSize) + 1}...`);
          await new Promise(resolve => setTimeout(resolve, 60000));
        }

        const batch = items.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map(async (item) => {
          try {
            if (!item.expectedCategory) {
              throw new Error("Tipificación esperada es requerida.");
            }

            let base64Audio = "";
            let mimeType = "audio/mp3";
            let sourceName = "";

            if (item.type === "url") {
              if (!item.url) throw new Error("URL de audio es requerida.");
              base64Audio = await fetchAudioAsBase64(item.url);
              sourceName = item.url;
            } else if (item.type === "file") {
              const fileIndex = item.fileIndex;
              if (fileIndex === undefined || !files[fileIndex]) {
                 throw new Error("Archivo de audio no encontrado en la solicitud.");
              }
              base64Audio = files[fileIndex].buffer.toString("base64");
              mimeType = files[fileIndex].mimetype || "audio/mp3";
              sourceName = files[fileIndex].originalname;
            } else {
              throw new Error("Tipo de item inválido. Debe ser 'url' o 'file'.");
            }

            // Agregamos el nombre original al item para uso en el frontend
            item.sourceName = sourceName;

            const prompt = `Eres un auditor experto en calidad (QA) de call centers.
1. GUIÓN GENERAL:
"""${config.script}"""

2. MANEJO DE OBJECIONES:
"""${config.objections}"""

3. TIPIFICACIONES DISPONIBLES: 
"""${config.categories}"""

TIPIFICACIÓN DADA POR EL OPERADOR (A verificar): "${item.expectedCategory}"

Evalúa el desempeño y devuelve un objeto JSON muy corto y directo con esta estructura:
{
  "scriptFollowed": boolean, // ¿Cumplió lo principal del guión?
  "checklist": {
    "saludoInicial": boolean,
    "identificacionCliente": boolean,
    "presentacionCompania": boolean,
    "mencionaNotificacion": boolean,
    "explicaPrograma": boolean,
    "manejoObjecion": boolean
  },
  "shortSummary": "Breve resumen de 2 a 3 líneas del desempeño.",
  "categoryCorrect": boolean, // ¿La tipificación dada es correcta?
  "actualCategory": "Nombre de la categoría correcta de la lista"
}

Devuelve SOLO el objeto JSON. TODAS LAS RESPUESTAS EN ESPAÑOL.`;

            const response = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: [
                {
                  role: "user",
                  parts: [
                    {
                      inlineData: {
                        mimeType: mimeType,
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
            if (!reportText) throw new Error("Respuesta vacía del modelo");
            
            reportText = reportText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            const report = JSON.parse(reportText);

            return { success: true, item, report };
          } catch (err: any) {
             return { success: false, item, error: err.message };
          }
        }));
        
        results.push(...batchResults);
      }

      const validResults = results.filter(r => r.success && r.report);
      let generalSummary = "";
      if (validResults.length > 0) {
        const summaryPrompt = `Eres un supervisor de call center. Revisa los resultados de auditoría de estas ${validResults.length} llamadas de un mismo operador:
${JSON.stringify(validResults.map(r => r.report))}

Genera un resumen general MUY CORTO (máximo 4 líneas) evaluando si el operador realizó bien el trabajo en general.
Incluye un "Porcentaje de efectividad" estimado (0-100%) basado en cuántos checks cumplió y si acertó las tipificaciones.
Menciona 1 o 2 posibles mejoras a considerar para este operador.
Devuelve tu respuesta en texto plano (sin markdown ni JSON).`;

        try {
          const summaryResponse = await ai.models.generateContent({
              model: "gemini-2.5-flash",
              contents: summaryPrompt,
          });
          generalSummary = summaryResponse.text || "No se pudo generar el resumen general.";
        } catch (e) {
          generalSummary = "Error generando el resumen general.";
        }
      }

      res.json({ results, generalSummary });

    } catch (error: any) {
      console.error("Error analyzing batch:", error);
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
