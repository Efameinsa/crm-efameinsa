// Lo desplegado el 10-09, comprobado en producción con las sesiones reales:
// las ventas de la empresa para postventa, la tanda «Sin teléfono» de la ruta
// y el PDF que ya no se va a una pestaña en blanco.
//
//   node --env-file=.env.local scripts/_verificar-tanda-1009-produccion.mjs
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
const BASE = "https://crm.efameinsa.com";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
async function sesion(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const jar = new Map();
  const ssr = createServerClient(url, anon, { cookies: { getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })), setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)) } });
  await ssr.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; ");
}
const sinScripts = (h) => h.replace(new RegExp("<script[^]*?</script>", "gi"), "");
let ok = 0, mal = 0;
const af = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };
async function pedir(cookie, ruta) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}${ruta}`, { headers: { cookie } });
  const h = sinScripts(await r.text());
  return { estado: r.status, ms: Date.now() - t0, h };
}

const pv = await sesion("postventa1@efameinsa.com");

console.log("Las ventas de la empresa (PV1):");
let x = await pedir(pv, "/comercial/parque?todos=1");
af("abre", x.estado === 200, `${x.estado} · ${x.ms} ms · ${Math.round(x.h.length / 1024)} KB`);
af("es la lista de ventas y no la del parque fichado", x.h.includes("Las ventas de la empresa"));
af("dice de quién es cada cliente", (x.h.match(/cartera de /g) ?? []).length > 20, `${(x.h.match(/cartera de /g) ?? []).length} chips`);
af("trae a los clientes sin equipo fichado", x.h.includes("sin ficha de equipo"));
af("se puede trabajar por año", x.h.includes("Compró en"));
af("no muestra montos", !/S\/\s?\d|US\$\s?\d/.test(x.h));
af("ofrece el mantenimiento desde la fila", x.h.includes("Ofrecer mantenimiento"));

console.log("\nRuta de mantenimiento (PV1):");
x = await pedir(pv, "/comercial/ruta");
af("abre", x.estado === 200, `${x.estado} · ${x.ms} ms`);
af("ofrece la tanda «Sin teléfono»", x.h.includes("Sin teléfono"));
x = await pedir(pv, "/comercial/ruta?tel=sin");
af("la tanda filtra", x.estado === 200 && x.h.includes("Anotar el número"), `${x.estado}`);

console.log("\nCotizaciones (PV1):");
x = await pedir(pv, "/comercial/cotizaciones");
af("abre", x.estado === 200, `${x.estado} · ${x.ms} ms`);
af("el PDF ya no sale en pestaña nueva", !/href="\/api\/cotizaciones\/[0-9a-f-]+\/pdf"/.test(x.h), "sin enlaces directos al PDF");

console.log("\nGerencia:");
const g = await sesion("gerencia@efameinsa-crm.local");
x = await pedir(g, "/gerencia/aprobaciones");
af("abre", x.estado === 200, `${x.estado} · ${x.ms} ms`);
x = await pedir(g, "/gerencia/auditoria");
af("auditoría abre", x.estado === 200, `${x.estado}`);

console.log(`\n${ok} bien · ${mal} mal`);
process.exit(mal ? 1 : 0);
