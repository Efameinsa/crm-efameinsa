// Prueba de que derivar un caso a postventa NO se lleva al cliente (0080).
//
// Se hace con la cuenta de práctica de C0 (migración 0072), con una sesión real
// de Central, y se limpia todo lo que crea. Lo que comprueba:
//
//   1. la cuenta sigue en la cartera de C0 después de la derivación;
//   2. el caso queda a nombre de postventa y con su clase (garantía);
//   3. no se registra un cambio de cartera en `asignaciones`;
//   4. sin decir de qué clase es el caso, la función se niega.
//
// Uso: node --env-file=.env.local scripts/probar-derivar-a-postventa.mjs

import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = process.env;
const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: perfiles } = await bd.query(
  `select id, nombre, codigo_comercial, rol, es_postventa from perfiles
    where codigo_comercial in ('C0','PV') or rol = 'central'`,
);
const c0 = perfiles.find((p) => p.codigo_comercial === "C0");
const pv = perfiles.find((p) => p.codigo_comercial === "PV");
const central = perfiles.find((p) => p.rol === "central");

const { rows: cuentas } = await bd.query(
  `select id, razon_social, num_doc, comercial_id from cuentas where num_doc = '20000000001'`,
);
const cuenta = cuentas[0];
if (!cuenta || cuenta.comercial_id !== c0.id) {
  console.error("✗ La cuenta de práctica 20000000001 no está en la cartera de C0; no se puede probar sin ensuciar datos reales.");
  process.exit(1);
}

// Sesión real de Central: la función exige el rol, no basta con el service role.
const { data: usuario } = await admin.auth.admin.getUserById(central.id);
const { data: enlace } = await admin.auth.admin.generateLink({ type: "magiclink", email: usuario.user.email });
const anon = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: sesion, error: eSesion } = await anon.auth.verifyOtp({
  token_hash: enlace.properties.hashed_token,
  type: "magiclink",
});
if (eSesion) throw eSesion;
const comoCentral = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
  global: { headers: { Authorization: `Bearer ${sesion.session.access_token}` } },
});

const { rows: nuevos } = await bd.query(
  `insert into leads (codigo, nombre_contacto, razon_social, num_doc, telefono, canal, area_destino, estado, recibido_at)
   values ('PRUEBA-PV-' || to_char(now(), 'HH24MISS'), 'Prueba postventa', $1, $2, '900000001',
           'llamada', 'comercial', 'pendiente_triaje', now())
   returning id, codigo`,
  [cuenta.razon_social, cuenta.num_doc],
);
const lead = nuevos[0];
let fallas = 0;
const revisar = (ok, texto) => {
  console.log(`${ok ? "✓" : "✗"} ${texto}`);
  if (!ok) fallas++;
};

try {
  // 4. Sin clase de caso, se niega.
  const sinClase = await comoCentral.rpc("asignar_lead", { p_lead_id: lead.id, p_comercial_id: pv.id });
  revisar(
    !!sinClase.error && /clase|garant/i.test(sinClase.error.message),
    `Sin decir de qué clase es el caso, no deja derivar (${sinClase.error?.message ?? "NO FALLÓ"})`,
  );

  // 1-3. Con la clase, deriva el caso sin tocar la cartera.
  const { data: oportunidadId, error } = await comoCentral.rpc("asignar_lead", {
    p_lead_id: lead.id,
    p_comercial_id: pv.id,
    p_tipo_postventa: "garantia",
  });
  if (error) {
    revisar(false, `La derivación falló: ${error.message}`);
  } else {
    const { rows: despues } = await bd.query(`select comercial_id, cartera_desde from cuentas where id = $1`, [cuenta.id]);
    revisar(despues[0].comercial_id === c0.id, "El cliente sigue en la cartera de C0 después de derivar a postventa");

    const { rows: caso } = await bd.query(
      `select comercial_id, tipo_postventa, etapa from oportunidades where id = $1`,
      [oportunidadId],
    );
    revisar(caso[0].comercial_id === pv.id, "El caso quedó a nombre de postventa");
    revisar(caso[0].tipo_postventa === "garantia", `El caso quedó marcado como garantía (${caso[0].tipo_postventa})`);

    const { rows: asig } = await bd.query(`select count(*)::int n from asignaciones where lead_id = $1`, [lead.id]);
    revisar(asig[0].n === 0, "No se registró un cambio de cartera que no ocurrió");

    await bd.query(`delete from oportunidades where id = $1`, [oportunidadId]);
  }
} finally {
  // Limpieza: el contacto que la derivación pudo crear, el lead y nada más.
  await bd.query(`delete from contactos where cuenta_id = $1 and telefono = '900000001'`, [cuenta.id]);
  await bd.query(`delete from leads where id = $1`, [lead.id]);
  await bd.end();
}

console.log(fallas === 0 ? "\n✓ Todo bien: postventa recibe el caso, no el cliente.\n" : `\n✗ ${fallas} comprobación(es) fallaron.\n`);
process.exit(fallas === 0 ? 0 : 1);
