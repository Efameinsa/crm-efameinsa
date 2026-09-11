// En producción, con la sesión real de Central: un contacto orgánico de la
// web lleva el chip verde «Web · orgánico», uno de landing lleva «Landing de
// campaña · Google Ads», y en los derivados el formulario de Google Ads se
// distingue. Prácticas en modo ensayo, borradas al final.
//   node --env-file=.env.local scripts/_verificar-origen-en-el-navegador.mjs
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

const base = { canal: "formulario_web", area_destino: "comercial", estado: "pendiente_triaje", es_prueba: true, recibido_por: null, telefono: "+51987000333" };
const { data: organico } = await admin.from("leads").insert({ ...base, nombre_contacto: "Verificación orgánico", email: "organico0227@ejemplo.pe", fuente: "web · sitio · calculadora, pidió asesora", mensaje: "Lavandería nueva, 40 kg/día" }).select("id, codigo").single();
const { data: landing } = await admin.from("leads").insert({ ...base, nombre_contacto: "Verificación landing", email: "landing0227@ejemplo.pe", fuente: "web · landing · industrial · hotel · 30 kg", gclid: "PRUEBA0227gclid", utm_source: "google", utm_medium: "cpc", utm_campaign: "Lavadoras industriales", mensaje: "Hotel, 30 kg/día" }).select("id, codigo").single();
console.log(`Prácticas ${organico.codigo} (orgánico) y ${landing.codigo} (landing)`);
const { data: cfg } = await admin.from("config_seguridad").select("valor").eq("clave", "pin_supervisor_libre_hasta").single();
const valorAntes = cfg?.valor ?? "";
await admin.from("config_seguridad").update({ valor: new Date(Date.now() + 3 * 60000).toISOString() }).eq("clave", "pin_supervisor_libre_hasta");

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const central = await sesion("central@efameinsa.com");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.setCookie(...central);

  console.log("\nBandeja:");
  await p.goto(`${BASE}/central`, { waitUntil: "networkidle0", timeout: 120000 });
  const tarjeta = (codigo) => p.evaluate((c) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(c));
    return el ? { texto: el.innerText, clase: el.className } : null;
  }, codigo);
  const o = await tarjeta(organico.codigo);
  af("el orgánico lleva el chip «Web · orgánico»", /Web · orgánico/.test(o?.texto ?? ""));
  af("y NO la cinta de urgencia ni el marco de color", !/Gestionar a la brevedad/i.test(o?.texto ?? "") && !/border-sky-400|border-violet-400|border-emerald-400/.test(o?.clase ?? ""));
  af("dice que entró solo · web · orgánico", /entró solo · web · orgánico/i.test(o?.texto ?? ""));
  const l = await tarjeta(landing.codigo);
  af("la landing lleva «Landing de campaña · Google Ads»", /Landing de campaña · Google Ads/.test(l?.texto ?? ""));
  af("con la fuente sin el prefijo y urgente, en azul", /industrial · hotel · 30 kg/.test(l?.texto ?? "") && /Gestionar a la brevedad/i.test(l?.texto ?? "") && /border-sky-400/.test(l?.clase ?? ""));
  af("y ya no muestra «web · landing ·» crudo", !/web · landing ·/i.test(l?.texto ?? ""));
  await p.screenshot({ path: "scripts/data/_pantallazos/central-origen.png" });

  console.log("\nDerivados:");
  const { data: adsDerivado } = await admin.from("leads").select("codigo").eq("fuente", "google_ads").eq("estado", "asignado").eq("es_prueba", false).order("recibido_at", { ascending: false }).limit(1).single();
  await p.goto(`${BASE}/central/derivados?q=${encodeURIComponent(adsDerivado.codigo)}`, { waitUntil: "networkidle0", timeout: 120000 });
  const texto = await p.evaluate(() => document.body.innerText);
  af(`el derivado ${adsDerivado.codigo} muestra «Formulario de Google Ads»`, /Formulario de Google Ads/.test(texto));
  const enlace = await p.evaluate((c) => [...document.querySelectorAll("a[href*='/central/derivados/']")].find((a) => a.closest("div,li,article")?.textContent.includes(c))?.getAttribute("href") ?? null, adsDerivado.codigo);
  if (enlace) {
    await p.goto(`${BASE}${enlace}`, { waitUntil: "networkidle0", timeout: 120000 });
    const ficha = await p.evaluate(() => document.body.innerText);
    af("y su ficha también", /Formulario de Google Ads/.test(ficha));
  } else console.log("  (no encontré el enlace a la ficha desde la lista; se omite)");
  await p.screenshot({ path: "scripts/data/_pantallazos/derivados-origen.png" });
} finally {
  await navegador.close();
  await admin.from("leads").delete().in("id", [organico.id, landing.id]);
  await admin.from("config_seguridad").update({ valor: valorAntes }).eq("clave", "pin_supervisor_libre_hasta");
  console.log("\nPrácticas borradas; modo ensayo como estaba.");
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
