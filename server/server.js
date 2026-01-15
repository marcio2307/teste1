import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

/* ===========================
   CORS (GitHub Pages → Render)
=========================== */
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json({ limit: "1mb" }));

/* ===========================
   Painel estático (/admin.html)
=========================== */
app.use(express.static(path.join(__dirname, "public")));

/* ===========================
   VAPID (lido do Render ENV)
=========================== */
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || "mailto:admin@cartomantesonline.site";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn("⚠️ VAPID KEYS NÃO CONFIGURADAS NO RENDER");
} else {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log("✅ VAPID configurado com sucesso");
}

/* ===========================
   MEMÓRIA (RAM)
   Obs: reinicia se o Render reiniciar
=========================== */
let subscribers = [];

/* ===========================
   HEALTH CHECK
=========================== */
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

/* ===========================
   TOTAL DE INSCRITOS
=========================== */
app.get("/api/subscribers", (req, res) => {
  res.json({ total: subscribers.length });
});

/* ===========================
   REGISTRAR SUBSCRIBER (PWA)
=========================== */
app.post("/api/subscribe", (req, res) => {
  try {
    const { subscription } = req.body || {};

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: "subscription inválida" });
    }

    const exists = subscribers.some(s => s.endpoint === subscription.endpoint);
    if (!exists) {
      subscribers.push(subscription);
      console.log("✅ Novo inscrito:", subscription.endpoint);
    }

    res.json({ ok: true, total: subscribers.length });
  } catch (err) {
    console.error("❌ subscribe error:", err);
    res.status(500).json({ ok: false });
  }
});

/* ===========================
   ENVIAR PUSH (PAINEL)
=========================== */
app.post("/api/send", async (req, res) => {
  try {
    if (!subscribers.length) {
      return res.json({ ok: true, success: 0, failed: 0, total: 0 });
    }

    const { title, body, url, icon } = req.body || {};

    const payload = JSON.stringify({
      title: title || "Cartomantes Online",
      body: body || "Você recebeu uma nova atualização.",
      url: url || "https://marcio2307.github.io/cartomantesonline.site/leituras.html?pwa=true",
      icon: icon || "https://marcio2307.github.io/cartomantesonline.site/logo.png"
    });

    let success = 0;
    let failed = 0;

    for (const sub of [...subscribers]) {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
      } catch (err) {
        failed++;

        const status = err?.statusCode || err?.status;
        if (status === 404 || status === 410) {
          subscribers = subscribers.filter(s => s.endpoint !== sub.endpoint);
        }

        console.error("❌ Push falhou:", status);
      }
    }

    res.json({
      ok: true,
      success,
      failed,
      total: subscribers.length
    });

  } catch (err) {
    console.error("❌ send error:", err);
    res.status(500).json({ ok: false });
  }
});

/* ===========================
   ROOT
=========================== */
app.get("/", (req, res) => {
  res.send("Render Push Server OK ✅");
});

/* ===========================
   START
=========================== */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Render rodando na porta", PORT);
});
