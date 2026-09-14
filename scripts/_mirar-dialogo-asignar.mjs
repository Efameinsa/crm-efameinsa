// Abre la bandeja como Central, pulsa «Asignar» en un contacto y muestra lo
// que dice el diálogo (coincidencias, quién es el dueño). Solo mira: no deriva.
//   node --env-file=.env.local scripts/_mirar-dialogo-asignar.mjs PRO-09332
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Users/diseno/AppData/Local/Google/Chrome/Application/chrome.exe";
const PUPPETEER = "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/9777f871-38bc-4fdf-87c7-a83b0fa8cd1e/scratchpad/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CODIGO = process.argv[2];

const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: "central@efameinsa.com" });
const jar = new Map();
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
const cookies = [...jar.entries()].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" }));

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const nav = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const p = await nav.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.setCookie(...cookies);
  await p.goto(`${BASE}/central`, { waitUntil: "networkidle0", timeout: 120000 });
  const tarjeta = await p.evaluate((c) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(c));
    return el ? el.innerText : null;
  }, CODIGO);
  console.log("TARJETA:\n" + (tarjeta ?? "(no está en la bandeja)"));
  const pulsado = await p.evaluate((c) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(c));
    const b = [...(el?.querySelectorAll("button") ?? [])].find((x) => x.textContent.trim() === "Asignar");
    b?.click();
    return Boolean(b);
  }, CODIGO);
  if (!pulsado) { console.log("no hay botón Asignar"); }
  else {
    await p.waitForSelector("[role=dialog]", { timeout: 15000 });
    await new Promise((r) => setTimeout(r, 4000));
    const dialogo = await p.evaluate(() => document.querySelector("[role=dialog]")?.innerText ?? "");
    console.log("\nDIÁLOGO:\n" + dialogo);
    await p.screenshot({ path: `scripts/data/_pantallazos/dialogo-asignar-${CODIGO}.png` });
  }
} finally {
  await nav.close();
}
