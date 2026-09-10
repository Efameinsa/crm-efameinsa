// Comprueba la regla de la 0207, no el texto de la pantalla: postventa puede
// AGREGAR el teléfono de un cliente de la ruta que no tenía ninguno —aunque la
// ficha sea de la cartera de otro comercial— y NO puede pisar el que ya está.
//
//   node --env-file=.env.local scripts/_verificar-telefono-desde-la-ruta.mjs
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

// El caso se busca vivo: un cliente de la ruta, SIN teléfono, cuya ficha es de
// otro comercial. Si mañana ya no queda ninguno, la prueba lo dice y no miente.
const { rows: [caso] } = await pg.query(`
  select c.id::text cuenta, c.razon_social, p.codigo_comercial dueno
    from oportunidades o
    join cuentas c on c.id = o.cuenta_id
    join perfiles p on p.id = c.comercial_id
   where o.tipo_postventa = 'mantenimiento'
     and p.codigo_comercial not in ('PV', 'PV1')
     and not exists (select 1 from contactos ct where ct.cuenta_id = c.id
                       and ct.telefono_normalizado is not null and ct.telefono_normalizado <> '')
   limit 1`);

if (!caso) { console.log("No quedan clientes de la ruta sin teléfono en cartera ajena: nada que probar."); await pg.end(); process.exit(0); }
console.log(`Caso: ${caso.razon_social} — ficha de ${caso.dueno}, hoy sin ningún número.\n`);

const pv = await como("postventa1@efameinsa.com");

// 1. Lo que hoy no podía: escribir sobre la ficha de otro.
const directo = await pv.from("contactos").insert({ cuenta_id: caso.cuenta, nombre: "Prueba", telefono: "999888777" });
afirmar("la ficha ajena sigue siendo de solo lectura", Boolean(directo.error), directo.error?.code ?? "¡entró!");

// 2. Lo que la 0207 sí permite.
const { data: r1, error: e1 } = await pv.rpc("anotar_telefono_de_ruta", {
  p_cuenta: caso.cuenta, p_telefono: "987 654 321", p_nombre: "Prueba de la ruta",
});
afirmar("puede anotar el teléfono que faltaba", !e1 && /anotado/i.test(String(r1)), e1?.message ?? String(r1));

const { rows: [guardado] } = await pg.query(
  `select telefono, nombre from contactos where cuenta_id = $1 and telefono_normalizado <> '' limit 1`, [caso.cuenta]);
afirmar("queda guardado tal como se escribió", guardado?.telefono === "987 654 321", guardado?.telefono);

// 3. Y lo que no: pisar el número que ya está.
const { data: r2 } = await pv.rpc("anotar_telefono_de_ruta", { p_cuenta: caso.cuenta, p_telefono: "911111111" });
afirmar("no pisa un número ya cargado", /ya tiene tel/i.test(String(r2)), String(r2));
const { rows: [sigue] } = await pg.query(
  `select telefono from contactos where cuenta_id = $1 and telefono_normalizado <> '' limit 1`, [caso.cuenta]);
afirmar("el número original sigue intacto", sigue?.telefono === "987 654 321", sigue?.telefono);

// 4. Basura no es un teléfono.
const { error: e3 } = await pv.rpc("anotar_telefono_de_ruta", { p_cuenta: caso.cuenta, p_telefono: "no tiene" });
afirmar("rechaza lo que no es un número", Boolean(e3), e3?.message?.slice(0, 60));

// 5. La cartera no se movió: esa es la regla de la 0080.
const { rows: [despues] } = await pg.query(
  `select p.codigo_comercial d from cuentas c join perfiles p on p.id = c.comercial_id where c.id = $1`, [caso.cuenta]);
afirmar("la cartera del cliente no se movió", despues?.d === caso.dueno, `${caso.dueno} → ${despues?.d}`);

// Se deshace: era una prueba sobre un cliente real.
await pg.query(`delete from contactos where cuenta_id = $1 and nombre = 'Prueba de la ruta'`, [caso.cuenta]);
const { rows: [limpio] } = await pg.query(
  `select count(*) n from contactos where cuenta_id = $1 and telefono_normalizado <> ''`, [caso.cuenta]);
afirmar("el cliente quedó como estaba", limpio.n === "0", `${limpio.n} teléfonos`);

console.log(`\n${ok} bien · ${mal} mal`);
await pg.end();
process.exit(mal ? 1 : 0);
