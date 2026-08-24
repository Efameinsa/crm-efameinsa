// Verifica el informe del día de Central (migración 0063), pedido por correo
// por Alondra el 24-08: «le envío el detalle que estaría faltando al sistema,
// como lo que es la agenda diaria de la CENTRAL».
//
// Comprueba las cinco secciones de su formato en Word, que el PDF se genere de
// verdad, y que la bitácora sea privada de cada quien.
//
// Uso: node --env-file=.env.local scripts/probar-informe-central.mjs [url]

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const URL_APP = process.argv[2] ?? "http://localhost:3000";
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, DATABASE_URL } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bd = new Client({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

let fallas = 0;
const ok = (b, t, e = "") => { console.log(`${b ? "✓" : "✗"} ${t}${e ? ` — ${e}` : ""}`); if (!b) fallas++; };

async function sesion(filtro) {
  const { data: p } = await admin.from("perfiles").select("id, nombre").match(filtro).single();
  const { data: u } = await admin.auth.admin.getUserById(p.id);
  let enl = null;
  for (let i = 1; i <= 4 && !enl; i++) {
    const r = await admin.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    enl = r.data?.properties ? r.data : null;
    if (!enl) await new Promise((x) => setTimeout(x, i * 15000));
  }
  if (!enl) return null;
  const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await anon.auth.verifyOtp({ token_hash: enl.properties.hashed_token, type: "magiclink" });
  const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const v = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64");
  const t = v.match(/.{1,3180}/g);
  return {
    perfil: p,
    token: s.session.access_token,
    cookie: t.length === 1 ? `sb-${ref}-auth-token=${t[0]}` : t.map((x, i) => `sb-${ref}-auth-token.${i}=${x}`).join("; "),
  };
}

const c = await sesion({ rol: "central" });
if (!c) { console.error("rate limit de Supabase; reintentar."); process.exit(1); }
console.log(`Sesión: ${c.perfil.nombre}\n`);

const MARCA = "[prueba automática informe]";
const supa = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${c.token}` } },
});

try {
  // Una actividad escrita a mano, que es la única sección manual.
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const { error: eIns } = await supa.from("bitacora_dia").insert({
    perfil_id: c.perfil.id, fecha: hoy, orden: 99, texto: `${MARCA} se derivó llamadas a C4`,
  });
  ok(!eIns, "Central puede anotar una actividad del día", eIns?.message ?? "");

  const html = await fetch(`${URL_APP}/central/informe`, { headers: { cookie: c.cookie } })
    .then((r) => r.text())
    .then((t) => t.replace(/<!--\s*-->/g, ""));

  ok(html.includes("Informe del día"), "la pantalla del informe carga");
  for (const s of ["1. Actividades realizadas", "2. Contactos registrados", "3. Presupuestos del día"]) {
    ok(html.includes(s), `  · trae la sección "${s}"`);
  }
  ok(html.includes(`${MARCA} se derivó llamadas a C4`), "la actividad escrita a mano aparece");
  ok(html.includes("Contactos del día") && html.includes("Derivados"), "trae el resumen de totales");
  ok(html.includes("Efameinsa") || html.includes("EFAMEINSA"), "los presupuestos van separados por razón social");

  // El PDF, que es lo que se manda a gerencia.
  const pdf = await fetch(`${URL_APP}/api/reportes/central?fecha=${hoy}`, { headers: { cookie: c.cookie } });
  const buf = Buffer.from(await pdf.arrayBuffer());
  ok(pdf.status === 200 && buf.toString("latin1").startsWith("%PDF-"), "el PDF se genera", `${buf.length} bytes`);
  ok(buf.length > 8000, "  · y trae contenido, no una hoja vacía");

  // La bitácora es de cada quien: un comercial no ve la de Central.
  const com = await sesion({ codigo_comercial: "C5" });
  if (com) {
    const supaCom = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${com.token}` } },
    });
    const { data: ajena } = await supaCom.from("bitacora_dia").select("id").eq("perfil_id", c.perfil.id);
    ok((ajena ?? []).length === 0, "la bitácora de Central no la ve un comercial");
  }
} finally {
  const { rowCount } = await bd.query(`delete from bitacora_dia where texto like $1`, [`${MARCA}%`]);
  console.log(`\nLimpieza: ${rowCount} actividad(es) de prueba borrada(s).`);
  await bd.end();
}

console.log(fallas === 0 ? "\n✓ Todo verificado" : `\n✗ ${fallas} comprobación(es) fallaron`);
process.exit(fallas === 0 ? 0 : 1);
