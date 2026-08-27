// ============================================================
// CRM EFAMEINSA · Dar o quitar la tarea de postventa a un comercial
// ============================================================
// La capacidad `hace_postventa` (migración 0093) le suma a un comercial las
// pantallas del área SIN cambiarle el rol: sigue midiéndose como vendedor,
// sigue aterrizando en «Mi día» y solo alcanza a los clientes de su cartera.
//
// Se prende y se apaga con un comando porque tiene que ser reversible: si
// Ariana deja de hacer postventa, se apaga y no queda nada que limpiar.
//
// Uso:
//   node --env-file=.env.local scripts/marcar-hace-postventa.mjs C4
//   node --env-file=.env.local scripts/marcar-hace-postventa.mjs C4 --quitar
//   node --env-file=.env.local scripts/marcar-hace-postventa.mjs        (lista)

import { Client } from "pg";

const codigo = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2].toUpperCase() : null;
const QUITAR = process.argv.includes("--quitar");

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

if (!codigo) {
  const { rows } = await bd.query(
    `select codigo_comercial, nombre, es_postventa, hace_postventa
       from perfiles where activo and rol = 'comercial' order by codigo_comercial nulls last`);
  console.log("\nQuién puede entrar a las pantallas de postventa:\n");
  console.table(rows.map((r) => ({
    código: r.codigo_comercial,
    nombre: r.nombre,
    "es del área": r.es_postventa ? "sí (área completa)" : "—",
    "lo hace además": r.hace_postventa ? "sí (solo su cartera)" : "—",
  })));
  await bd.end();
  process.exit(0);
}

const { rows: [antes] } = await bd.query(
  `select id, nombre, es_postventa, hace_postventa from perfiles where codigo_comercial = $1 and activo`, [codigo]);
if (!antes) {
  console.error(`No hay un comercial activo con código ${codigo}.`);
  await bd.end();
  process.exit(1);
}
if (antes.es_postventa) {
  console.log(`${antes.nombre} (${codigo}) ES del área de postventa: ya tiene acceso completo. No hace falta esta marca.`);
  await bd.end();
  process.exit(0);
}

await bd.query(`update perfiles set hace_postventa = $2 where id = $1`, [antes.id, !QUITAR]);

// Cuántos casos de postventa tiene hoy, que es lo que va a ver al entrar.
const { rows: [n] } = await bd.query(`
  select (select count(*) from oportunidades where comercial_id = $1 and tipo_postventa is not null)::int casos,
         (select count(*) from servicios_postventa s join cuentas c on c.id = s.cuenta_id
           where c.comercial_id = $1 and not s.es_prueba)::int despachos,
         (select count(*) from equipos_instalados e join cuentas c on c.id = e.cuenta_id
           where c.comercial_id = $1 and not e.es_prueba)::int equipos`, [antes.id]);

console.log(`\n${QUITAR ? "Quitada" : "Dada"} la tarea de postventa a ${antes.nombre} (${codigo}).`);
if (!QUITAR) {
  console.log(`\n  En su barra aparece la sección POSTVENTA debajo de lo suyo.`);
  console.log(`  Alcance: solo los clientes de SU cartera.`);
  console.log(`    · casos de postventa asignados : ${n.casos}`);
  console.log(`    · despachos de sus clientes    : ${n.despachos}`);
  console.log(`    · equipos de sus clientes      : ${n.equipos}`);
  console.log(`\n  Sus gestiones de postventa se cuentan aparte en la supervisión y`);
  console.log(`  NO entran en la meta de ${(await bd.query("select valor from parametros where clave='meta_seguimientos_diarios'")).rows[0]?.valor ?? 30} seguimientos ni en el embudo de gerencia.\n`);
}

await bd.end();
