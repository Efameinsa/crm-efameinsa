// 0232 y adjuntos por /api/leads, en producción:
//  · el comunicado de la web sale al entrar (sesión real de C5 en el navegador),
//    pasa las láminas, «Lo veo luego» lo esconde y «Ya me registré» lo cierra;
//  · /api/leads acepta un PDF en base64 y queda como adjunto del contacto.
//   node --env-file=.env.local scripts/_verificar-comunicado-y-adjuntos.mjs
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

const { data: c5 } = await admin.from("perfiles").select("id").eq("codigo_comercial", "C5").single();
const { data: com } = await admin.from("comunicados").select("id").eq("clave", "web-2026-09").single();
// C5 sin acuse, para ver el comunicado desde cero; al final se deja como estaba.
const { data: acuseAntes } = await admin.from("comunicados_acuses").select("*").eq("comunicado_id", com.id).eq("perfil_id", c5.id).maybeSingle();
await admin.from("comunicados_acuses").delete().eq("comunicado_id", com.id).eq("perfil_id", c5.id);

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  console.log("El comunicado, como C5:");
  const cookies = await sesion("comercial5@efameinsa.com");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.setCookie(...cookies);
  await p.goto(`${BASE}/comercial`, { waitUntil: "networkidle0", timeout: 120000 });
  // Solo el comunicado: otras pantallas tienen sus propios diálogos («Detalle de la gestión» en la agenda).
  const d = () => p.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((x) => x.innerText).find((t) => /Comunicado de gerencia/.test(t)) ?? "");
  let t = await d();
  af("sale al entrar", /Comunicado de gerencia/.test(t) && /lámina 1 de 4/.test(t), t.split("\n")[0]);
  await p.screenshot({ path: "scripts/data/_pantallazos/comunicado-web-1.png" });
  for (let k = 0; k < 3; k++) { await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Siguiente/.test(b.textContent))?.click()); await new Promise((r) => setTimeout(r, 250)); }
  t = await d();
  af("en la última lámina aparecen la disposición y los botones", /lámina 4 de 4/.test(t) && /Disposición de gerencia/.test(t) && /Entrar a la web/.test(t) && /Ya me registré en la web/.test(t));
  await p.screenshot({ path: "scripts/data/_pantallazos/comunicado-web-4.png" });
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Lo veo luego/.test(b.textContent))?.click());
  await p.waitForFunction(() => !document.querySelector("[role=dialog]"), { timeout: 15000 }).catch(() => {});
  const { data: a1 } = await admin.from("comunicados_acuses").select("leido_at, cumplido_at, recordar_desde").eq("comunicado_id", com.id).eq("perfil_id", c5.id).maybeSingle();
  af("«Lo veo luego» queda como leído con recordatorio y sin cumplir", a1?.leido_at && a1?.recordar_desde && !a1?.cumplido_at);
  await p.goto(`${BASE}/comercial/agenda`, { waitUntil: "networkidle0", timeout: 120000 });
  af("y ya no sale en la siguiente pantalla", !(await d()));
  // Mañana volvería: se simula adelantando el recordatorio.
  await admin.from("comunicados_acuses").update({ recordar_desde: new Date(Date.now() - 60000).toISOString() }).eq("comunicado_id", com.id).eq("perfil_id", c5.id);
  await p.goto(`${BASE}/comercial`, { waitUntil: "networkidle0", timeout: 120000 });
  af("vencido el «luego», vuelve a salir", /Comunicado de gerencia/.test(await d()));
  for (let k = 0; k < 3; k++) { await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Siguiente/.test(b.textContent))?.click()); await new Promise((r) => setTimeout(r, 250)); }
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Ya me registré/.test(b.textContent))?.click());
  await p.waitForFunction(() => !document.querySelector("[role=dialog]"), { timeout: 15000 }).catch(() => {});
  const { data: a2 } = await admin.from("comunicados_acuses").select("cumplido_at").eq("comunicado_id", com.id).eq("perfil_id", c5.id).maybeSingle();
  af("«Ya me registré» queda cumplido", Boolean(a2?.cumplido_at));
  await p.goto(`${BASE}/comercial`, { waitUntil: "networkidle0", timeout: 120000 });
  af("y no vuelve a salir", !(await d()));
  const pv = await sesion("practica.postventa@efameinsa.com");
  const q = await navegador.newPage(); await q.setCookie(...pv);
  await q.goto(`${BASE}/postventa`, { waitUntil: "networkidle0", timeout: 120000 });
  af("la cuenta de práctica no lo ve", !(await q.evaluate(() => document.querySelector("[role=dialog]")?.innerText ?? "")));
} finally {
  await navegador.close();
  await admin.from("comunicados_acuses").delete().eq("comunicado_id", com.id).eq("perfil_id", c5.id);
  if (acuseAntes) await admin.from("comunicados_acuses").insert(acuseAntes);
}

console.log("\n/api/leads con un PDF adjunto:");
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const r = await fetch(`${BASE}/api/leads`, {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.LEADS_INGEST_TOKEN}` },
  body: JSON.stringify({ canal: "formulario_web", nombre_contacto: "VERIFICACIÓN ADJUNTO 0232", telefono: "+51987000444", email: "adjunto0232@ejemplo.pe", fuente: "web · sitio · calculadora, pidió asesora", mensaje: "Verificación de adjuntos", adjuntos: [{ nombre: "Dimensionamiento K-0000.pdf", tipo: "application/pdf", contenido_base64: pdf.toString("base64") }] }),
});
const j = await r.json();
af("el contacto entra", r.status === 200 && j.codigo, `${r.status} ${j.codigo ?? j.error}`);
if (j.id) {
  await new Promise((s) => setTimeout(s, 1500));
  const { data: l } = await admin.from("leads").select("adjuntos").eq("id", j.id).single();
  const adj = l?.adjuntos?.[0];
  af("con el PDF guardado como adjunto", adj?.nombre === "Dimensionamiento K-0000.pdf" && adj?.path?.startsWith(`leads/${j.id}/`), JSON.stringify(adj));
  if (adj?.path) {
    const { data: archivo } = await admin.storage.from("adjuntos").download(adj.path);
    af("y el archivo está en el bucket", archivo && Buffer.from(await archivo.arrayBuffer()).equals(pdf));
    await admin.storage.from("adjuntos").remove([adj.path]);
  }
  await admin.from("leads").delete().eq("id", j.id);
  console.log("  contacto de verificación borrado");
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
