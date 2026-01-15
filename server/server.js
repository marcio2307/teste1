import express from "express";
import webpush from "web-push";
import fs from "fs";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 10000;

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:you@example.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("FALTANDO ENV: VAPID_PUBLIC_KEY e/ou VAPID_PRIVATE_KEY");
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const DB_FILE = "./subscriptions.json";

function loadSubs() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf-8")); }
  catch { return []; }
}

function saveSubs(subs) {
  fs.writeFileSync(DB_FILE, JSON.stringify(subs, null, 2));
}

function sameEndpoint(a, b) {
  return a?.endpoint && b?.endpoint && a.endpoint === b.endpoint;
}

app.get("/health", (_, res) => res.json({ ok: true }));

// recebe inscrições do app
app.post("/api/subscribe", (req, res) => {
  const sub = req.body?.subscription;
  if (!sub?.endpoint) return res.status(400).send("subscription inválida");

  const subs = loadSubs();
  const exists = subs.some(s => sameEndpoint(s.subscription, sub));

  if (!exists) {
    subs.push({
      subscription: sub,
      page: req.body?.page || "",
      ua: req.body?.ua || "",
      createdAt: req.body?.createdAt || new Date().toISOString()
    });
    saveSubs(subs);
  }

  res.json({ ok: true, total: subs.length });
});

// mostra quantos inscritos existem (pro painel)
app.get("/api/subscribers", (req, res) => {
  const subs = loadSubs();
  res.json({ total: subs.length });
});

// envia push para todos os inscritos
app.post("/api/send", async (req, res) => {
  const { title, body, url, icon } = req.body || {};

  const payload = JSON.stringify({
    title: title || "Notificação",
    body: body || "Mensagem do painel",
    url: url || "https://marcio2307.github.io/teste/app.html",
    icon: icon || "https://marcio2307.github.io/teste/logo.png"
  });

  let subs = loadSubs();
  let success = 0;
  let failed = 0;

  for (const item of subs) {
    try {
      await webpush.sendNotification(item.subscription, payload);
      success++;
    } catch (err) {
      failed++;
      const code = err?.statusCode;

      // remove inválidos automaticamente
      if (code === 410 || code === 404) {
        subs = subs.filter(s => !sameEndpoint(s.subscription, item.subscription));
      }
    }
  }

  saveSubs(subs);
  res.json({ ok: true, success, failed, totalNow: subs.length });
});

app.listen(PORT, () => console.log("Servidor rodando na porta", PORT));
