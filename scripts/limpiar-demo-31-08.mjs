// Deshace TODO lo sembrado el 31-08 para la demo de gerencia, y nada más:
// las 4 atenciones [demo 31-08], las fotos de los informes 901/902/908, los
// vínculos de carpeta de los 3 clientes PRUEBA, las 2 filas «CLIENTE EJEMPLO
// CRM» del índice y las 3 fotos del bucket. El banco de pruebas permanente
// (0088) no se toca: es la herramienta de capacitación de siempre.
//
// Uso: node --env-file=.env.local scripts/limpiar-demo-31-08.mjs
import { Client } from "pg";
import { createClient } from "@supabase/supabase-js";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { rowCount: a } = await pg.query(`delete from atenciones where es_prueba and detalle like '%[demo 31-08]'`);
console.log(`✓ ${a} atenciones de demo borradas`);

const { rowCount: b } = await pg.query(
  `update informes_servicio set fotos = '[]'::jsonb where es_prueba and correlativo in (901, 902, 908) and anio = 2026`,
);
console.log(`✓ ${b} informes de prueba sin las fotos de demo`);

const { rowCount: c } = await pg.query(
  `update cuentas set carpetas_servidor = null
   where razon_social in ('HOTEL PRUEBA MIRAFLORES E.I.R.L.','LAVANDERIA PRUEBA ANDINA S.A.C.','TEXTIL PRUEBA DEL SUR S.A.')`,
);
console.log(`✓ ${c} clientes PRUEBA desvinculados`);

const { rowCount: d } = await pg.query(`delete from carpetas_servidor where nombre = 'CLIENTE EJEMPLO CRM'`);
console.log(`✓ ${d} filas «CLIENTE EJEMPLO CRM» fuera del índice`);

const { data: rem, error } = await admin.storage
  .from("adjuntos")
  .remove(["pruebas/informes/lavadora-primus.jpeg", "pruebas/informes/secadora-giant-1.jpeg", "pruebas/informes/secadora-giant-2.jpeg"]);
console.log(error ? `✗ bucket: ${error.message}` : `✓ ${rem?.length ?? 0} fotos borradas del bucket`);

// Lo que queda a propósito: el vínculo REAL de COINREFRI con su carpeta real
// de fotos — no es una prueba, es el primer cliente vinculado de verdad.
const { rows: [coin] } = await pg.query(
  `select carpetas_servidor from cuentas where nombre_comercial = 'COINREFRI'`,
);
console.log(`· COINREFRI conserva su vínculo real: ${JSON.stringify(coin?.carpetas_servidor)}`);
await pg.end();
