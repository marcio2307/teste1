import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import webpush from "web-push";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ✅ CORS liberado (GitHub Pages consegue chamar o Render)
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

// ✅ Preflight (alguns browsers exigem)
app.options("*", cors());

app.use(express.json({ limit: "1mb" }));

// ✅ Servir o painel /admin.html (pasta public)
app.use(express.static(path.join(__dirname, "public")));

// =====================
// VAPID (SEUS DADOS NO ENV DO RENDER)
// =====================
const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || "mailto:marciodoxosseo@gmail.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.warn("⚠️ VAPID keys ausentes. Configure no Render: VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY");
} else {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// =====================
// MEMÓRIA: inscritos (teste simples)
// ⚠️ zera quando Render reinicia
// =====================
let subscribers = [];

// ✅ Health check
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ✅ Ver inscritos
app.get("/api/subscribers", (req, res) => {
  res.json({ total: subscribers.length });
});

// ✅ Listar endpoints (ajuda debug)
app.get("/api/subscribers/list", (req, res) => {
  res.json({
    total: subscribers.length,
    endpoints: subscribers.map(s => s.endpoint).slice(0, 50)
  });
});

// ✅ Registrar inscrição (PWA chama via POST)
app.post("/api/subscribe", (req, res) => {
  try {
    const { subscription } = req.body || {};
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ ok: false, error: "subscription inválida" });
    }

    const exists = subscribers.some(s => s.endpoint === subscription.endpoint);
    if (!exists) subscribers.push(subscription);

    console.log("✅ Novo inscrito:", subscription.endpoint);
    console.log("📌 Total inscritos:", subscribers.length);

    res.json({ ok: true, total: subscribers.length });
  } catch (e) {
    console.error("❌ subscribe error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ✅ Enviar push para todos (painel chama)
app.post("/api/send", async (req, res) => {
  try {
    // ✅ garante VAPID configurado antes de enviar
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return res.status(500).json({
        ok: false,
        error: "VAPID não configurado no Render (VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY)."
      });
    }

    const { title, body, url, icon } = req.body || {};

    if (!subscribers.length) {
      return res.json({ ok: true, success: 0, failed: 0, total: 0 });
    }

    let success = 0;
    let failed = 0;

    // ✅ Defaults para o Cartomantes (GH Pages subpasta)
    const defaultUrl  = "https://marcio2307.github.io/cartomantesonline.site/leituras.html?pwa=true";
    const defaultIcon = "https://marcio2307.github.io/cartomantesonline.site/logo.png";

    const payload = JSON.stringify({
      title: title || "Cartomantes Online",
      body: body || "Você recebeu uma nova atualização.",
      url: (url && String(url).trim()) ? String(url).trim() : defaultUrl,
      icon: (icon && String(icon).trim()) ? String(icon).trim() : defaultIcon
    });

    for (const sub of [...subscribers]) {
      try {
        await webpush.sendNotification(sub, payload);
        success++;
      } catch (err) {
        failed++;

        const status = err?.statusCode || err?.status;
        if (status === 410 || status === 404) {
          subscribers = subscribers.filter(s => s.endpoint !== sub.endpoint);
        }

        console.error("❌ push fail:", status, err?.message || err);
      }
    }

    res.json({ ok: true, success, failed, total: subscribers.length });
  } catch (e) {
    console.error("❌ send error:", e);
    res.status(500).json({ ok: false, error: String(e) });
  }
});

// ✅ Página raiz
app.get("/", (req, res) => {
  res.send("Render API OK ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("✅ Render rodando na porta", PORT));
