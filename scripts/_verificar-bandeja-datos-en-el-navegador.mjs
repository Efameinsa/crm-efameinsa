// La bandeja de Central en el navegador, con su sesión real: un contacto de
// práctica entrado «solo» como los de Google Ads (con celular y correo, sin
// nombre bueno) tiene que verse con su teléfono, WhatsApp y correo en la
// tarjeta; «Corregir los datos» abre, guarda, y la tarjeta muestra lo nuevo y
// lo que entró. Se ve con el código de gerencia levantado (modo ensayo), que
// es lo único que trae las prácticas a la cola.
//   node --env-file=.env.local scripts/_verificar-bandeja-datos-en-el-navegador.mjs
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

// El contacto: como uno de Google Ads (recibido_por null) pero de práctica.
const { data: lead } = await admin.from("leads").insert({
  canal: "formulario_web", area_destino: "comercial", estado: "pendiente_triaje", es_prueba: true,
  nombre_contacto: "Topitop", telefono: "+51987654321", email: "verificacion0224@ejemplo.pe",
  mensaje: "Phone Number Verified: FALSE · City: Lima · Campaña: Verificación 0224", recibido_por: null,
}).select("id, codigo").single();
console.log(`Contacto de práctica ${lead.codigo}`);

// El modo ensayo (0111): el código de gerencia levantado, que es lo único que
// trae las prácticas a la cola. Tres minutos y se devuelve como estaba.
const { data: cfg } = await admin.from("config_seguridad").select("valor").eq("clave", "pin_supervisor_libre_hasta").single();
const valorAntes = cfg?.valor ?? "";
await admin.from("config_seguridad").update({ valor: new Date(Date.now() + 3 * 60000).toISOString() }).eq("clave", "pin_supervisor_libre_hasta");

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const cookies = await sesion("central@efameinsa.com");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.setCookie(...cookies);
  await p.goto(`${BASE}/central`, { waitUntil: "networkidle0", timeout: 120000 });

  const tarjeta = async () => p.evaluate((codigo) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(codigo));
    return el ? el.innerText : null;
  }, lead.codigo);
  let t = await tarjeta();
  af("el contacto de práctica está en la bandeja", Boolean(t), lead.codigo);
  af("la tarjeta muestra el teléfono", /987654321/.test(t ?? ""));
  af("y el enlace de WhatsApp", /WhatsApp/.test(t ?? ""));
  af("y el correo", /verificacion0224@ejemplo\.pe/.test(t ?? ""));
  af("y de dónde entró", /entró solo \(formulario web\)/.test(t ?? ""));

  // Corregir los datos desde la tarjeta.
  const abierto = await p.evaluate((codigo) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(codigo));
    const b = [...(el?.querySelectorAll("button") ?? [])].find((x) => x.textContent.includes("Corregir los datos"));
    b?.click();
    return Boolean(b);
  }, lead.codigo);
  af("hay botón «Corregir los datos»", abierto);
  await p.waitForSelector("#ed-nombre", { timeout: 10000 });
  await p.click("#ed-nombre", { clickCount: 3 });
  await p.type("#ed-nombre", "Carlos Quispe");
  await p.type("#ed-razon", "TOPITOP S.A.");
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.includes("Guardar los datos"))?.click());
  await p.waitForFunction(() => !document.querySelector("#ed-nombre"), { timeout: 20000 }).catch(() => {});
  await p.waitForFunction((codigo) => {
    const el = [...document.querySelectorAll("div.rounded-lg.border")].find((d) => d.textContent.includes(codigo));
    return el && /Carlos Quispe/.test(el.innerText);
  }, { timeout: 30000 }, lead.codigo).catch(() => {});
  t = await tarjeta();
  af("la tarjeta ya dice Carlos Quispe · TOPITOP S.A.", /Carlos Quispe/.test(t ?? "") && /TOPITOP S\.A\./.test(t ?? ""));
  af("y deja ver lo que entró", /Central corrigió los datos/.test(t ?? "") );
  const { data: d } = await admin.from("leads").select("nombre_contacto, datos_originales").eq("id", lead.id).single();
  af("en la base quedó el nombre nuevo y el original", d.nombre_contacto === "Carlos Quispe" && d.datos_originales?.nombre_contacto === "Topitop");
  await p.screenshot({ path: "scripts/data/_pantallazos/central-datos-del-contacto.png" });
} finally {
  await navegador.close();
  await admin.from("leads").delete().eq("id", lead.id);
  await admin.from("config_seguridad").update({ valor: valorAntes }).eq("clave", "pin_supervisor_libre_hasta");
  console.log("Contacto de práctica borrado; modo ensayo como estaba.");
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
