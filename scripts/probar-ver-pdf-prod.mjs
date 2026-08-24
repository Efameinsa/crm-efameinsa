// Prueba de humo del botón "Ver PDF" contra PRODUCCIÓN.
//
// El problema de verificar esta ruta a mano es que el proxy de auth manda a
// /login a cualquiera sin sesión, así que un curl pelado no dice nada. Acá se
// abre una sesión real de gerencia por magic link (con la llave de servicio,
// sin mandar correo a nadie) y se pide la ruta como lo haría el navegador.
//
// Qué distingue cada resultado:
//   307 → r2.cloudflarestorage.com  el botón funciona
//   503                              faltan las variables R2_* en ese despliegue
//   307 → /login                     la cookie de prueba no fue aceptada
//
// Uso: node --env-file=.env.local scripts/probar-ver-pdf-prod.mjs [url]

import { createClient } from "@supabase/supabase-js";

const URL_APP = process.argv[2] ?? "https://crm.efameinsa.com";
const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: perfiles } = await admin.from("perfiles").select("id, nombre, rol").eq("rol", "gerencia").limit(1);
const { data: usuario } = await admin.auth.admin.getUserById(perfiles[0].id);
console.log(`${URL_APP}\nSesión de prueba: ${perfiles[0].nombre} (${perfiles[0].rol})`);

const { data: enlace, error: e1 } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email: usuario.user.email,
});
if (e1) throw e1;

const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion, error: e2 } = await anon.auth.verifyOtp({
  token_hash: enlace.properties.hashed_token,
  type: "magiclink",
});
if (e2) throw e2;

// La cookie que espera @supabase/ssr: base64 del JSON de la sesión, troceada
// cuando no entra en una sola (el límite por cookie del navegador).
const ref = new URL(NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const valor = "base64-" + Buffer.from(JSON.stringify(sesion.session)).toString("base64");
const trozos = valor.match(/.{1,3180}/g);
const cookie =
  trozos.length === 1
    ? `sb-${ref}-auth-token=${trozos[0]}`
    : trozos.map((t, i) => `sb-${ref}-auth-token.${i}=${t}`).join("; ");

const { data: cot } = await admin
  .from("cotizaciones_historicas")
  .select("id, codigo, serie, archivo")
  .not("pdf_path", "is", null)
  .limit(1)
  .single();
console.log(`Cotización de prueba: ${cot.serie} ${cot.codigo} · ${cot.archivo}\n`);

const r = await fetch(`${URL_APP}/api/cotizaciones-historicas/${cot.id}/pdf`, { headers: { cookie }, redirect: "manual" });
const destino = r.headers.get("location");
console.log(`HTTP ${r.status}`);

if (r.status === 307 && destino?.includes("r2.cloudflarestorage.com")) {
  const pdf = await fetch(destino);
  const buf = Buffer.from(await pdf.arrayBuffer());
  console.log(`→ bucket · HTTP ${pdf.status} · ${pdf.headers.get("content-type")} · ${buf.length} bytes`);
  console.log(`   ${pdf.headers.get("content-disposition")}`);
  console.log(buf.subarray(0, 5).toString("latin1") === "%PDF-" ? "\nEl botón Ver PDF funciona ✓" : "\nLlegó algo que no es un PDF ✗");
} else if (destino === "/login") {
  console.log("→ /login: la cookie de prueba no fue aceptada (problema del script, no de la ruta)");
} else {
  console.log(`→ ${destino ?? (await r.text()).slice(0, 300)}`);
  if (r.status === 503) console.log("\nFaltan las variables R2_* en ese despliegue ✗");
}
