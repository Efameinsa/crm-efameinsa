// La agenda diaria de postventa (Carlos, 09-09, «urgente» dos veces).
//
// Los cuatro números de la pantalla se comparan contra la base, PERO leída con
// la misma sesión que mira la pantalla: postventa ve 116 de los 132 pedidos
// vivos y comparar contra el total daba dos falsas alarmas. Si el área va a
// dejar el board, lo que tiene que cuadrar es lo que ELLA ve.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-dia-del-area.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.BASE ?? "http://localhost:3000";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

const CORREO = "postventa@efameinsa.com";
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email: CORREO });

// Una sesión para pedir la pantalla…
const jar = new Map();
const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
const cookie = [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");

// …y otra para preguntarle a la base lo mismo que la pantalla.
const { data: link2 } = await admin.auth.admin.generateLink({ type: "magiclink", email: CORREO });
const cli = createClient(url, anon, { auth: { persistSession: false } });
await cli.auth.verifyOtp({ token_hash: link2.properties.hashed_token, type: "magiclink" });

const { data: vivos } = await cli
  .from("servicios_postventa")
  .select("id, completado, cerrado_at, despachado_at, puesta_en_marcha, apertura_despacho_at, fecha_despacho")
  .eq("completado", false)
  .is("cerrado_at", null)
  .limit(1000);
const { count: sinTomar } = await cli
  .from("atenciones")
  .select("id", { count: "exact", head: true })
  .eq("etapa", "registro")
  .is("cerrado_at", null)
  .is("tomada_at", null);

const p = vivos ?? [];
const esperado = {
  "Despachados, falta la puesta en marcha": p.filter((x) => x.despachado_at && !x.puesta_en_marcha).length,
  "Despachos programados": p.filter((x) => !x.despachado_at && x.apertura_despacho_at && x.fecha_despacho).length,
  "Listos para despachar, sin fecha": p.filter((x) => !x.despachado_at && x.apertura_despacho_at && !x.fecha_despacho).length,
  "Todavía sin apertura de despacho": p.filter((x) => !x.despachado_at && !x.apertura_despacho_at).length,
};

const html = (await (await fetch(`${BASE}/postventa/agenda`, { headers: { cookie } })).text())
  .replace(new RegExp("<script[^]*?</script>", "gi"), "");
const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

console.log(`Lo que postventa puede ver: ${p.length} pedidos vivos\n`);
afirmar("la agenda trae el bloque del día", texto.includes("El día del área"));
for (const [rotulo, cuantos] of Object.entries(esperado)) {
  const i = texto.indexOf(rotulo);
  // El número va justo antes del rótulo, en su propio renglón.
  const antes = i < 0 ? "" : texto.slice(Math.max(0, i - 40), i).trim();
  afirmar(`«${rotulo}» dice ${cuantos}`, i >= 0 && antes.endsWith(String(cuantos)), antes.slice(-24));
}
afirmar("suman todos los pedidos vivos, sin contar ninguno dos veces",
  Object.values(esperado).reduce((t, x) => t + x, 0) === p.length,
  `${Object.values(esperado).reduce((t, x) => t + x, 0)} de ${p.length}`);
afirmar(`dice los ${sinTomar} casos sin tomar de la bandeja`,
  texto.includes(`${sinTomar} casos sin tomar`) || texto.includes(`${sinTomar} caso sin tomar`));
afirmar("y sigue estando el calendario", texto.includes("Calendario de atenciones"));
console.log(`\n${ok} ok, ${mal} mal.`);
process.exit(mal ? 1 : 0);
