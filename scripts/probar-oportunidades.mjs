// Prueba de humo de "Mis oportunidades" rehecha (docs/10, Bloque A).
// Abre una sesión real de Katerine (C5) por magic link (sin correo) y pide
// la ruta con varios filtros, como lo haría el navegador — un curl pelado
// solo vería el redirect del proxy de auth a /login.
//
// Uso: node --env-file=.env.local scripts/probar-oportunidades.mjs [url]

import { createClient } from "@supabase/supabase-js";

const URL_APP = process.argv[2] ?? "http://localhost:3055";
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: perfil } = await admin.from("perfiles").select("id, nombre").ilike("codigo_comercial", "C5").single();
const { data: usuario } = await admin.auth.admin.getUserById(perfil.id);
console.log(`${URL_APP}\nSesión de prueba: ${perfil.nombre} (C5)`);

const { data: enlace, error: e1 } = await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.user.email });
if (e1) throw e1;

const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion, error: e2 } = await anon.auth.verifyOtp({ token_hash: enlace.properties.hashed_token, type: "magiclink" });
if (e2) throw e2;

const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const valor = "base64-" + Buffer.from(JSON.stringify(sesion.session)).toString("base64");
const trozos = valor.match(/.{1,3180}/g);
const cookie = trozos.length === 1 ? `sb-${ref}-auth-token=${trozos[0]}` : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`).join("; ");

// Los popovers/condicionales de React viven en chunks JS, no en el SSR — solo
// se puede verificar por marcadores que SÍ están en el HTML servido. React
// intercala <!-- --> entre expresiones JSX: hay que quitarlos antes de buscar.
async function pedir(ruta) {
  const r = await fetch(`${URL_APP}${ruta}`, { headers: { cookie }, redirect: "manual" });
  if (r.status !== 200) return { status: r.status, destino: r.headers.get("location") };
  const html = (await r.text()).replace(/<!--\s*-->/g, "");
  return { status: r.status, html };
}

const casos = [
  ["Tabla, sin filtros", "/comercial/oportunidades"],
  ["Tabla, solo empresas", "/comercial/oportunidades?tipo=empresa"],
  ["Tabla, etapa seguimiento", "/comercial/oportunidades?etapa=seguimiento"],
  ["Tabla, para retomar ago-26", "/comercial/oportunidades?desde=2026-08-01&hasta=2026-08-31"],
  ["Tabla, página 2", "/comercial/oportunidades?pagina=2"],
  ["Kanban", "/comercial/oportunidades?vista=kanban"],
];

let fallas = 0;
for (const [nombre, ruta] of casos) {
  const r = await pedir(ruta);
  if (r.status !== 200) {
    console.log(`✗ ${nombre}: HTTP ${r.status} → ${r.destino ?? ""}`);
    fallas++;
    continue;
  }
  const tieneMarca = r.html.includes("Mis oportunidades") || r.html.includes("Kanban") || r.html.includes("kanban");
  const dice0 = r.html.includes("Aún no tiene oportunidades asignadas");
  console.log(`${tieneMarca && !dice0 ? "✓" : "?"} ${nombre}: HTTP 200${dice0 ? " — dice 0 resultados" : ""}`);
  if (!tieneMarca) fallas++;
}

console.log(fallas === 0 ? "\nTodo respondió 200 con contenido ✓" : `\n${fallas} caso(s) con problema ✗`);
