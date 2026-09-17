/**
 * Un pantallazo de cualquier pantalla del CRM, con la sesión de quien se pida.
 * Uso: COMO=comercial4@efameinsa.com RUTA=/comercial BASE=https://crm.efameinsa.com node --env-file=.env.local scripts/_pantallazo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

const CHROME = "C:/Users/diseno/AppData/Local/Google/Chrome/Application/chrome.exe";
const PUPPETEER = "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/9777f871-38bc-4fdf-87c7-a83b0fa8cd1e/scratchpad/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const RUTA = process.env.RUTA ?? "/";
const COMO = process.env.COMO ?? "lesly@efameinsa.com";
const SALIDA = process.env.SALIDA ?? "scripts/data/_pantallazos";
const NOMBRE = process.env.NOMBRE ?? (RUTA.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "inicio");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let link = null;
for (let i = 0; i < 8 && !link; i++) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: COMO });
  if (data?.properties) link = data;
  else await new Promise((r) => setTimeout(r, 4000));
}
const jar = new Map();
const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  cookies: {
    getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })),
    setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
if (error) { console.error("no se pudo abrir sesión:", error.message); process.exit(1); }

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const pagina = await navegador.newPage();
// MOVIL=1: como un celular (táctil), para ver lo que solo aparece ahí (la cámara).
if (process.env.MOVIL === "1") await pagina.setViewport({ width: 412, height: 1400, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
else await pagina.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 1.4 });
await pagina.setCookie(...[...jar.entries()].map(([name, value]) => ({ name, value, domain: new URL(BASE).hostname, path: "/" })));
await pagina.goto(`${BASE}${RUTA}`, { waitUntil: "networkidle0", timeout: 120000 });
await new Promise((r) => setTimeout(r, 1500));
mkdirSync(SALIDA, { recursive: true });
const destino = `${SALIDA}/${NOMBRE}.png`;
await pagina.screenshot({ path: destino, fullPage: process.env.COMPLETA === "1" });
const texto = await pagina.evaluate(() => document.body.innerText);
console.log(`pantallazo: ${destino}\n`);
console.log(texto.slice(0, Number(process.env.LETRAS ?? 2500)));
await navegador.close();
