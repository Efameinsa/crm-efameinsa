// Los tres leads de prueba que la web disparó por el circuito completo
// (web → /api/leads → bandeja): qué guardó el CRM y con qué chip los ve
// Central. Se borran al final (son reales, no es_prueba).
//   node --env-file=.env.local scripts/_verificar-circuito-web.mjs PRO-09295 PRO-09296 PRO-09297
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Users/diseno/AppData/Local/Google/Chrome/Application/chrome.exe";
const PUPPETEER = "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/9777f871-38bc-4fdf-87c7-a83b0fa8cd1e/scratchpad/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

const [organico, landing, braid] = process.argv.slice(2);
const { data: filas } = await admin.from("leads").select("id, codigo, nombre_contacto, canal, fuente, gclid, gbraid, wbraid, fbclid, utm_source, utm_medium, utm_campaign, estado, recibido_por").in("codigo", [organico, landing, braid]);
const por = Object.fromEntries((filas ?? []).map((f) => [f.codigo, f]));

console.log("Lo que guardó el CRM:");
af("los tres entraron y son PRUEBA CIRCUITO WEB en la bandeja", filas?.length === 3 && filas.every((f) => /PRUEBA CIRCUITO WEB/i.test(f.nombre_contacto ?? "") && f.estado === "pendiente_triaje" && f.recibido_por === null));
af(`${organico}: sitio, sin clic`, por[organico]?.fuente === "web · sitio · contacto" && !por[organico]?.gclid && !por[organico]?.gbraid && !por[organico]?.utm_medium, JSON.stringify({ fuente: por[organico]?.fuente, medio: por[organico]?.utm_medium }));
af(`${landing}: landing con gclid y utm`, por[landing]?.fuente?.startsWith("web · landing") && por[landing]?.gclid === "PRUEBAgclid" && por[landing]?.utm_medium === "cpc" && por[landing]?.utm_campaign === "Prueba", JSON.stringify({ fuente: por[landing]?.fuente, gclid: por[landing]?.gclid }));
af(`${braid}: sitio con gbraid guardado en su columna`, por[braid]?.fuente === "web · sitio · contacto" && por[braid]?.gbraid === "PRUEBAgbraid" && !por[braid]?.gclid, JSON.stringify({ gbraid: por[braid]?.gbraid, gclid: por[braid]?.gclid }));

async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" }));
}
const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  console.log("\nCómo los ve Central:");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 1600 });
  await p.setCookie(...(await sesion("central@efameinsa.com")));
  await p.goto(`${BASE}/central`, { waitUntil: "networkidle0", timeout: 120000 });
  const tarjeta = (codigo) => p.evaluate((c) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(c));
    return el ? { texto: el.innerText, clase: el.className } : null;
  }, codigo);
  const o = await tarjeta(organico);
  af(`${organico} → chip verde «Web · orgánico», sin urgencia`, /Web · orgánico/.test(o?.texto ?? "") && !/Gestionar a la brevedad/i.test(o?.texto ?? ""));
  const l = await tarjeta(landing);
  af(`${landing} → «Landing de campaña · Google Ads · Prueba», urgente, en azul`, /Landing de campaña · Google Ads/.test(l?.texto ?? "") && /· Prueba/.test(l?.texto ?? "") && /Gestionar a la brevedad/i.test(l?.texto ?? "") && /border-sky-400/.test(l?.clase ?? ""));
  const b = await tarjeta(braid);
  af(`${braid} → «Web · vino de Google Ads» por el gbraid, urgente`, /Web · vino de Google Ads/.test(b?.texto ?? "") && /Gestionar a la brevedad/i.test(b?.texto ?? "") && /border-sky-400/.test(b?.clase ?? ""));
  await p.screenshot({ path: "scripts/data/_pantallazos/central-circuito-web.png", fullPage: true });
} finally {
  await navegador.close();
  const ids = (filas ?? []).map((f) => f.id);
  if (ids.length) await admin.from("leads").delete().in("id", ids);
  console.log(`\nBorrados del CRM: ${(filas ?? []).map((f) => f.codigo).join(", ")}.`);
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
