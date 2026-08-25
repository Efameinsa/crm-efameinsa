// ============================================================
// CRM EFAMEINSA · Corregir el número de una cotización, y el contador
// ============================================================
// Por orden de gerencia. Esto NO es una operación normal: el número de una
// cotización es su identidad y la migración 0012 lo bloquea a nivel de base
// justamente para que no se toque («les ha pasado que el mismo número se envía
// al cliente con dos precios distintos»). Se destraba el candado a propósito,
// para un caso puntual, y queda escrito por qué.
//
// EL CASO DEL 25-08. El contador de la serie OPEN se sembró con 446 —«el último
// número oficial leído del archivo»— pero el archivo ya tenía 447, 448 y 449 de
// otros clientes, y gerencia confirmó que la serie real va por 461. Resultado:
// las dos cotizaciones OPEN que el CRM emitió hoy salieron con números que ya
// pertenecían a otros documentos:
//
//   Presu_447-26  CERSUR              choca con  447-26  ZERCOM PERÚ S.A.C
//   Presu_448-26  San Juan de Dios    choca con  448-26  YOPLAC OCHOA
//
// ANTES DE ESCRIBIR SE COMPRUEBA QUE EL NÚMERO DESTINO ESTÉ LIBRE, en el CRM y
// en el archivo. Renumerar encima de otro documento sería cambiar un problema
// por el mismo problema.
//
// Uso:
//   node --env-file=.env.local scripts/renumerar-cotizacion.mjs <id> <numero> [--aplicar]
//   node --env-file=.env.local scripts/renumerar-cotizacion.mjs --contador OPEN <numero> [--aplicar]

import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const args = process.argv.slice(2).filter((a) => a !== "--aplicar");

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const anio = Number(new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }).slice(0, 4));
const yy = String(anio).slice(-2);

/** ¿Ese número ya está usado por otro documento, acá o en el archivo? */
async function numeroOcupado(serie, numero, exceptoId) {
  const { rows: enCrm } = await bd.query(
    `select id, codigo from cotizaciones where serie = $1 and correlativo = $2 and id <> coalesce($3::uuid, '00000000-0000-0000-0000-000000000000'::uuid)`,
    [serie, numero, exceptoId ?? null],
  );
  const { rows: enArchivo } = await bd.query(
    `select codigo, cliente from cotizaciones_historicas where serie = $1 and correlativo = $2 and anio = $3`,
    [serie, numero, anio],
  );
  return { enCrm, enArchivo };
}

if (args[0] === "--contador") {
  const [, serie, valor] = args;
  const clave = `${serie}-${anio}`;
  const { rows } = await bd.query(`select ultimo from correlativos where clave = $1`, [clave]);
  console.log(`\ncontador ${clave}: ${rows[0]?.ultimo ?? "no existe"} → ${valor}`);
  console.log(`  la próxima cotización de ${serie} saldrá con el número ${Number(valor) + 1}`);
  if (APLICAR) {
    await bd.query(
      `insert into correlativos (clave, ultimo) values ($1, $2)
       on conflict (clave) do update set ultimo = excluded.ultimo`,
      [clave, Number(valor)],
    );
    console.log("✓ contador actualizado\n");
  } else {
    console.log("\nNada se ha modificado. Agregá --aplicar.\n");
  }
  await bd.end();
  process.exit(0);
}

const [id, numeroTxt] = args;
if (!id || !numeroTxt) {
  console.error("Uso: renumerar-cotizacion.mjs <id> <numero> [--aplicar]");
  process.exit(1);
}
const numero = Number(numeroTxt);

const { rows: cots } = await bd.query(
  `select c.id, c.codigo, c.correlativo, c.serie, c.estado, c.enviada_at, c.total, c.moneda,
          cu.razon_social, p.codigo_comercial
     from cotizaciones c
     join oportunidades o on o.id = c.oportunidad_id
     join cuentas cu on cu.id = o.cuenta_id
     left join perfiles p on p.id = o.comercial_id
    where c.id = $1`,
  [id],
);
if (cots.length === 0) {
  console.error("✗ No existe esa cotización.");
  process.exit(1);
}
const c = cots[0];
const nuevoCodigo = `Presu_${numero}-${yy}`;

console.log(`\n${c.razon_social}  ·  ${c.codigo_comercial}  ·  ${c.moneda} ${c.total}`);
console.log(`  serie ${c.serie} · ${c.estado}${c.enviada_at ? ` · enviada ${String(c.enviada_at).slice(0, 16)}` : ""}`);
console.log(`  ${c.codigo}  →  ${nuevoCodigo}`);

const { enCrm, enArchivo } = await numeroOcupado(c.serie, numero, c.id);
if (enCrm.length || enArchivo.length) {
  console.error(`\n✗ El número ${numero} ya está ocupado. No se toca nada:`);
  for (const x of enCrm) console.error(`    CRM     ${x.codigo}`);
  for (const x of enArchivo) console.error(`    archivo ${x.codigo}  ${x.cliente}`);
  process.exit(1);
}
console.log(`  el ${numero} está libre en el CRM y en el archivo`);

if (!APLICAR) {
  console.log("\nNada se ha modificado. Agregá --aplicar.\n");
  await bd.end();
  process.exit(0);
}

// El candado de inmutabilidad es un trigger, y service_role no lo salta: hay
// que desactivarlo para esta sesión, como dice la nota de la migración 0012.
await bd.query("set session_replication_role = replica");
await bd.query(`update cotizaciones set correlativo = $2, codigo = $3 where id = $1`, [c.id, numero, nuevoCodigo]);
await bd.query("set session_replication_role = origin");

console.log(`\n✓ ${c.codigo} pasó a ser ${nuevoCodigo}.`);
console.log(`  El PDF se genera con ese número: quien lo descargue ahora lo ve corregido.`);
console.log(`  ⚠ Si ya se le mandó el PDF anterior al cliente, hay que reenviárselo.\n`);
await bd.end();
