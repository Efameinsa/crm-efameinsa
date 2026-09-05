// Cuando el informe y su venta quedan sueltos, cada uno por su lado.
//
// EL SÍNTOMA. Brenda, 05-09: hizo su informe de cierre ayer y en su «Mi día»
// le sigue apareciendo «Ventas sin informe de cierre». Pedía que se lo
// borraran. No hay que borrar nada: el informe existe —001-2026 de EFAMEINSA,
// emitido el 04-09 a las 18:28— y la venta también; lo único que faltaba era
// que estuvieran atados. Borrar la venta habría hecho desaparecer una venta de
// verdad de su récord.
//
// EL MECANISMO QUE DEBERÍA HACERLO SOLO. Desde la 0105 hay dos disparadores
// que atan informe y venta: uno cuando nace la venta y otro cuando se emite el
// informe. Los dos exigen que no haya ambigüedad —un solo informe emitido y
// sin venta, una sola venta sin informe, del mismo cliente y con menos de siete
// días de diferencia—, y si hay dos candidatos no adivinan. Está bien que sea
// así.
//
// Ese mecanismo funciona: probado el 05-09 sobre este mismo caso, volver a
// emitir el informe lo ata solo. No pudimos reconstruir por qué no se disparó
// el 04-09 a las 18:28. Por eso existe este script: cuando aparezca de nuevo,
// se repara sin tocar la base a mano y sin adivinar.
//
// QUÉ HACE. Busca las ventas del CRM sin informe y, para cada una, un informe
// emitido, sin anular y sin venta, del mismo cliente y a menos de siete días.
// Solo ata cuando la pareja es ÚNICA por los dos lados: los mismos criterios
// del disparador. Lo que queda ambiguo lo informa y no lo toca.
//
// Uso:
//   node --env-file=.env.local scripts/atar-informes-sueltos.mjs            (solo mira)
//   node --env-file=.env.local scripts/atar-informes-sueltos.mjs --aplicar

import pg from "pg";

const APLICAR = process.argv.includes("--aplicar");
const bd = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const q = async (s, p = []) => (await bd.query(s, p)).rows;

// Las ventas del CRM que hoy aparecen «sin informe de cierre», con el informe
// que les corresponde cuando la pareja no deja dudas.
const parejas = await q(`
  with sueltas as (
    select v.id venta_id, v.fecha_venta, v.monto_total, v.moneda,
           o.cuenta_id, o.comercial_id, c.razon_social, p.codigo_comercial
      from ventas v
      join oportunidades o on o.id = v.oportunidad_id
      join cuentas c on c.id = o.cuenta_id
      left join perfiles p on p.id = o.comercial_id
     where v.origen = 'crm' and v.anulada_at is null
       and not exists (select 1 from informes_cierre x where x.venta_id = v.id)
  )
  select s.*,
         (select count(*) from informes_cierre i
           where i.cuenta_id = s.cuenta_id and i.emitido_at is not null
             and i.anulado_at is null and i.venta_id is null
             and abs(i.fecha - s.fecha_venta) <= 7) informes_candidatos,
         (select count(*) from ventas v2
            join oportunidades o2 on o2.id = v2.oportunidad_id
           where o2.cuenta_id = s.cuenta_id and v2.origen = 'crm' and v2.anulada_at is null
             and abs(v2.fecha_venta - s.fecha_venta) <= 7
             and not exists (select 1 from informes_cierre x where x.venta_id = v2.id)) ventas_candidatas,
         (select i.id from informes_cierre i
           where i.cuenta_id = s.cuenta_id and i.emitido_at is not null
             and i.anulado_at is null and i.venta_id is null
             and abs(i.fecha - s.fecha_venta) <= 7 limit 1) informe_id,
         (select i.codigo from informes_cierre i
           where i.cuenta_id = s.cuenta_id and i.emitido_at is not null
             and i.anulado_at is null and i.venta_id is null
             and abs(i.fecha - s.fecha_venta) <= 7 limit 1) informe_codigo,
         (select i.monto_total from informes_cierre i
           where i.cuenta_id = s.cuenta_id and i.emitido_at is not null
             and i.anulado_at is null and i.venta_id is null
             and abs(i.fecha - s.fecha_venta) <= 7 limit 1) informe_total
    from sueltas s
   order by s.fecha_venta desc`);

const claras = parejas.filter((p) => p.informes_candidatos === "1" && p.ventas_candidatas === "1");
const ambiguas = parejas.filter((p) => p.informes_candidatos !== "1" && Number(p.informes_candidatos) > 0);
const sinInforme = parejas.filter((p) => Number(p.informes_candidatos) === 0);

console.log(`${parejas.length} venta(s) del CRM sin informe atado.\n`);

if (claras.length) {
  console.log(`SE PUEDEN ATAR SIN DUDAS (${claras.length}):`);
  for (const p of claras) {
    console.log(`  ${p.codigo_comercial ?? "—"} · ${String(p.razon_social).slice(0, 42)}`);
    console.log(`     venta ${String(p.fecha_venta).slice(0, 10)} ${p.moneda} ${p.monto_total}  ←→  informe ${p.informe_codigo} (${p.informe_total})`);
  }
  console.log();
}
if (ambiguas.length) {
  console.log(`AMBIGUAS, NO SE TOCAN (${ambiguas.length}): hay más de un informe o más de una venta candidata.`);
  for (const p of ambiguas) console.log(`  ${String(p.razon_social).slice(0, 44)} · ${p.informes_candidatos} informes / ${p.ventas_candidatas} ventas`);
  console.log();
}
if (sinInforme.length) {
  console.log(`SIN INFORME TODAVÍA (${sinInforme.length}): el comercial aún no lo hizo. Es lo que el aviso debe mostrar.`);
  for (const p of sinInforme.slice(0, 10))
    console.log(`  ${p.codigo_comercial ?? "—"} · ${String(p.razon_social).slice(0, 40)} · ${String(p.fecha_venta).slice(0, 10)} ${p.moneda} ${p.monto_total}`);
  if (sinInforme.length > 10) console.log(`  … y ${sinInforme.length - 10} más`);
  console.log();
}

if (!APLICAR) {
  console.log(claras.length ? "Para atarlas: volver a correr con --aplicar" : "Nada que atar.");
  await bd.end();
  process.exit(0);
}

if (claras.length === 0) {
  await bd.end();
  process.exit(0);
}

await bd.query("begin");
try {
  for (const p of claras) {
    await bd.query(`update informes_cierre set venta_id = $1 where id = $2 and venta_id is null`, [p.venta_id, p.informe_id]);
    console.log(`atado: ${p.informe_codigo} ←→ venta del ${String(p.fecha_venta).slice(0, 10)} · ${p.razon_social}`);
  }
  await bd.query("commit");
  console.log("\nAplicado.");
} catch (e) {
  await bd.query("rollback");
  console.error("Revertido por error:", e.message);
  process.exit(1);
}

console.log("\n== COMPROBACIÓN: ¿siguen apareciendo como ventas sin informe? ==");
console.table(
  await q(`select c.razon_social, v.fecha_venta, v.monto_total
             from ventas v join oportunidades o on o.id=v.oportunidad_id join cuentas c on c.id=o.cuenta_id
            where v.id = any($1) and not exists (select 1 from informes_cierre x where x.venta_id = v.id)`,
    [claras.map((p) => p.venta_id)]),
);
await bd.end();
