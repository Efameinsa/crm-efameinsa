// Lo que Ariana ve y lo que no, comprobado con su sesión (0213), y que a Rubí
// no se le tocó nada.
//
//   BASE=http://localhost:3000 node --env-file=.env.local scripts/_verificar-pv1-solo-preventivo.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

const BASE = process.env.BASE ?? "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}
async function pedir(cookie, ruta) {
  const r = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
  const h = await r.text();
  // OJO: un `redirect()` de un layout NO devuelve 3xx acá. La respuesta ya
  // empezó a viajar cuando el guardia decide, así que Next manda el 200 con la
  // orden adentro del cuerpo —`NEXT_REDIRECT;replace;/destino;307`— y el
  // navegador la obedece. Buscar un «Location» daba verde falso: la primera
  // versión de esta prueba dio 4 rojos sobre un guardia que sí funcionaba.
  const m = h.match(/NEXT_REDIRECT;replace;([^;]+);/);
  return { estado: r.status, destino: m ? m[1] : null, h };
}
// La barra es lo único con enlaces a /postventa y /comercial en el HTML de
// cualquiera de sus pantallas; se mira entera, no el primer <nav> que aparezca.
const menu = (h) => h;

const pv1 = await sesion("postventa1@efameinsa.com");
console.log("Ariana (PV1), la cuenta que solo vende preventivo:");
let x = await pedir(pv1, "/comercial/ruta");
af("entra a su campaña", x.estado === 200, `${x.estado}`);
const barra = menu(x.h);
af("el menú le ofrece «Preventivos por vender»", barra.includes("Preventivos por vender"));
af("…y «Ventas de la empresa»", barra.includes("Ventas de la empresa"));
af("…y el cotizador", barra.includes("Cotizaciones"));
af("…y sus ventas emitidas", barra.includes("Ventas emitidas"));
af("…y sus clientes", barra.includes("Clientes que atiendo"));
af("NO le ofrece la bandeja del área", !/href="\/postventa"/.test(barra), "sin enlace a /postventa");
af("NO le ofrece el control de pedidos ni las atenciones", !/href="\/postventa\//.test(barra), "sin enlaces a /postventa/…");

for (const ruta of ["/postventa", "/postventa/control", "/postventa/atenciones", "/postventa/equipos"]) {
  const y = await pedir(pv1, ruta);
  af(`${ruta} la devuelve a su campaña`, y.destino === "/comercial/ruta", `${y.estado} → ${y.destino ?? "entró"}`);
}

console.log("\nRubí (PV), el área entera: nada le cambió.");
const pv = await sesion(process.env.CORREO_PV ?? "postventa@efameinsa.com");
x = await pedir(pv, "/postventa");
af("su bandeja abre igual, sin rebote", x.estado === 200 && x.destino === null, `${x.estado} → ${x.destino ?? "entró"}`);
const barraPv = menu(x.h);
af("conserva la bandeja y los pedidos", /href="\/postventa"/.test(barraPv) && /href="\/postventa\/control"/.test(barraPv));
af("y también vende preventivo", barraPv.includes("Preventivos por vender") && barraPv.includes("Ventas de la empresa"));

console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
