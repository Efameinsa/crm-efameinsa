// La regla de la 0208, comprobada como la ve el área: postventa arranca de las
// VENTAS de toda la empresa, y el monto no viaja.
//
//   node --env-file=.env.local scripts/_verificar-parque-desde-ventas.mjs
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL, anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
let ok = 0, mal = 0;
const afirmar = (t, c, d = "") => { if (c) { ok++; console.log(`  ✓ ${t}${d ? " — " + d : ""}`); } else { mal++; console.log(`  ✗ ${t}${d ? " — " + d : ""}`); } };

async function como(email) {
  const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const cli = createClient(url, anon, { auth: { persistSession: false } });
  await cli.auth.verifyOtp({ token_hash: data.properties.hashed_token, type: "magiclink" });
  return cli;
}

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const { rows: [real] } = await pg.query(
  `select count(*) ventas, count(distinct o.cuenta_id) clientes
     from ventas v join oportunidades o on o.id = v.oportunidad_id
    where v.anulada_at is null and o.cuenta_id is not null`);
console.log(`En la base: ${real.ventas} ventas vivas de ${real.clientes} clientes.\n`);

console.log("Postventa (PV1):");
const pv = await como("postventa1@efameinsa.com");
const { data: suyas, error } = await pv.rpc("ventas_para_el_parque", { p_comercial: null });
// Una fila por CLIENTE, no por venta: 1.242 filas se pasan del tope de 1.000
// de PostgREST y bajan mil sin decirlo (0209).
afirmar("ve a todos los clientes a los que la empresa le vendió",
  !error && (suyas?.length ?? 0) === Number(real.clientes),
  error?.message ?? `${suyas?.length} de ${real.clientes}`);
afirmar("no la corta el tope de 1.000 de PostgREST", (suyas?.length ?? 0) !== 1000, `${suyas?.length} filas`);
afirmar("suma todas las ventas de la empresa",
  (suyas ?? []).reduce((a, v) => a + Number(v.ventas ?? 0), 0) === Number(real.ventas),
  `${(suyas ?? []).reduce((a, v) => a + Number(v.ventas ?? 0), 0)} de ${real.ventas}`);
afirmar("el monto NO viaja", !(suyas ?? []).some((v) => "monto_total" in v || "monto" in v),
  Object.keys(suyas?.[0] ?? {}).join(", "));
const clientes = new Set((suyas ?? []).map((v) => v.cuenta_id));

// La puerta de atrás: leer `ventas` a secas —donde SÍ está el monto— sigue
// dando solo lo suyo. PV1 tiene alguna venta propia; lo que no puede es ver la
// de los comerciales.
const { data: crudo } = await pv.from("ventas").select("id, monto_total").limit(2000);
afirmar("la tabla `ventas` no se abrió: el monto de la empresa sigue tapado",
  (crudo?.length ?? 0) < Number(real.ventas) * 0.1, `${crudo?.length ?? 0} de ${real.ventas} filas`);

// Y la ficha del cliente que aparece en la lista tiene que poder abrirse.
const alguna = [...clientes][0];
const { data: ficha } = await pv.from("cuentas").select("id, razon_social, comercial_id").eq("id", alguna).maybeSingle();
afirmar("puede abrir la ficha del cliente que la lista le muestra", Boolean(ficha), ficha?.razon_social);

console.log("\nUn comercial cualquiera (C5):");
const { rows: [c5] } = await pg.query(`select id from perfiles where codigo_comercial = 'C5'`);
const { data: correo } = await admin.auth.admin.getUserById(c5.id);
const cli = await como(correo.user.email);
const { data: deC5 } = await cli.rpc("ventas_para_el_parque", { p_comercial: null });
const { rows: [suyasReal] } = await pg.query(
  `select count(distinct o.cuenta_id) n from ventas v join oportunidades o on o.id = v.oportunidad_id
     join cuentas c on c.id = o.cuenta_id
    where v.anulada_at is null and c.comercial_id = $1`, [c5.id]);
afirmar("ve su cartera y no la de los demás", (deC5?.length ?? -1) === Number(suyasReal.n),
  `${deC5?.length} clientes · suyos ${suyasReal.n} · empresa ${real.clientes}`);

console.log(`\n${ok} bien · ${mal} mal`);
await pg.end();
process.exit(mal ? 1 : 0);
