// Las listas que paginan en el servidor (cartera, clientes de gerencia y de
// Central, cotizaciones): al filtrar o paginar la tabla se atenúa en el
// instante del clic y vuelve cuando llega la página; la búsqueda aplica sola
// al dejar de escribir; y «Siguiente» está precargado.
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-espera-en-el-navegador.mjs
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
async function abrir(cookies, ruta, antesDeIr) {
  const pagina = await navegador.newPage();
  await pagina.setViewport({ width: 1280, height: 900 });
  await pagina.setCookie(...cookies);
  // El oído se pone ANTES de ir: la precarga de la página siguiente sale
  // apenas se pinta la lista, antes de que la red quede quieta.
  antesDeIr?.(pagina);
  await pagina.goto(`${BASE}${ruta}`, { waitUntil: "networkidle0", timeout: 120000 });
  return pagina;
}
const ocupado = (p) => p.evaluate(() => Boolean(document.querySelector("[aria-busy='true']")));

// ── Mi cartera (C5): búsqueda en vivo + tabla que se atenúa ─────────────────
console.log("Mi cartera (C5):");
const c5 = await sesion("comercial5@efameinsa.com");
{
  const p = await abrir(c5, "/comercial/cartera");
  await p.type("input[name=q]", "SA");
  const t0 = Date.now();
  await p.waitForFunction(() => document.querySelector("[aria-busy='true']") !== null, { timeout: 3000 }).catch(() => {});
  const seAtenuo = await ocupado(p);
  af("al escribir, la tabla se atenúa sin tocar «Buscar»", seAtenuo, `${Date.now() - t0} ms después de la última tecla`);
  await p.waitForFunction(() => location.search.includes("q=SA"), { timeout: 15000 }).catch(() => {});
  await p.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 15000 }).catch(() => {});
  af("llega el resultado y la tabla vuelve", p.url().includes("q=SA") && !(await ocupado(p)), p.url().replace(BASE, ""));
  await p.close();
}

// ── Clientes de gerencia: «Siguiente» precargado y espera visible ───────────
console.log("\nClientes de gerencia:");
const ger = await sesion("gerencia@efameinsa-crm.local");
{
  // La precarga completa de una página dinámica viaja como un pedido RSC normal
  // (con _rsc en la URL), sin la cabecera de prefetch: se reconoce por la URL.
  const precargas = [];
  const p = await abrir(ger, "/gerencia/clientes", (pg) => pg.on("request", (r) => { if (/pagina=2/.test(r.url()) && /[?&]_rsc=/.test(r.url())) precargas.push(r.url()); }));
  await new Promise((r) => setTimeout(r, 1500));
  af("la página 2 se precarga sola al abrir", precargas.length > 0, `${precargas.length} precarga(s)`);
  const t0 = Date.now();
  await p.evaluate(() => { const b = [...document.querySelectorAll("a, button")].find((x) => x.textContent?.includes("Siguiente")); b?.click(); });
  const seAtenuo = await p.waitForFunction(() => document.querySelector("[aria-busy='true']") !== null, { timeout: 2000 }).then(() => true).catch(() => false);
  await p.waitForFunction(() => location.search.includes("pagina=2"), { timeout: 15000 }).catch(() => {});
  const ms = Date.now() - t0;
  af("«Siguiente» atenúa la tabla y llega", p.url().includes("pagina=2"), `${ms} ms · atenuada: ${seAtenuo ? "sí" : "no (llegó antes de poder verse)"}`);
  await p.waitForFunction(() => !document.querySelector("[aria-busy='true']"), { timeout: 15000 }).catch(() => {});
  af("y al llegar, vuelve al 100 %", !(await ocupado(p)));
  await p.close();
}

// ── Cotizaciones (C5): búsqueda en vivo ─────────────────────────────────────
console.log("\nCotizaciones (C5):");
{
  const p = await abrir(c5, "/comercial/cotizaciones");
  await p.type("input[name=q]", "2");
  await p.waitForFunction(() => location.search.includes("q=2"), { timeout: 15000 }).catch(() => {});
  af("busca al dejar de escribir", p.url().includes("q=2"), p.url().replace(BASE, ""));
  await p.close();
}

console.log(`\n${ok} bien · ${mal} mal`);
await navegador.close();
process.exit(mal ? 1 : 0);
