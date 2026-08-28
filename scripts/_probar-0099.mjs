// Verifica contra producción la regla de la migración 0099. Todo en una
// transacción con rollback: no deja rastro.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const { rows } = await c.query("select id, codigo, adjuntos from informes_cierre where emitido_at is not null and cliente_nombre like '%PRUEBA%' order by created_at desc limit 1");
const inf = rows[0];
const previos = inf.adjuntos;
const A = { tipo: "voucher", path: "cierres/x/uno.jpg", nombre: "v.jpg", tipo_mime: "image/jpeg", tamano: 10, subido_por: null, subido_at: "2026-08-28T00:00:00Z" };
const B = { tipo: "orden_compra", path: "cierres/x/dos.pdf", nombre: "oc.pdf", tipo_mime: "application/pdf", tamano: 20, subido_por: null, subido_at: "2026-08-28T00:01:00Z" };

let fallas = 0;
async function prueba(etiqueta, esperaExito, sql, params) {
  await c.query("savepoint p");
  try {
    await c.query(sql, params);
    if (esperaExito) console.log(`  ✓ ${etiqueta}`);
    else { console.log(`  ✗ FALLA — ${etiqueta}: pasó y debía rechazarse`); fallas++; }
    if (!esperaExito) await c.query("rollback to savepoint p");
  } catch (e) {
    await c.query("rollback to savepoint p");
    if (esperaExito) { console.log(`  ✗ FALLA — ${etiqueta}: ${e.message}`); fallas++; }
    else console.log(`  ✓ ${etiqueta} — rechazado: «${e.message}»`);
  }
}

await c.query("begin");
console.log(`Informe emitido Nº ${inf.codigo}, con ${previos.length} documentos.\n`);
console.log("SOBRE UN INFORME YA EMITIDO");
await prueba("agrega un voucher", true, "update informes_cierre set adjuntos=$1 where id=$2", [JSON.stringify([...previos, A]), inf.id]);
await prueba("agrega un segundo documento", true, "update informes_cierre set adjuntos=$1 where id=$2", [JSON.stringify([...previos, A, B]), inf.id]);
await prueba("quitar uno ya adjuntado", false, "update informes_cierre set adjuntos=$1 where id=$2", [JSON.stringify(previos.slice(1)), inf.id]);
await prueba("cambiar el monto", false, "update informes_cierre set monto_total=1 where id=$1", [inf.id]);
await prueba("cambiar el lugar de entrega", false, "update informes_cierre set entrega_lugar='otro' where id=$1", [inf.id]);
await prueba("colar un cambio de monto junto con un adjunto", false, "update informes_cierre set adjuntos=$1, monto_total=1 where id=$2", [JSON.stringify([...previos, A]), inf.id]);
await prueba("cambiar el correlativo (el Nº del documento)", false, "update informes_cierre set correlativo=999 where id=$1", [inf.id]);
await c.query("rollback");

console.log("\nSOBRE UN BORRADOR (sin emitir) todo sigue libre");
const { rows: bs } = await c.query("select id from informes_cierre where emitido_at is null limit 1");
if (bs[0]) {
  await c.query("begin");
  await prueba("edita el monto", true, "update informes_cierre set monto_total=monto_total where id=$1", [bs[0].id]);
  await prueba("quita adjuntos", true, "update informes_cierre set adjuntos='[]'::jsonb where id=$1", [bs[0].id]);
  await c.query("rollback");
}

const { rows: fin } = await c.query("select adjuntos from informes_cierre where id=$1", [inf.id]);
console.log(`\nEl informe quedó intacto: ${fin[0].adjuntos.length} documentos.`);
console.log(fallas === 0 ? "\nTODO CORRECTO." : `\n${fallas} FALLA(S).`);
await c.end();
process.exit(fallas === 0 ? 0 : 1);
