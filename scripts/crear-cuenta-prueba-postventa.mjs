// ============================================================
// CRM EFAMEINSA · Cuenta de práctica para mirar postventa por dentro
// ============================================================
// Darwin, 27-08: «quiero entrar a la sesión de postventa pero me dice que
// cambió la contraseña; creame una cuenta postventa2@efameinsa.com (cuenta de
// prueba que no ensucie reportes de gerencia ni nada), solo quiero ver cómo
// funciona por dentro».
//
// NO se le toca la contraseña a `postventa@efameinsa.com`: esa es la cuenta con
// la que el área trabaja de verdad y cambiársela la dejaría afuera.
//
// La cuenta nueva lleva dos marcas y cada una hace una cosa distinta:
//   · `es_postventa` (0075) → ve las pantallas del área.
//   · `es_prueba`    (0072) → su trabajo NO entra en ningún indicador de
//     gerencia ni de Central. El script verifica que ese filtro siga vivo en
//     las funciones antes de crear nada: si alguien lo sacó sin darse cuenta,
//     es mejor enterarse acá que descubrirlo en el reporte del lunes.
//
// Uso:
//   node --env-file=.env.local scripts/crear-cuenta-prueba-postventa.mjs
//   node --env-file=.env.local scripts/crear-cuenta-prueba-postventa.mjs --borrar

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const CORREO = "postventa2@efameinsa.com";
const NOMBRE = "Postventa (práctica)";
const CODIGO = "PV0";
const BORRAR = process.argv.includes("--borrar");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey || !process.env.DATABASE_URL) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o DATABASE_URL.");
  process.exit(1);
}

const auth = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const { data: existentes } = await auth.auth.admin.listUsers({ page: 1, perPage: 1000 });
const usuario = existentes?.users.find((u) => u.email?.toLowerCase() === CORREO);

// ── Baja ────────────────────────────────────────────────────────────────────
if (BORRAR) {
  if (!usuario) {
    console.log("No existe esa cuenta; no hay nada que borrar.");
  } else {
    const { rows } = await bd.query(
      `select (select count(*) from oportunidades where comercial_id = $1) as oportunidades,
              (select count(*) from servicios_postventa where responsable_id = $1) as servicios`,
      [usuario.id],
    );
    console.log("Lo que dejó la cuenta:", rows[0]);
    await bd.query("update perfiles set activo = false where id = $1", [usuario.id]);
    await auth.auth.admin.deleteUser(usuario.id);
    console.log("✓ Cuenta eliminada y perfil desactivado.");
  }
  await bd.end();
  process.exit(0);
}

// ── Antes de crear nada: ¿el filtro de cuentas de prueba sigue en pie? ──────
// Sin esto la promesa de «no ensucia los reportes» sería una suposición.
const { rows: funciones } = await bd.query(
  `select proname, pg_get_functiondef(oid) like '%not p.es_prueba%' as filtra
     from pg_proc where proname in ('resumen_gerencia', 'supervision_diaria')`,
);
console.log("Filtro de cuentas de prueba en los reportes:");
for (const f of funciones) console.log(`  ${f.proname.padEnd(20)} ${f.filtra ? "✓ activo" : "✗ FALTA"}`);
if (funciones.some((f) => !f.filtra) || funciones.length < 2) {
  console.error("\nUna de las funciones de gerencia no filtra las cuentas de prueba. Se detiene acá.");
  await bd.end();
  process.exit(1);
}

// ── Alta ────────────────────────────────────────────────────────────────────
const clave = `Prueba-${randomBytes(5).toString("hex")}`;
let id;
if (usuario) {
  await auth.auth.admin.updateUserById(usuario.id, { password: clave, email_confirm: true });
  id = usuario.id;
  console.log("\nLa cuenta ya existía: se le puso contraseña nueva.");
} else {
  const { data, error } = await auth.auth.admin.createUser({
    email: CORREO, password: clave, email_confirm: true, user_metadata: { nombre: NOMBRE },
  });
  if (error) throw error;
  id = data.user.id;
  console.log("\nCuenta creada.");
}

await bd.query(
  `insert into perfiles (id, nombre, rol, codigo_comercial, activo, es_postventa, es_prueba)
   values ($1, $2, 'comercial', $3, true, true, true)
   on conflict (id) do update set
     nombre = excluded.nombre, rol = 'comercial', codigo_comercial = excluded.codigo_comercial,
     activo = true, es_postventa = true, es_prueba = true`,
  [id, NOMBRE, CODIGO],
);

// ── Qué va a ver al entrar ──────────────────────────────────────────────────
const { rows: [n] } = await bd.query(`
  select (select count(*) from servicios_postventa where not completado) as agenda_pendiente,
         (select count(*) from servicios_postventa where not completado and fecha_despacho < current_date) as atrasados,
         (select count(*) from servicios_postventa where not completado and fecha_despacho is null) as sin_fecha,
         (select count(*) from servicios_postventa where completado) as completados,
         (select count(*) from servicios_postventa
           where pedido_ejecutado_at is not null and liquidacion_at is not null and aprobado_at is null) as nuevos_pedidos,
         (select count(*) from equipos_instalados) as equipos,
         (select count(*) from soporte_tecnico) as soporte`);

const { rows: [p] } = await bd.query(
  `select es_postventa, es_prueba, codigo_comercial from perfiles where id = $1`, [id]);

console.log("\n── La cuenta ───────────────────────────────────────────");
console.log(`  Correo     : ${CORREO}`);
console.log(`  Contraseña : ${clave}`);
console.log(`  Marcas     : es_postventa=${p.es_postventa} · es_prueba=${p.es_prueba} · código ${p.codigo_comercial}`);
console.log("\n── Lo que va a encontrar ───────────────────────────────");
console.log(`  Agenda pendiente     : ${n.agenda_pendiente}  (${n.atrasados} atrasados, ${n.sin_fecha} sin fecha)`);
console.log(`  Completados          : ${n.completados}`);
console.log(`  Informes de soporte  : ${n.soporte}`);
console.log(`  Nuevos pedidos       : ${n.nuevos_pedidos}   ← vacío hasta que Central marque sus dos checks`);
console.log(`  Equipos instalados   : ${n.equipos}   ← vacío hasta que se cierre el primer pedido`);
console.log("\n  Casos derivados por Central: 0 — los casos son del perfil PV, no de este.");
console.log("\n⚠  La agenda que se ve es la REAL. Mirar no cambia nada, pero los botones");
console.log("   de la ficha (aprobar, marcar prueba, registrar despacho) escriben sobre");
console.log("   las filas de verdad. Para practicar clicks conviene sembrar un pedido de");
console.log("   prueba aparte antes de tocar.\n");

await bd.end();
