const fs = require("node:fs/promises");
const path = require("node:path");

const LOCAL_STORE = path.join(__dirname, "subscribers.local.json");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function readLocalSubscribers() {
  try {
    const raw = await fs.readFile(LOCAL_STORE, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalSubscriber(email) {
  const subscribers = await readLocalSubscribers();
  const next = [{ email, created_at: new Date().toISOString() }, ...subscribers.filter((item) => item.email !== email)];
  await fs.writeFile(LOCAL_STORE, JSON.stringify(next, null, 2), "utf8");
}

async function saveToSupabase(email) {
  const url = process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const table = process.env.SUPABASE_SUBSCRIBERS_TABLE || "waitlist";

  if (!url || !key) {
    if (process.env.VERCEL) {
      const error = new Error("Missing Supabase environment variables in Vercel.");
      error.statusCode = 503;
      throw error;
    }

    await writeLocalSubscriber(email);
    return { storage: "local" };
  }

  const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase insert failed: ${response.status} ${text}`);
  }

  return { storage: "supabase" };
}

async function handleSubscribe(email) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) {
    const error = new Error("Please enter a valid email address.");
    error.statusCode = 400;
    throw error;
  }

  const result = await saveToSupabase(normalized);
  return {
    ok: true,
    email: normalized,
    storage: result.storage,
  };
}

module.exports = {
  handleSubscribe,
};
