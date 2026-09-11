// 0226: conversiones de campaña para Google/Meta. Con sesiones reales:
// gerencia la lee y cuadra con la base; un comercial no.
//   node --env-file=.env.local scripts/_verificar-conversiones-de-campana.mjs
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

const desde = "2026-06-01", hasta = "2026-12-31";
const ger = await como("gerencia@efameinsa-crm.local");
const c5 = await como("comercial5@efameinsa.com");

console.log("Permisos:");
let r = await c5.rpc("conversiones_de_campana", { p_desde: desde, p_hasta: hasta });
af("un comercial no la lee", Boolean(r.error), r.error?.message);
r = await ger.rpc("conversiones_de_campana", { p_desde: desde, p_hasta: hasta }).range(0, 999);
af("gerencia sí", !r.error, r.error?.message);
const filas = r.data ?? [];

console.log("\nCuadre con la base:");
const { count: esperados } = await admin.from("leads").select("id", { count: "exact", head: true })
  .eq("es_prueba", false).gte("recibido_at", `${desde}T00:00:00-05:00`).lte("recibido_at", `${hasta}T23:59:59-05:00`)
  .or("gclid.not.is.null,fbclid.not.is.null,fuente.in.(google_ads,meta_ads),utm_medium.in.(cpc,ppc,paid,paidsocial),fuente.ilike.web*campaña*");
af(`trae los contactos de campaña del período (${filas.length})`, filas.length === esperados && filas.length > 0, `base: ${esperados}`);
const porEstado = {};
for (const f of filas) porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1;
console.log("  por estado:", porEstado);
af("todos tienen estado y fecha de estado", filas.every((f) => f.estado && f.fecha_estado));
af("todos tienen plataforma", filas.every((f) => ["google", "meta", "otra"].includes(f.plataforma)));

// Un ganado, si hay: la venta tiene que existir y estar viva.
const ganado = filas.find((f) => f.estado === "ganado");
if (ganado) {
  const { data: l } = await admin.from("leads").select("oportunidad_id").eq("id", ganado.lead_id).single();
  const { data: v } = await admin.from("ventas").select("monto_total, moneda, anulada_at").eq("oportunidad_id", l.oportunidad_id).is("anulada_at", null).order("fecha_venta", { ascending: false }).limit(1).single();
  af("el ganado apunta a una venta viva con ese importe", v && Number(v.monto_total) === Number(ganado.valor) && v.moneda === ganado.moneda, `${ganado.codigo}: ${ganado.valor} ${ganado.moneda}`);
} else console.log("  (sin ganados en el período: no se verifica el importe)");
// Un cotizado: hay una cotización enviada.
const cotizado = filas.find((f) => f.estado === "cotizado");
if (cotizado) {
  const { data: l } = await admin.from("leads").select("oportunidad_id").eq("id", cotizado.lead_id).single();
  const { count } = await admin.from("cotizaciones").select("id", { count: "exact", head: true }).eq("oportunidad_id", l.oportunidad_id).not("enviada_at", "is", null);
  af("el cotizado tiene cotización enviada", count > 0, `${cotizado.codigo}: ${count} enviada(s)`);
}
// Un descartado con expediente rechazado trae el motivo.
const rech = filas.find((f) => f.estado === "descartado" && f.detalle);
af("los rechazados traen el motivo", Boolean(rech) || !filas.some((f) => f.estado === "descartado"), rech ? `${rech.codigo}: ${rech.detalle}` : "no hay rechazados con expediente");
// Los descartados por Central no llevan expediente.
const conGclid = filas.filter((f) => f.gclid && ["calificado", "cotizado", "ganado"].includes(f.estado)).length;
console.log(`  para Google Ads irían ${conGclid} conversiones`);

console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
