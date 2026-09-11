// En producción, con sesiones reales: la tarjeta de un contacto de campaña
// se ve con su cinta en la bandeja de Central (práctica, en modo ensayo), y
// gerencia baja los tres CSV de conversiones desde el panel de marketing.
//   node --env-file=.env.local scripts/_verificar-campana-en-el-navegador.mjs
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
const cookieHeader = (cs) => cs.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");

// Un contacto como los que manda la landing de campaña de la web, de práctica.
const { data: lead } = await admin.from("leads").insert({
  canal: "formulario_web", area_destino: "comercial", estado: "pendiente_triaje", es_prueba: true,
  nombre_contacto: "Verificación campaña", telefono: "+51987000222", email: "campana0226@ejemplo.pe",
  fuente: "web · campaña industrial · hotel · 30 kg", gclid: "PRUEBA0226gclid", utm_source: "google", utm_medium: "cpc",
  utm_campaign: "Lavadoras industriales", mensaje: "PROSPECTO CALIENTE\nHotel, 30 kg/día, pidió asesora", recibido_por: null,
}).select("id, codigo").single();
console.log(`Contacto de práctica ${lead.codigo}`);
const { data: cfg } = await admin.from("config_seguridad").select("valor").eq("clave", "pin_supervisor_libre_hasta").single();
const valorAntes = cfg?.valor ?? "";
await admin.from("config_seguridad").update({ valor: new Date(Date.now() + 3 * 60000).toISOString() }).eq("clave", "pin_supervisor_libre_hasta");

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  console.log("\nBandeja de Central:");
  const central = await sesion("central@efameinsa.com");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.setCookie(...central);
  await p.goto(`${BASE}/central`, { waitUntil: "networkidle0", timeout: 120000 });
  const t = await p.evaluate((codigo) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(codigo));
    return el ? { texto: el.innerText, clase: el.className } : null;
  }, lead.codigo);
  af("el contacto está en la bandeja", Boolean(t));
  af("con la cinta «Campaña Google Ads»", /Campaña Google Ads/.test(t?.texto ?? ""));
  af("dice prospecto caliente, la campaña y la fuente de la web", /prospecto caliente/i.test(t?.texto ?? "") && /Lavadoras industriales/.test(t?.texto ?? "") && /campaña industrial · hotel · 30 kg/.test(t?.texto ?? ""));
  af("y «gestionar a la brevedad», en azul", /Gestionar a la brevedad/i.test(t?.texto ?? "") && /border-sky-400/.test(t?.clase ?? ""));
  await p.screenshot({ path: "scripts/data/_pantallazos/central-campana.png" });
  await p.close();

  console.log("\nPanel de marketing (gerencia):");
  const ger = await sesion("gerencia@efameinsa-crm.local");
  const g = await navegador.newPage();
  await g.setViewport({ width: 1280, height: 1400 });
  await g.setCookie(...ger);
  await g.goto(`${BASE}/gerencia/marketing?desde=2026-06-01&hasta=2026-12-31`, { waitUntil: "networkidle0", timeout: 120000 });
  const html = await g.evaluate(() => document.body.innerText);
  af("aparece «Retroalimentar a Google Ads y Meta»", /Retroalimentar a Google Ads y Meta/i.test(html));  // el título va en mayúsculas por CSS
  af("con el conteo por estado", /ganado/.test(html) && /calificado/.test(html));
  const enlaces = await g.evaluate(() => [...document.querySelectorAll("a[href*='/api/marketing/conversiones']")].map((a) => a.getAttribute("href")));
  af("y los tres CSV", enlaces.length === 3, enlaces.join(" "));
  await g.screenshot({ path: "scripts/data/_pantallazos/gerencia-marketing-conversiones.png", fullPage: true });
  await g.close();

  console.log("\nLos CSV:");
  const bajar = async (cs, formato) => {
    const r = await fetch(`${BASE}/api/marketing/conversiones?formato=${formato}&desde=2026-06-01&hasta=2026-12-31`, { headers: { cookie: cookieHeader(cs) } });
    return { status: r.status, tipo: r.headers.get("content-type"), nombre: r.headers.get("content-disposition"), texto: await r.text() };
  };
  const goo = await bajar(ger, "google");
  const lineas = goo.texto.replace(/^\uFEFF/, "").split(/\r?\n/);
  af("Google: CSV con las columnas del importador", goo.status === 200 && /text\/csv/.test(goo.tipo ?? "") && lineas[0] === "Parameters:TimeZone=America/Lima" && lineas[1] === "Google Click ID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency", `${goo.status} · ${lineas.length - 2} filas · ${goo.nombre}`);
  const conValor = lineas.slice(2).find((l) => /,Venta,/.test(l));
  af("la venta lleva importe y moneda", Boolean(conValor) && /,Venta,\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}-05:00,[\d.]+,(USD|PEN)$/.test(conValor ?? ""), conValor?.replace(/^[^,]+/, "gclid…"));
  af("el contacto de práctica NO está en el CSV", !goo.texto.includes("PRUEBA0226gclid"));
  const meta = await bajar(ger, "meta");
  af("Meta: CSV con email, phone, event_name…", meta.status === 200 && meta.texto.replace(/^\uFEFF/, "").startsWith("email,phone,event_name,event_time,value,currency,order_id"));
  const todo = await bajar(ger, "todo");
  af("Todo: CSV completo con estado y comercial", todo.status === 200 && /^codigo,recibido,plataforma/.test(todo.texto.replace(/^\uFEFF/, "")) && todo.texto.split(/\r?\n/).length > 100, `${todo.texto.split(/\r?\n/).length - 1} filas`);
  const c5 = await sesion("comercial5@efameinsa.com");
  const noAut = await bajar(c5, "google");
  af("un comercial recibe 403", noAut.status === 403, String(noAut.status));
} finally {
  await navegador.close();
  await admin.from("leads").delete().eq("id", lead.id);
  await admin.from("config_seguridad").update({ valor: valorAntes }).eq("clave", "pin_supervisor_libre_hasta");
  console.log("\nContacto de práctica borrado; modo ensayo como estaba.");
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
