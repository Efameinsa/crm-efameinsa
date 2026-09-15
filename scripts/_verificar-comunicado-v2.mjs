// El comunicado con láminas en imagen (0233), en producción con la sesión
// real de C5: las 4 imágenes pesan poco y cargan, se pasan con un clic sobre
// la imagen, la lámina final trae disposición y feedback, sin feedback no se
// puede cerrar (cerrar = «lo veo luego»), con feedback por correo el texto
// queda guardado y el correo sale, y después ya no vuelve a salir.
//   node --env-file=.env.local scripts/_verificar-comunicado-v2.mjs
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

console.log("Las imágenes:");
for (const n of ["1", "2", "3", "4"]) {
  const r = await fetch(`${BASE}/comunicados/web-2026-09/${n}.webp`);
  const kb = Math.round(Number(r.headers.get("content-length") ?? (await r.arrayBuffer()).byteLength) / 1024);
  af(`${n}.webp responde y pesa poco`, r.status === 200 && kb < 120, `${r.status} · ${kb} KB · ${r.headers.get("content-type")}`);
}

const { data: c5 } = await admin.from("perfiles").select("id").eq("codigo_comercial", "C5").single();
const { data: com } = await admin.from("comunicados").select("id").eq("clave", "web-2026-09").single();
const { data: acuseAntes } = await admin.from("comunicados_acuses").select("*").eq("comunicado_id", com.id).eq("perfil_id", c5.id).maybeSingle();
await admin.from("comunicados_acuses").delete().eq("comunicado_id", com.id).eq("perfil_id", c5.id);

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  console.log("\nComo C5:");
  const cookies = await sesion("comercial5@efameinsa.com");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 900 });
  await p.setCookie(...cookies);
  await p.goto(`${BASE}/comercial`, { waitUntil: "networkidle0", timeout: 120000 });
  const d = () => p.evaluate(() => [...document.querySelectorAll("[role=dialog]")].map((x) => x.innerText).find((t) => /Comunicado de gerencia/.test(t)) ?? "");
  const imgVisible = () => p.evaluate(() => { const img = document.querySelector("[role=dialog] img[alt]:not([alt=''])"); return img ? { src: img.currentSrc || img.src, ancho: img.naturalWidth, alt: img.alt } : null; });
  let t = await d();
  af("sale al entrar, en 1 / 5", /1 \/ 5/.test(t));
  let im = await imgVisible();
  // naturalWidth sale dividido por la densidad del srcset (720/408): se mira la fuente.
  af("la primera lámina es la imagen 1", Boolean(im) && /web-2026-09\/1(@2x)?\.webp/.test(im.src), JSON.stringify(im));
  await p.screenshot({ path: "scripts/data/_pantallazos/comunicado-v2-1.png" });
  // Clic sobre la imagen → siguiente.
  await p.click("[role=dialog] button[aria-label*='Toque para ver']");
  await new Promise((r) => setTimeout(r, 400));
  im = await imgVisible();
  af("un clic en la imagen pasa a la 2", /2 \/ 5/.test(await d()) && /web-2026-09\/2/.test(im?.src ?? ""));
  await p.keyboard.press("ArrowRight"); await new Promise((r) => setTimeout(r, 300));
  af("la flecha del teclado pasa a la 3", /3 \/ 5/.test(await d()));
  // Pase lo que pase con el teclado, se llega al final con la flecha de la pantalla.
  while (!/5 \/ 5/.test(await d())) { await p.click("[role=dialog] button[aria-label='Siguiente']"); await new Promise((r) => setTimeout(r, 300)); }
  t = await d();
  af("la lámina final trae la disposición y el feedback", /5 \/ 5/.test(t) && /Disposición de gerencia/.test(t) && /Ya me registré en la web/.test(t) && /Enviar por correo/.test(t));
  af("sin feedback no hay «Cerrar», solo «Lo veo luego»", !/\bCerrar\b/.test(t) && /Lo veo luego/.test(t));
  await p.screenshot({ path: "scripts/data/_pantallazos/comunicado-v2-final.png" });
  // La disposición.
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Ya me registré/.test(b.textContent))?.click());
  await p.waitForFunction(() => /Ya me registré en la web/.test(document.querySelector("[role=dialog]")?.innerText ?? "") && !![...document.querySelectorAll("[role=dialog] span")].find((s) => /Ya me registré/.test(s.textContent)), { timeout: 15000 }).catch(() => {});
  const { data: a1 } = await admin.from("comunicados_acuses").select("cumplido_at, feedback_at").eq("comunicado_id", com.id).eq("perfil_id", c5.id).maybeSingle();
  af("«Ya me registré» queda cumplido y el modal sigue abierto (falta el feedback)", Boolean(a1?.cumplido_at) && !a1?.feedback_at && Boolean(await d()));
  // El feedback por correo.
  await p.type("[role=dialog] textarea", "Verificación 0233: en la ficha de la UW130 el botón de cotizar queda tapado en el celular.");
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /Enviar por correo/.test(b.textContent))?.click());
  await p.waitForFunction(() => /quedó registrado/.test(document.querySelector("[role=dialog]")?.innerText ?? ""), { timeout: 20000 }).catch(() => {});
  const { data: a2 } = await admin.from("comunicados_acuses").select("feedback, feedback_via, feedback_at").eq("comunicado_id", com.id).eq("perfil_id", c5.id).maybeSingle();
  af("el feedback queda guardado en el acuse, vía correo", /Verificación 0233/.test(a2?.feedback ?? "") && a2?.feedback_via === "correo" && Boolean(a2?.feedback_at));
  t = await d();
  af("y ahora sí aparece «Cerrar»", /\bCerrar\b/.test(t));
  await p.evaluate(() => [...document.querySelectorAll("[role=dialog] button")].find((b) => /^Cerrar$/.test(b.textContent.trim()))?.click());
  await p.waitForFunction(() => ![...document.querySelectorAll("[role=dialog]")].some((x) => /Comunicado de gerencia/.test(x.innerText)), { timeout: 15000 }).catch(() => {});
  await p.goto(`${BASE}/comercial`, { waitUntil: "networkidle0", timeout: 120000 });
  af("cumplido y con feedback, no vuelve a salir", !(await d()));
} finally {
  await navegador.close();
  await admin.from("comunicados_acuses").delete().eq("comunicado_id", com.id).eq("perfil_id", c5.id);
  if (acuseAntes) await admin.from("comunicados_acuses").insert(acuseAntes);
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
