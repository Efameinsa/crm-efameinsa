// El ensayo completo de la corrección de una derivación, simulando la sesión de
// Central igual que la hace la aplicación (rol authenticated + su uuid en el
// JWT). Todo ocurre dentro de transacciones que se DESHACEN: el contacto de
// práctica queda intacto para que lo corrija una persona desde la pantalla.
//
// Prueba los cuatro caminos:
//   1. Con el permiso del día (0111): entra sin código.
//   2. Sin permiso y con el código correcto del supervisor: entra.
//   3. Sin permiso y con un código equivocado: no entra.
//   4. Con el motivo demasiado corto: no entra.
//
// Uso: node --env-file=.env.local scripts/_ensayo-correccion-derivacion.mjs
import { Client } from "pg";

const bd = new Client({ connectionString: process.env.DATABASE_URL });
await bd.connect();
const uno = async (sql, p = []) => (await bd.query(sql, p)).rows[0] ?? null;

const central = await uno("select id, nombre from perfiles where rol='central' and not es_prueba limit 1");
const destino = await uno("select id, nombre, codigo_comercial from perfiles where codigo_comercial='C0'");
const lead = await uno(
  `select l.id, l.codigo, p.codigo_comercial as en_manos_de
     from leads l left join perfiles p on p.id = l.asignado_a
    where l.es_prueba and l.estado='asignado' and l.nombre_contacto like '%PRÁCTICA CORRECCIÓN%'
    order by l.created_at desc limit 1`,
);
if (!lead) {
  console.error("No hay contacto de práctica. Córralo primero: scripts/crear-derivacion-de-practica.mjs");
  process.exit(1);
}
console.log(`Contacto de práctica: ${lead.codigo} · hoy en manos de ${lead.en_manos_de}`);
console.log(`Se ensaya pasarlo a ${destino.codigo_comercial} · ${destino.nombre}\n`);

const MOTIVO = "Ensayo del circuito: la derivación fue a la comercial equivocada y se corrige.";

/** Corre la corrección como Central y deshace todo. */
async function ensayo(titulo, { pin, motivo = MOTIVO, sinPermisoDelDia = false }) {
  await bd.query("begin");
  try {
    if (sinPermisoDelDia) {
      // Se simula el día de mañana: el permiso vencido, el código obligatorio.
      await bd.query("update config_seguridad set valor = (now() - interval '1 hour')::text where clave = 'pin_supervisor_libre_hasta'");
    }
    await bd.query("set local role authenticated");
    await bd.query(`set local request.jwt.claims = '{"sub":"${central.id}","role":"authenticated"}'`);
    await bd.query("select redirigir_lead_con_pin($1, $2, $3, $4)", [lead.id, destino.id, pin, motivo]);
    console.log(`✓ ${titulo}: PASA`);
  } catch (e) {
    console.log(`✗ ${titulo}: ${String(e.message).slice(0, 110)}`);
  } finally {
    await bd.query("rollback");
  }
}

// 1 · Hoy, con el permiso de gerencia: sin código.
await ensayo("Hoy, sin código (permiso del día)", { pin: "" });

// 2 · Mañana, con el código correcto de un supervisor.
const sup = await uno("select id, nombre from perfiles where rol='gerencia' and activo order by created_at limit 1");
const codigo = await uno("select codigo_pin_supervisor($1, ventana_pin_actual()) as c", [sup.id]);
await ensayo(`Mañana, con el código de ${sup.nombre} (${codigo.c})`, { pin: codigo.c, sinPermisoDelDia: true });

// 3 · Mañana, con un código equivocado.
const malo = String((Number(codigo.c) + 1) % 10000).padStart(4, "0");
await ensayo(`Mañana, con un código equivocado (${malo})`, { pin: malo, sinPermisoDelDia: true });

// 4 · Sin explicar por qué.
await ensayo("Con el motivo en blanco", { pin: codigo.c, motivo: "ok" });

const despues = await uno("select p.codigo_comercial from leads l left join perfiles p on p.id=l.asignado_a where l.id=$1", [lead.id]);
console.log(`\nEl contacto de práctica sigue con ${despues.codigo_comercial}: el ensayo no movió nada.`);
await bd.end();
