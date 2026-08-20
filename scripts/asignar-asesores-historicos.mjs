// Cierra el mapeo nombre→código de las cotizaciones históricas con las
// decisiones que dio gerencia el 20-08-2026.
//
// De dónde viene esto: de las 5.860 cotizaciones del histórico, 5.434 se
// asignaron solas porque el correo de la firma trae el código del buzón
// (comercialN@…). Quedaron 426 sin asesor, y este script resuelve 205 de
// ellas con tres decisiones:
//
//  1. POST VENTA (PV). Juan Francisco Guerreros, Hever Gonzales, Mercedes
//     Guillén y Nicole Pillaca firman cotizaciones de 2026 pero no tienen
//     buzón propio — por eso el correo no traía código. Gerencia definió que
//     el grupo es Post Venta, así que se crea el código PV y sus cotizaciones
//     van ahí. Tiene un efecto colateral bueno: deja medible cuánto cotiza
//     postventa, que hasta ahora se perdía entre "sin asesor".
//
//  2. C10 → C1. Las 7 cotizaciones de 2025 que salieron del buzón C10
//     (firmadas por Jesús Córdova) se suman a C1, por decisión de gerencia.
//     No se crea el código C10.
//
//  3. Tres firmas sueltas que el propio histórico resuelve sin preguntarle a
//     nadie: Brenda Taboada (ella ES C1), Jenny Valdiviezo y Gabriela
//     Lliuyacc, cuyas demás cotizaciones salieron de C1 y de C8 (hoy C1).
//
// REGLA QUE SE RESPETA: el código es la CARTERA, no la persona. Por eso NO se
// tocan las 8 cotizaciones que estas mismas personas firmaron desde el buzón
// de otro comercial: esas ya están en la cartera a la que corresponden.
//
// `asesor_codigo` NO se modifica: esa columna guarda lo que decía el correo
// del documento y es un dato de origen, no una conclusión. Lo que se escribe
// es `comercial_id`, que es lo que usan las carteras, la RLS y los reportes.
//
// Uso:
//   node --env-file=.env.local scripts/asignar-asesores-historicos.mjs [--aplicar]
// Sin --aplicar solo simula y no toca nada.

import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!process.env.DATABASE_URL || !url || !serviceKey) {
  console.error(
    "Faltan variables. Corran con: node --env-file=.env.local scripts/asignar-asesores-historicos.mjs",
  );
  process.exit(1);
}

const PV = { email: "pv@efameinsa-crm.local", nombre: "Post Venta", codigo: "PV" };

// Los patrones cortan ANTES de cualquier tilde a propósito ("Guillén" →
// 'mercedes guill%'), así no dependen de cómo se escribió el acento en cada
// documento. Todos se aplican solo sobre cotizaciones que siguen sin asesor.
const REGLAS = [
  { codigo: "PV", patrones: ["juan fran%guerreros%", "hever gonzale%", "mercedes guill%", "nicole pillaca%"] },
  { codigo: "C1", patrones: ["brenda taboa%", "jenny valdiviezo%", "gabriela lliuyacc%"] },
];

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

console.log(APLICAR ? "MODO: aplicar (se escriben los cambios)\n" : "MODO: simulación — nada se modifica (agregue --aplicar)\n");

// ---------- 1. El perfil PV ----------
async function asegurarPerfilPv() {
  const { rows } = await bd.query("select id, nombre from perfiles where codigo_comercial = $1", [PV.codigo]);
  if (rows.length) {
    console.log(`· El código ${PV.codigo} ya existe (${rows[0].nombre}).`);
    return rows[0].id;
  }
  if (!APLICAR) {
    console.log(`· Se crearía el perfil ${PV.codigo} (${PV.nombre}) con el usuario ${PV.email}.`);
    return null;
  }
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 200 });
  let usuario = lista?.users?.find((u) => u.email === PV.email);
  if (!usuario) {
    const { data, error } = await admin.auth.admin.createUser({
      email: PV.email,
      password: randomBytes(9).toString("base64url"),
      email_confirm: true,
    });
    if (error) throw error;
    usuario = data.user;
  }
  // Sin meta mensual: postventa no tiene cuota de venta.
  await bd.query(
    `insert into perfiles (id, nombre, rol, codigo_comercial, activo)
     values ($1, $2, 'comercial', $3, true)
     on conflict (id) do update set nombre = excluded.nombre, codigo_comercial = excluded.codigo_comercial`,
    [usuario.id, PV.nombre, PV.codigo],
  );
  console.log(`· Perfil ${PV.codigo} (${PV.nombre}) creado.`);
  return usuario.id;
}

const idPv = await asegurarPerfilPv();

// ---------- 2. Antes ----------
const { rows: antes } = await bd.query(`
  select coalesce(p.codigo_comercial, '(sin asesor)') as codigo, count(*)::int n
  from cotizaciones_historicas ch left join perfiles p on p.id = ch.comercial_id
  group by 1 order by n desc`);
console.log("\nANTES:");
for (const r of antes) console.log(`  ${r.codigo.padEnd(12)} ${r.n}`);

// ---------- 3. Las asignaciones ----------
async function idDe(codigo) {
  if (codigo === PV.codigo && idPv) return idPv;
  const { rows } = await bd.query("select id from perfiles where codigo_comercial = $1", [codigo]);
  return rows[0]?.id ?? null;
}

const movimientos = [];

for (const regla of REGLAS) {
  const destino = await idDe(regla.codigo);
  for (const patron of regla.patrones) {
    const { rows } = await bd.query(
      `select count(*)::int n, min(trim(asesor_nombre)) muestra
       from cotizaciones_historicas
       where comercial_id is null and asesor_nombre ilike $1`,
      [patron],
    );
    if (!rows[0].n) continue;
    movimientos.push({ patron, muestra: rows[0].muestra, n: rows[0].n, codigo: regla.codigo });
    if (APLICAR && destino) {
      await bd.query(
        `update cotizaciones_historicas set comercial_id = $1
         where comercial_id is null and asesor_nombre ilike $2`,
        [destino, patron],
      );
    }
  }
}

// C10 → C1: aquí manda el buzón, no la firma.
const destinoC1 = await idDe("C1");
const { rows: c10 } = await bd.query(
  "select count(*)::int n from cotizaciones_historicas where comercial_id is null and asesor_codigo = 'C10'",
);
if (c10[0].n) {
  movimientos.push({ patron: "buzón C10", muestra: "Jesús Córdova", n: c10[0].n, codigo: "C1" });
  if (APLICAR && destinoC1) {
    await bd.query(
      "update cotizaciones_historicas set comercial_id = $1 where comercial_id is null and asesor_codigo = 'C10'",
      [destinoC1],
    );
  }
}

console.log("\nMOVIMIENTOS:");
for (const m of movimientos) {
  console.log(`  ${String(m.n).padStart(4)} → ${m.codigo.padEnd(4)} ${m.muestra} (${m.patron})`);
}
console.log(`  ${String(movimientos.reduce((s, m) => s + m.n, 0)).padStart(4)} en total`);

// ---------- 4. Después ----------
const { rows: despues } = await bd.query(`
  select coalesce(p.codigo_comercial, '(sin asesor)') as codigo, count(*)::int n
  from cotizaciones_historicas ch left join perfiles p on p.id = ch.comercial_id
  group by 1 order by n desc`);
console.log("\nDESPUÉS:");
for (const r of despues) console.log(`  ${r.codigo.padEnd(12)} ${r.n}`);

const { rows: resto } = await bd.query(`
  select count(*) filter (where coalesce(asesor_nombre,'') <> '')::int con_nombre,
         count(*) filter (where coalesce(asesor_nombre,'') = '')::int sin_nombre
  from cotizaciones_historicas where comercial_id is null`);
console.log(
  `\nSin asesor quedan ${resto[0].con_nombre + resto[0].sin_nombre}: ${resto[0].sin_nombre} sin firma ni buzón` +
    ` (no hay dato con el que deducirlas) y ${resto[0].con_nombre} con firma.`,
);

if (!APLICAR) console.log("\nSimulación terminada. Repita con --aplicar para ejecutar.");
await bd.end();
