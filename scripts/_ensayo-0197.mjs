// Ensayo de la 0197 DENTRO de una transacción que se revierte: comprueba que
// corre entera y que la lista queda en el orden que se quiere, sin dejar nada.
import { readFileSync } from "node:fs";
import { Client } from "pg";
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const sql = readFileSync("supabase/migrations/0197_cotizacion_enviada_es_un_resultado.sql", "utf8");
await bd.query("begin");
try {
  await bd.query(sql);
  const { rows } = await bd.query("select orden, codigo, nombre, dias_sugeridos, efecto from catalogo_resultados_gestion where activo order by orden");
  console.table(rows);
  const { rows: [c] } = await bd.query("select count(*) n from catalogo_resultados_gestion where orden is null");
  console.log(`sin orden: ${c.n} (tiene que ser 0)`);
  // Idempotente: correrla dos veces no debe romper ni duplicar.
  await bd.query(sql);
  const { rows: [d] } = await bd.query("select count(*) n from catalogo_resultados_gestion where codigo='COTIZACION_ENVIADA'");
  console.log(`«Cotización enviada» tras correrla DOS veces: ${d.n} fila (tiene que ser 1)`);
  console.log("\n✓ la migración corre entera");
} catch (e) {
  console.log("✗ falló:", e.message);
} finally {
  await bd.query("rollback");
  const { rows: [f] } = await bd.query("select count(*) n from catalogo_resultados_gestion");
  console.log(`(revertido — el catálogo sigue con ${f.n} filas)`);
  await bd.end();
}
