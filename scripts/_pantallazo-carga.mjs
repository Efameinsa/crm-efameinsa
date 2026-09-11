// Un pantallazo de la PANTALLA DE CARGA: se entra a una pantalla liviana y se
// hace clic a una pesada; en el medio, mientras llega la página, Next muestra
// el loading.tsx. Se captura ahí.
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const CHROME = "C:/Users/diseno/AppData/Local/Google/Chrome/Application/chrome.exe";
const PUPPETEER = "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/9777f871-38bc-4fdf-87c7-a83b0fa8cd1e/scratchpad/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const BASE = process.env.BASE ?? "http://localhost:3000";
const COMO = process.env.COMO ?? "postventa1@efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: COMO });
const jar = new Map();
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.2 });
await pagina.setCookie(...[...jar.entries()].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" })));
mkdirSync("scripts/data/_pantallazos", { recursive: true });

// 1. Pantalla completa (login sin sesión → /login carga con el root loading).
const p2 = await navegador.newPage();
await p2.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1.2 });
// Se frena a propósito la respuesta del servidor para pescar el estado de carga.
const cdp = await p2.createCDPSession();
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 1500, downloadThroughput: 200 * 1024, uploadThroughput: 200 * 1024 });
p2.goto(`${BASE}/comercial/parque?todos=1`).catch(() => {});
await new Promise((r) => setTimeout(r, 2500));
await p2.screenshot({ path: "scripts/data/_pantallazos/carga-completa.png" });
console.log("carga-completa.png");

// 2. Dentro del CRM: se entra a una liviana, se hace clic a una pesada.
await pagina.goto(`${BASE}/comercial/cotizaciones`, { waitUntil: "networkidle0", timeout: 120000 });
const cdp1 = await pagina.createCDPSession();
await cdp1.send("Network.enable");
await cdp1.send("Network.emulateNetworkConditions", { offline: false, latency: 1500, downloadThroughput: 200 * 1024, uploadThroughput: 200 * 1024 });
await pagina.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.getAttribute("href")?.startsWith("/comercial/parque")); a?.click(); });
await new Promise((r) => setTimeout(r, 3200));
await pagina.screenshot({ path: "scripts/data/_pantallazos/carga-en-el-crm.png" });
console.log("carga-en-el-crm.png");
await navegador.close();
