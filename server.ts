import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import fs from "fs/promises";
import crypto from "crypto";
import * as XLSX from "xlsx";

const jobs: Record<string, { status: 'processing' | 'completed' | 'failed', results?: any[], error?: string, generalSummary?: string, preparedItems?: any[] }> = {};

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
  limits: { fileSize: 20 * 1024 * 1024 }
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
  if (!response.ok) throw new Error(`Error descargando audio: ${response.statusText}`);
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

async function runBackgroundAnalysis(jobId: string) {
  try {
    const job = jobs[jobId];
    if (!job || !job.preparedItems) return;

    const config = await readConfig();
    const ai = getAi();
    const results: any[] = [];

    // Process in batches of 5
    for (let i = 0; i < job.preparedItems.length; i += 5) {
      if (i > 0) {
        console.log(`Waiting 3 minutes before processing batch starting at ${i}...`);
        await new Promise(resolve => setTimeout(resolve, 180000));
      }

      const batch = job.preparedItems.slice(i, i + 5);
      const batchResults = await Promise.all(batch.map(async (item) => {
        let retries = 10;
        let delay = 10000; // Start with 10s

        while (retries > 0) {
          try {
            const prompt = `Eres un auditor experto en calidad (QA) de call centers.
1. GUIÓN GENERAL: """${config.script}"""
2. MANEJO DE OBJECIONES: """${config.objections}"""
3. TIPIFICACIONES DISPONIBLES: """${config.categories}"""
TIPIFICACIÓN DADA POR EL OPERADOR: "${item.expectedCategory}"

Evalúa el desempeño y devuelve JSON:
{
  "scriptFollowed": boolean,
  "checklist": { "saludoInicial": boolean, "identificacionCliente": boolean, "presentacionCompania": boolean, "mencionaNotificacion": boolean, "explicaPrograma": boolean, "manejoObjecion": boolean },
  "shortSummary": "Resumen breve.",
  "categoryCorrect": boolean,
  "actualCategory": "Nombre de la categoría"
}
Responde SOLO con JSON en español.`;

            const response = await ai.models.generateContent({
              model: "gemini-3.1-flash-lite",
              contents: [{ role: "user", parts: [{ inlineData: { mimeType: item.mimeType, data: item.base64Audio } }, { text: prompt }] }],
              config: { responseMimeType: "application/json", temperature: 0.1, }
            });

            let reportText = response.text || "{}";
            reportText = reportText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
            return { success: true, item, report: JSON.parse(reportText) };
          } catch (err: any) {
            if (err.status === 503 && retries > 1) {
              console.warn(`Model busy (503), retrying in ${delay}ms...`);
              await new Promise(resolve => setTimeout(resolve, delay));
              retries--;
              delay *= 2; // Exponential backoff
            } else {
              return { success: false, item, error: err.message };
            }
          }
        }
        return { success: false, item, error: "Exceeded retries due to high demand." };
      }));
      results.push(...batchResults);
    }

    const validResults = results.filter(r => r.success && r.report);
    let generalSummary = "";
    if (validResults.length > 0) {
      const summaryPrompt = `Eres supervisor. Evalúa estas ${validResults.length} llamadas: ${JSON.stringify(validResults.map(r => r.report))}. Genera un resumen y porcentaje de efectividad. Texto plano.`;
      const summaryResponse = await ai.models.generateContent({ model: "gemini-3.1-flash-lite", contents: summaryPrompt });
      generalSummary = summaryResponse.text || "No se pudo generar resumen.";
    }

    jobs[jobId] = { status: 'completed', results, generalSummary };
  } catch (error: any) {
    jobs[jobId] = { status: 'failed', error: error.message };
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(cors());
  app.use(express.json());

  app.get("/api/config", async (req, res) => res.json(await readConfig()));
  app.post("/api/config", async (req, res) => {
    try {
      const { script, objections, categories } = req.body;
      if (script !== undefined) await fs.writeFile(path.join(CONFIG_DIR, "script.txt"), script);
      if (objections !== undefined) await fs.writeFile(path.join(CONFIG_DIR, "objections.txt"), objections);
      if (categories !== undefined) await fs.writeFile(path.join(CONFIG_DIR, "categories.txt"), categories);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.post("/api/audit-batch", upload.array("audios", 90), async (req, res) => {
    try {
      const config = await readConfig();
      const items = JSON.parse(req.body.items || "[]");
      const files = req.files as Express.Multer.File[] || [];
      const preparedItems = await Promise.all(items.map(async (item: any) => {
        let base64Audio = "";
        let mimeType = "audio/mp3";
        if (item.type === "url") { base64Audio = await fetchAudioAsBase64(item.url); }
        else if (item.type === "file") {
          const file = files[item.fileIndex];
          base64Audio = file.buffer.toString("base64");
          mimeType = file.mimetype;
        }
        return { ...item, base64Audio, mimeType };
      }));
      const jobId = crypto.randomUUID();
      jobs[jobId] = { status: 'processing', preparedItems };
      runBackgroundAnalysis(jobId);
      res.json({ jobId });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  app.get("/api/job-status/:id", (req, res) => {
    const job = jobs[req.params.id];
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  app.get("/api/download-report/:id", (req, res) => {
    const job = jobs[req.params.id];
    if (!job || job.status !== 'completed' || !job.results) return res.status(400).json({ error: "Job not completed" });
    const wsData = job.results.map((r: any) => ({
      "Operador": r.item.operatorName || "N/A", "Archivo/URL": r.item.sourceName, "Tipificación Esperada": r.item.expectedCategory,
      "Script Seguido": r.report.scriptFollowed ? "Sí" : "No", "Categoría Correcta": r.report.categoryCorrect ? "Sí" : "No",
      "Categoría Real": r.report.actualCategory, "Resumen": r.report.shortSummary
    }));
    wsData.push({ "Operador": "RESUMEN GENERAL", "Archivo/URL": "", "Tipificación Esperada": "", "Script Seguido": "", "Categoría Correcta": "", "Categoría Real": "", "Resumen": job.generalSummary || "" });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(wsData), "Resultados");
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_auditoria.xlsx"');
    res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
  });

  app.use("/api", (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => res.sendFile(path.join(process.cwd(), "dist", "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => console.log(`Server running on http://localhost:${PORT}`));
}

startServer();
