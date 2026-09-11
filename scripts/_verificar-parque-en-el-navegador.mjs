// Los filtros de «Las ventas de la empresa» se aplican en el navegador (11-09):
// se abre la pantalla con la sesión de PV1, se hace clic en un año y se mide
// cuánto tarda en cambiar la lista y si hubo que ir al servidor.
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-parque-en-el-navegador.mjs
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

const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: "postventa1@efameinsa.com" });
const jar = new Map();
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const pagina = await navegador.newPage();
await pagina.setViewport({ width: 1280, height: 900 });
await pagina.setCookie(...[...jar.entries()].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" })));

let pedidosAlServidor = 0;
pagina.on("request", (r) => {
  const h = r.headers();
  if (r.url().startsWith(BASE) && r.resourceType() !== "image" && !h["next-router-prefetch"] && !/[?&]_rsc=/.test(r.url())) pedidosAlServidor++;
});
const contador = () => pagina.$eval("tbody", (tb) => tb.parentElement?.parentElement?.nextElementSibling?.textContent?.trim() ?? "");

const t0 = Date.now();
await pagina.goto(`${BASE}/comercial/parque?todos=1`, { waitUntil: "networkidle0", timeout: 120000 });
const filasInicial = await pagina.$$eval("tbody tr", (r) => r.length);
af("abre con la primera tanda", filasInicial === 80, `${filasInicial} filas en ${Date.now() - t0} ms`);

const chipAnio = await pagina.$$("button");
const botones = await pagina.$$eval("button", (bs) => bs.map((b) => b.textContent?.trim() ?? ""));
const idx = botones.findIndex((t) => /^20\d\d \(\d+\)$/.test(t));
af("hay chips de año", idx >= 0, botones[idx]);

pedidosAlServidor = 0;
const t1 = Date.now();
const contadorAntes = await contador();
await chipAnio[idx].click();
await pagina.waitForFunction((c) => {
  const tb = document.querySelector("tbody");
  return (tb?.parentElement?.parentElement?.nextElementSibling?.textContent?.trim() ?? "") !== c;
}, { timeout: 5000 }, contadorAntes).catch(() => {});
const ms = Date.now() - t1;
const contadorDespues = await contador();
af("cambiar de año es instantáneo", ms < 400 && contadorDespues !== contadorAntes, `${ms} ms · «${contadorDespues}»`);
af("y no vuelve al servidor", pedidosAlServidor === 0, `${pedidosAlServidor} pedidos`);
af("la URL refleja el filtro", pagina.url().includes("anio=20"), pagina.url().replace(BASE, ""));

// Ver 80 más: suma, no reemplaza, y nunca todo de golpe.
await pagina.evaluate(() => { const a = [...document.querySelectorAll("button")].find((b) => b.textContent?.trim().startsWith("Todos los años")); a?.click(); });
await new Promise((r) => setTimeout(r, 150));
const antes = await pagina.$$eval("tbody tr", (r) => r.length);
pedidosAlServidor = 0;
await pagina.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => /^Ver \d+ más$/.test(x.textContent?.trim() ?? "")); b?.click(); });
await new Promise((r) => setTimeout(r, 200));
const despues = await pagina.$$eval("tbody tr", (r) => r.length);
af("«Ver 80 más» suma una tanda sin ir al servidor", despues === antes + 80 && pedidosAlServidor === 0, `${antes} → ${despues} · ${pedidosAlServidor} pedidos`);

// Y el cambio de conjunto SÍ va al servidor, con su pantalla de carga.
pedidosAlServidor = 0;
await pagina.evaluate(() => { const a = [...document.querySelectorAll("a")].find((x) => x.textContent?.trim() === "Mi cartera"); a?.click(); });
await pagina.waitForFunction(() => location.search === "", { timeout: 20000 }).catch(() => {});
await pagina.waitForNetworkIdle({ timeout: 30000 }).catch(() => {});
af("«Mi cartera» cambia de conjunto", !pagina.url().includes("todos=1") && (await pagina.$("h2, h3, [class*=titulo]")) !== null, pagina.url().replace(BASE, ""));

console.log(`\n${ok} bien · ${mal} mal`);
await navegador.close();
process.exit(mal ? 1 : 0);
