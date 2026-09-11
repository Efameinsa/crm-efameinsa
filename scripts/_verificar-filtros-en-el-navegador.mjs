// Las pantallas cuyos filtros pasaron al navegador el 11-09 —ruta de
// mantenimiento, equipos instalados, atenciones—, probadas en un Chrome real
// con la sesión de quien las usa: cada clic de filtro tiene que resolverse
// en milisegundos y sin volver al servidor.
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-filtros-en-el-navegador.mjs
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

async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" }));
}

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });

// Un clic sobre el botón cuyo texto empieza así; devuelve ms y pedidos reales
// al servidor (sin los prefetch de enlaces, que no son «volver al servidor»).
async function clic(pagina, empiezaCon, contadorSelector) {
  let pedidos = 0;
  const oir = (r) => { const h = r.headers(); if (r.url().startsWith(BASE) && r.resourceType() !== "image" && !h["next-router-prefetch"] && !/[?&]_rsc=/.test(r.url())) pedidos++; };
  pagina.on("request", oir);
  const antes = await pagina.evaluate((s) => document.querySelector(s)?.textContent ?? "", contadorSelector);
  const t0 = Date.now();
  const hizo = await pagina.evaluate((txt) => { const b = [...document.querySelectorAll("button")].find((x) => (x.textContent ?? "").trim().startsWith(txt)); if (!b) return false; b.click(); return true; }, empiezaCon);
  await pagina.waitForFunction((s, a) => (document.querySelector(s)?.textContent ?? "") !== a, { timeout: 3000 }, contadorSelector, antes).catch(() => {});
  const ms = Date.now() - t0;
  await new Promise((r) => setTimeout(r, 250));
  pagina.off("request", oir);
  return { hizo, ms, pedidos, texto: await pagina.evaluate((s) => (document.querySelector(s)?.textContent ?? "").trim().slice(0, 60), contadorSelector) };
}

async function abrir(cookies, ruta) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1280, height: 900 });
  await pagina.setCookie(...cookies);
  const t0 = Date.now();
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: "networkidle0", timeout: 120000 });
  return { pagina, ms: Date.now() - t0 };
}

// ── Ruta de mantenimiento (PV1) ─────────────────────────────────────────────
console.log("Ruta de mantenimiento (Ariana):");
const pv1 = await sesion("postventa1@efameinsa.com");
{
  const { pagina, ms } = await abrir(pv1, "/comercial/ruta");
  af("abre", (await pagina.$$("a[href^='/comercial/oportunidades/']")).length > 0, `${ms} ms`);
  const r1 = await clic(pagina, "Llamados", "body");
  af("cambiar de pestaña es instantáneo y sin servidor", r1.hizo && r1.ms < 400 && r1.pedidos === 0, `${r1.ms} ms · ${r1.pedidos} pedidos`);
  af("la URL refleja la pestaña", pagina.url().includes("ver=llamados"), pagina.url().replace(BASE, ""));
  await clic(pagina, "Por llamar", "body");
  const r2 = await clic(pagina, "Nunca le hicimos", "body");
  af("la tanda «Nunca le hicimos mantenimiento» filtra sin servidor", r2.hizo && r2.pedidos === 0 && pagina.url().includes("mant=nunca"), `${r2.ms} ms · ${pagina.url().replace(BASE, "")}`);
  const r3 = await clic(pagina, "Sin teléfono", "body");
  af("«Sin teléfono» se cruza con la tanda", r3.hizo && pagina.url().includes("tel=sin") && pagina.url().includes("mant=nunca"), pagina.url().replace(BASE, ""));
  await pagina.close();
  // La pestaña del tablero, que muestra la misma ruta con otro hrefBase.
  const { pagina: p2 } = await abrir(pv1, "/comercial/oportunidades?modo=ruta&ver=cerrados");
  af("también dentro de Mis oportunidades (modo=ruta)", (await p2.$$("button")).length > 5 && p2.url().includes("modo=ruta"));
  await p2.close();
}

// ── Equipos instalados y atenciones (Rubí) ─────────────────────────────────
console.log("\nEquipos instalados (Rubí):");
const pv = await sesion("postventa@efameinsa.com");
{
  const { pagina, ms } = await abrir(pv, "/postventa/equipos");
  const n0 = (await pagina.$$("a[href^='/postventa/equipos/']")).length;
  af("abre con la primera tanda", n0 > 0 && n0 <= 40, `${n0} máquinas en ${ms} ms`);
  const r = await clic(pagina, "En garantía", "body");
  af("filtrar «En garantía» es instantáneo y sin servidor", r.hizo && r.ms < 400 && r.pedidos === 0 && pagina.url().includes("ver=garantia"), `${r.ms} ms · ${r.pedidos} pedidos`);
  let pedidos = 0; const oir = (q) => { if (q.url().startsWith(BASE) && !/[?&]_rsc=/.test(q.url()) && !q.headers()["next-router-prefetch"] && q.resourceType() !== "image") pedidos++; };
  pagina.on("request", oir);
  await pagina.type("input[type=search]", "LAV");
  await new Promise((r) => setTimeout(r, 300));
  pagina.off("request", oir);
  af("buscar escribe la URL y no va al servidor", pagina.url().includes("q=LAV") && pedidos === 0, `${pedidos} pedidos · ${pagina.url().replace(BASE, "")}`);
  await pagina.close();
}
console.log("\nAtenciones (Rubí):");
{
  const { pagina, ms } = await abrir(pv, "/postventa/atenciones");
  af("abre", ms > 0, `${ms} ms`);
  const r = await clic(pagina, "Sin atender", "body");
  af("el filtro «Sin atender» es instantáneo y sin servidor", r.hizo && r.ms < 400 && r.pedidos === 0 && pagina.url().includes("filtro=sin_atender"), `${r.ms} ms · ${r.pedidos} pedidos`);
  await pagina.close();
}

console.log(`\n${ok} bien · ${mal} mal`);
await navegador.close();
process.exit(mal ? 1 : 0);
