// ============================================================
// CRM EFAMEINSA · PV1, la cuenta de postventa de Ariana
// ============================================================
// Reunión de gerencia del 10-09. Carlos, mirando cómo Ariana suma sus
// gestiones de mantenimiento preventivo dentro de su cuenta de comercial:
// «es un grave error que ya viene de atrás… ya paremos eso». Y no es un caso
// suelto: entran dos o tres personas más y todas van a trabajar en las dos
// áreas. La decisión fue una cuenta por área, nunca mezcladas — «con una mano
// eres postventa, con otra eres gestor».
//
// LO QUE SE MUEVE Y LO QUE NO:
//
// · Se mueven los EXPEDIENTES de mantenimiento que hoy están en su cuenta
//   comercial. No la ficha del cliente: la cartera del cliente sigue siendo de
//   quien lo vendió, que es la regla de la 0202 —se pide el expediente, no el
//   cliente—. Si moviéramos las fichas, le quitaríamos clientes a comerciales
//   que no tienen nada que ver.
// · Su cartera comercial pura no se toca.
// · Se mueven también los leads y las atenciones colgados de esos expedientes,
//   porque si no la agenda queda partida entre las dos cuentas.
//
// SIN PIN, A PROPÓSITO. Carlos: «jala todo primero de Comercial 4… que no le
// pida PIN». Es un arrastre de una sola vez, no un permiso permanente: este
// script lo hace de golpe y lo deja anotado.
//
// NO SE LE QUITA `hace_postventa` A C4 TODAVÍA. Se quita cuando ella confirme
// que entra a PV1 y ve su trabajo; hasta entonces, dejarla sin las dos puertas
// sería dejarla sin ninguna.
//
//   node --env-file=.env.local scripts/crear-postventa1-ariana.mjs
//   node --env-file=.env.local scripts/crear-postventa1-ariana.mjs --aplicar
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const CORREO = "postventa1@efameinsa.com";
const NOMBRE = "Ariana Flores (Postventa)";
const CODIGO = "PV1";
const DE = "C4";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.DATABASE_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL.");
  process.exit(1);
}

const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { rows: [origen] } = await bd.query(
  `select id, nombre from perfiles where codigo_comercial = $1`, [DE]);
if (!origen) { console.error(`No existe ${DE}`); process.exit(1); }

// Qué se movería, contado antes de tocar nada.
const { rows: [cuenta] } = await bd.query(
  `select
     count(*) expedientes,
     count(*) filter (where etapa::text not in ('historico','rechazada','venta')) vivos,
     count(*) filter (where cerrada_at is null and proxima_accion_at < current_date
                        and etapa::text not in ('historico','rechazada','venta')) vencidos
   from oportunidades where comercial_id = $1 and tipo_postventa is not null`, [origen.id]);
const { rows: [queda] } = await bd.query(
  `select count(*) n from oportunidades where comercial_id = $1 and tipo_postventa is null`, [origen.id]);

console.log(`De ${DE} (${origen.nombre}) a ${CODIGO}:`);
console.log(`  · expedientes de postventa que se mueven: ${cuenta.expedientes}`);
console.log(`      de ellos vivos: ${cuenta.vivos} · vencidos: ${cuenta.vencidos}`);
console.log(`  · su cartera comercial que NO se toca:    ${queda.n}`);

if (!APLICAR) {
  console.log("\n(ensayo: no se tocó nada — para hacerlo, --aplicar)");
  await bd.end();
  process.exit(0);
}

// ── 1. La cuenta ────────────────────────────────────────────────────────────
const { data: existentes } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
let usuario = existentes?.users.find((u) => u.email?.toLowerCase() === CORREO);
const clave = `Efa-${randomBytes(4).toString("hex")}`;

if (usuario) {
  await auth.auth.admin.updateUserById(usuario.id, { password: clave });
  console.log("\nLa cuenta ya existía; se le puso una contraseña nueva.");
} else {
  const { data, error } = await auth.auth.admin.createUser({
    email: CORREO, password: clave, email_confirm: true, user_metadata: { nombre: NOMBRE },
  });
  if (error) throw error;
  usuario = data.user;
  console.log("\nCuenta creada.");
}

// `es_postventa` es lo que abre las vistas del área (no `hace_postventa`, que
// es la llave que se le presta a un comercial).
await bd.query(
  `insert into perfiles (id, nombre, rol, codigo_comercial, cargo, activo, es_postventa, es_prueba, meta_mensual)
   values ($1, $2, 'comercial', $3, 'Postventa', true, true, false, 0)
   on conflict (id) do update set
     nombre = excluded.nombre, rol = 'comercial', codigo_comercial = excluded.codigo_comercial,
     cargo = excluded.cargo, activo = true, es_postventa = true, es_prueba = false`,
  [usuario.id, NOMBRE, CODIGO],
);

// ── 2. El arrastre ──────────────────────────────────────────────────────────
await bd.query("begin");
try {
  const { rows: ops } = await bd.query(
    `update oportunidades set comercial_id = $2, updated_at = now()
      where comercial_id = $1 and tipo_postventa is not null
      returning id, lead_id`, [origen.id, usuario.id]);
  const ids = ops.map((o) => o.id);
  const leads = ops.map((o) => o.lead_id).filter(Boolean);

  const { rowCount: nLeads } = leads.length
    ? await bd.query(`update leads set asignado_a = $2, updated_at = now()
                       where id = any($1::uuid[]) and estado = 'asignado'`, [leads, usuario.id])
    : { rowCount: 0 };

  const { rowCount: nAt } = ids.length
    ? await bd.query(`update atenciones set asignado_a = $2, updated_at = now()
                       where oportunidad_id = any($1::uuid[]) and asignado_a = $3`, [ids, usuario.id, origen.id])
    : { rowCount: 0 };

  // Queda escrito por qué se movió, que es lo que va a leer quien lo revise.
  await bd.query(
    `insert into asignaciones (cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas)
     select distinct o.cuenta_id, $1::uuid, $2::uuid, 'decision_gerencia'::motivo_asignacion, $3::uuid,
       'Reunión de gerencia del 10-09: el mantenimiento preventivo que Ariana gestionaba desde su cuenta de comercial pasa a su cuenta de postventa (PV1). «Con una mano eres postventa, con otra eres gestor. Pero no mezclado» (Carlos). La ficha del cliente NO se movió: sigue siendo de quien la vendió.'
       from oportunidades o where o.id = any($4::uuid[]) and o.cuenta_id is not null`,
    [origen.id, usuario.id, (await bd.query(`select id from perfiles where rol='gerencia' and activo and nombre='Gerencia Comercial'`)).rows[0].id, ids]);

  await bd.query("commit");
  console.log(`Movidos: ${ops.length} expedientes · ${nLeads} contactos derivados · ${nAt} atenciones.`);
} catch (e) {
  await bd.query("rollback");
  console.error("✗ no se movió nada:", e.message);
  await bd.end();
  process.exit(1);
}

console.log(`\n  Usuario: ${CORREO}`);
console.log(`  Clave:   ${clave}`);
console.log("\nC4 conserva su llave de postventa por ahora: se le quita cuando Ariana confirme que entra bien a PV1.");
await bd.end();
