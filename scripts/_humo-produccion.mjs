// HUMO DE PRODUCCIÓN. Se corre ANTES y DESPUÉS de cada despliegue.
//
// POR QUÉ EXISTE: el 08-09 un despliegue dejó a todo el mundo con «a server
// error occurred» y nos enteramos porque alguien llamó. Esto entra con la
// sesión REAL de cada persona, abre sus pantallas y avisa si alguna devuelve
// error o se queda sin contenido. Solo LEE: no escribe nada en la base.
//
//   node --env-file=.env.local scripts/_humo-produccion.mjs
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_humo-produccion.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function sesion(email) {
  for (let i = 0; i < 8; i++) {
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (!data?.properties) { await new Promise((r) => setTimeout(r, 4000)); continue; }
    const jar = new Map();
    const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
    await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
    return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
  }
  throw new Error(`no se pudo abrir sesión de ${email}`);
}

// Lo que delata una pantalla rota. OJO: se busca solo en lo VISIBLE. Estos
// mismos textos viajan dentro de los <script> de cualquier pantalla sana
// —son los avisos que el CRM tiene preparados por si algo falla— y buscarlos
// en el HTML entero da 31 falsas alarmas de 31. Y «This page could» se cayó
// de la lista: es el título del 404 que Next incrusta en toda página sana.
const ROTO = [
  "A server error occurred",
  "Application error",
  "Internal Server Error",
  "failed to find Server Action",
  "Se cayó esta pantalla",
];
const visible = (html) => html.replace(new RegExp("<script[^]*?</script>", "gi"), "");

const QUIENES = [
  ["Central", "central@efameinsa.com", ["/central", "/central/derivados", "/central/captura", "/central/presupuestos", "/central/cierres"]],
  ["Comercial C1", "comercial1@efameinsa.com", ["/comercial", "/comercial/agenda", "/comercial/cartera", "/comercial/cotizaciones", "/comercial/oportunidades", "/comercial/ruta", "/comercial/parque"]],
  ["Comercial C5", "comercial5@efameinsa.com", ["/comercial", "/comercial/cotizaciones", "/comercial/cierres"]],
  ["Postventa", "postventa@efameinsa.com", ["/postventa", "/postventa/atenciones", "/postventa/casos", "/postventa/agenda", "/postventa/equipos", "/postventa/control", "/postventa/soporte"]],
  ["Operaciones", "lesly@efameinsa.com", ["/operaciones", "/operaciones/catalogo", "/operaciones/permisos"]],
  ["Gerencia", "crcabrejos@efameinsa.com", ["/gerencia", "/gerencia/supervision", "/gerencia/reportes", "/gerencia/finanzas", "/gerencia/clientes", "/gerencia/aprobaciones"]],
];

console.log(`Humo contra ${BASE}\n`);
for (const [quien, correo, rutas] of QUIENES) {
  console.log(`— ${quien} —`);
  let cookie;
  try { cookie = await sesion(correo); } catch (e) { afirmar(`${quien}: abre sesión`, false, e.message); continue; }
  afirmar(`${quien}: abre sesión`, true);
  for (const ruta of rutas) {
    let r, html = "";
    try { r = await fetch(`${BASE}${ruta}`, { headers: { cookie }, redirect: "manual" }); html = await r.text(); }
    catch (e) { afirmar(`${ruta}`, false, e.message); continue; }
    const v = visible(html);
    const roto = ROTO.find((m) => v.includes(m));
    if (process.env.DEPURAR && roto) console.log("      DEPURAR", html.length, v.length, JSON.stringify(v.slice(Math.max(0, v.indexOf(roto) - 200), v.indexOf(roto) + 120)));
    // Una pantalla viva trae el armazón del CRM —el botón de salir— y peso.
    const armazon = v.includes("Cerrar sesión");
    const viva = r.status === 200 && html.length > 4000 && armazon && !roto;
    afirmar(`${ruta}`, viva, `${r.status} · ${(html.length / 1024).toFixed(0)} KB${roto ? ` · «${roto}»` : ""}${armazon ? "" : " · sin armazón"}`);
  }
}

// El login tiene que seguir sirviéndose a quien no ha entrado.
const rl = await fetch(`${BASE}/login`, { redirect: "manual" });
afirmar("/login responde a quien no ha entrado", rl.status === 200, String(rl.status));

console.log(`\n${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
