// 0225: dejar de ser potencial saca la oportunidad del cuadro de la semana.
// Con la sesión REAL de C5 sobre una oportunidad de práctica, por RLS, como
// lo hace la pantalla.
//   node --env-file=.env.local scripts/_verificar-sale-de-la-semana.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function como(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return ssr;
}

const { data: c5 } = await admin.from("perfiles").select("id").eq("codigo_comercial", "C5").single();
// Una ficha de práctica de C5, que se borra al final (cuentas no tiene es_prueba).
const { data: cuenta } = await admin.from("cuentas").insert({ razon_social: "PRUEBA VERIFICACIÓN 0225", comercial_id: c5.id }).select("id, razon_social").single();
const cuentaCreada = true;
const { data: op } = await admin.from("oportunidades").insert({
  cuenta_id: cuenta.id, comercial_id: c5.id, etapa: "potencial", intencion: "medio", monto_estimado: 1000, moneda: "USD",
  origen: "crm", cierre_proyectado: "2026-09-10", proxima_accion: "Verificación 0225", proxima_accion_at: "2026-09-12",
}).select("id").single();
console.log(`Oportunidad de práctica sobre ${cuenta.razon_social}`);

try {
  const sesion = await como("comercial5@efameinsa.com");
  const leer = async () => (await admin.from("oportunidades").select("etapa, cierre_proyectado, cotizacion_proyectada").eq("id", op.id).single()).data;

  console.log("\nComo Brenda: de potencial a seguimiento");
  let r = await sesion.from("oportunidades").update({ etapa: "seguimiento" }).eq("id", op.id).select("id");
  af("C5 cambia la etapa por RLS", !r.error && r.data?.length === 1, r.error?.message);
  let d = await leer();
  af("la fecha proyectada se fue con la etapa", d.etapa === "seguimiento" && d.cierre_proyectado === null, JSON.stringify(d));

  console.log("\nProyectada estando en seguimiento (lo que quiso Carlos el 25-08):");
  r = await sesion.rpc("proyectar_cierre", { p_oportunidad: op.id, p_fecha: "2026-09-16", p_cotizacion: null });
  af("C5 le pone fecha desde el cuadro", !r.error, r.error?.message);
  r = await sesion.from("oportunidades").update({ etapa: "filtrada" }).eq("id", op.id).select("id");
  d = await leer();
  af("cambiar entre etapas que no son potencial NO la quita", d.etapa === "filtrada" && d.cierre_proyectado === "2026-09-16", JSON.stringify(d));
  r = await sesion.from("oportunidades").update({ etapa: "potencial" }).eq("id", op.id).select("id");
  d = await leer();
  af("volver a potencial conserva la fecha", d.etapa === "potencial" && d.cierre_proyectado === "2026-09-16");

  console.log("\nCerrada:");
  const { data: motivo } = await admin.from("catalogo_motivos_rechazo").select("id").limit(1).single();
  r = await sesion.from("oportunidades").update({ etapa: "rechazada", motivo_rechazo_id: motivo.id, cerrada_at: new Date().toISOString() }).eq("id", op.id).select("id");
  d = await leer();
  af("rechazada tampoco proyecta nada", !r.error && d.cierre_proyectado === null, r.error?.message ?? JSON.stringify(d));

  console.log("\nLa de Brenda:");
  const { data: b } = await admin.from("oportunidades").select("etapa, cierre_proyectado").eq("id", "60e3fbb9-f6f9-4ce8-8b44-a7e44b309162").single();
  af("SUMINISTROS Y SERVICIOS MONTENEGRO ya no está proyectada", b.etapa === "seguimiento" && b.cierre_proyectado === null, JSON.stringify(b));
} finally {
  await admin.from("oportunidades").delete().eq("id", op.id);
  if (cuentaCreada) await admin.from("cuentas").delete().eq("id", cuenta.id);
  console.log("\nPráctica borrada.");
}
console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
