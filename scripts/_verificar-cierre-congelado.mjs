// 0229: el cierre de la semana queda congelado con su PDF. Con la sesión REAL
// del comercial de pruebas (C0): cierra la semana en curso desde «Mi agenda»,
// y después la fila tiene la foto, el PDF está en el bucket y la ruta del PDF
// devuelve ESE archivo (no uno recalculado). Se limpia al final.
//   node --env-file=.env.local scripts/_verificar-cierre-congelado.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { pathToFileURL } from "node:url";

const CHROME = "C:/Users/diseno/AppData/Local/Google/Chrome/Application/chrome.exe";
const PUPPETEER = "C:/Users/diseno/AppData/Local/Temp/claude/C--Users-diseno--local-bin/9777f871-38bc-4fdf-87c7-a83b0fa8cd1e/scratchpad/node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js";
const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const C0 = "d6562c5d-c0ab-40c9-8d27-acf67add67ab";
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

// La semana en curso (lunes), en Lima: el cierre real se hace desde «Mi agenda».
const hoy = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
const lunesActual = new Date(hoy); lunesActual.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7));
const LUNES = lunesActual.toISOString().slice(0, 10);
const RUTA = `cierres-semana/${C0}/${LUNES}.pdf`;
await admin.from("declaraciones_semana").delete().eq("comercial_id", C0).eq("lunes", LUNES);
await admin.storage.from("adjuntos").remove([RUTA]);
console.log(`Semana de práctica: ${LUNES} (C0)`);

const { default: puppeteer } = await import(pathToFileURL(PUPPETEER).href);
const navegador = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
try {
  const cookies = await sesion("comercial0@gmail.com");
  const p = await navegador.newPage();
  await p.setViewport({ width: 1280, height: 1000 });
  await p.setCookie(...cookies);
  await p.goto(`${BASE}/comercial/agenda`, { waitUntil: "networkidle0", timeout: 120000 });

  console.log("\nCerrar la semana desde Mi agenda:");
  const abierto = await p.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => /cierre semanal|Compromiso semanal|Cerrar la semana/i.test(x.textContent));
    b?.click();
    return b?.textContent?.trim() ?? null;
  });
  af("el botón del cierre está en Mi agenda", Boolean(abierto), abierto ?? "");
  await p.waitForSelector("#compromiso", { timeout: 15000 });
  await p.click("#compromiso", { clickCount: 3 });
  await p.type("#compromiso", "Verificación 0229: llamar a los 20 clientes con cotización vencida y visitar tres en Lima norte.");
  await p.evaluate(() => { const c = document.querySelector("input[type=checkbox]"); if (c && !c.checked) c.click(); });
  await p.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Guardar los cambios|Declarar el cierre/.test(b.textContent))?.click());
  await p.waitForFunction(() => !document.querySelector("#compromiso"), { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));

  const { data: fila } = await admin.from("declaraciones_semana").select("compromiso, proyectado_usd, vendido_usd, diferencia_usd, ventas, gestiones, cotizaciones, rechazos, pdf_path, cerrado_at").eq("comercial_id", C0).eq("lunes", LUNES).single();
  af("la declaración se actualizó", /Verificación 0229/.test(fila?.compromiso ?? ""));
  af("y la foto quedó congelada (proyectado, vendido, diferencia…)", fila?.cerrado_at && fila.proyectado_usd != null && fila.vendido_usd != null && fila.diferencia_usd != null, JSON.stringify({ proy: fila?.proyectado_usd, vend: fila?.vendido_usd, dif: fila?.diferencia_usd, ventas: fila?.ventas, gest: fila?.gestiones }));
  af("con la ruta del PDF", fila?.pdf_path === RUTA, fila?.pdf_path);
  const { data: archivo } = await admin.storage.from("adjuntos").download(RUTA);
  const bytes = archivo ? Buffer.from(await archivo.arrayBuffer()) : null;
  af("el PDF está en el bucket y es un PDF", Boolean(bytes) && bytes.subarray(0, 4).toString() === "%PDF", `${bytes?.length ?? 0} bytes`);

  console.log("\nEl histórico y la ruta del PDF:");
  await p.goto(`${BASE}/comercial/mi-gestion`, { waitUntil: "networkidle0", timeout: 120000 });
  const texto = await p.evaluate(() => document.body.innerText);
  af("«Sus cierres de semana» dice con cuánto cerró y que el PDF quedó guardado", /Cerró con US\$ [\d.,]+ proyectado/.test(texto) && /PDF de ese sábado guardado/.test(texto));
  await p.screenshot({ path: "scripts/data/_pantallazos/cierre-congelado.png" });
  const r = await fetch(`${BASE}/api/reportes/semanal?semana=${LUNES}`, { headers: { cookie: cookieHeader(cookies) } });
  const servido = Buffer.from(await r.arrayBuffer());
  af("la ruta del PDF devuelve el archivo congelado, byte a byte", r.status === 200 && bytes && servido.equals(bytes), `${r.status} · ${servido.length} bytes`);
  const rv = await fetch(`${BASE}/api/reportes/semanal?semana=${LUNES}&vivo=1`, { headers: { cookie: cookieHeader(cookies) } });
  af("y con ?vivo=1 recalcula (PDF válido)", rv.status === 200 && Buffer.from(await rv.arrayBuffer()).subarray(0, 4).toString() === "%PDF");

  // Gerencia ve las filas de práctica solo en modo ensayo (RLS: es_prueba =
  // es_cuenta_prueba()), así que con C0 no se puede probar su vista; la ruta
  // y el panel son los mismos que para un comercial real.
} finally {
  await navegador.close();
  await admin.from("declaraciones_semana").delete().eq("comercial_id", C0).eq("lunes", LUNES);
  await admin.storage.from("adjuntos").remove([RUTA]);
  console.log("\nPráctica borrada (fila y PDF).");
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
