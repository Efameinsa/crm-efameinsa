// Prueba de punta a punta de la 0367 DENTRO de una transacción que se deshace:
// aplica la migración, vincula un celular a Brenda, mete posiciones como lo
// hace /api/campo/osmand (con repetido) y mira las políticas. No deja nada.
//   node --env-file=.env.local scripts/_probar-0367-rollback.mjs
import { readFileSync } from "node:fs";
import { Client } from "pg";

const BRENDA = "e03cde25-7d86-4e21-8abb-08c21a279ed4";
const sql = readFileSync(new URL("../supabase/migrations/0367_gps_celular_campo.sql", import.meta.url), "utf8");
const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const ver = async (titulo, q, p) => {
  const { rows } = await c.query(q, p);
  console.log(titulo, JSON.stringify(rows));
  return rows;
};
try {
  await c.query("begin");
  await c.query("set local lock_timeout = '5s'");
  await c.query(sql);
  await ver("filas viejas sin registrada_at:", "select count(*)::int n from ubicaciones_campo where registrada_at is null");
  await ver("filas viejas con registrada_at = created_at:", "select count(*)::int n from ubicaciones_campo where registrada_at = created_at");
  const [d] = await ver(
    "celular:",
    "insert into dispositivos_campo (user_id, token, nombre) values ($1, 'k7pxm-3hq9r-abcde-23456', 'prueba') returning id",
    [BRENDA],
  );
  const insertar = (hora, lat) =>
    c.query(
      `insert into ubicaciones_campo (user_id, dispositivo_id, origen, estado, lat, lon, precision_m, velocidad_mps, rumbo, bateria, registrada_at, detalle)
       values ($1, $2, 'app', 'ok', $3, -77.04, 5, 8.3, 90, 64, $4, 'en movimiento') on conflict (dispositivo_id, registrada_at) do nothing`,
      [BRENDA, d.id, lat, hora],
    );
  await insertar("2026-10-02T10:00:00-05:00", -12.05);
  await insertar("2026-10-02T10:01:00-05:00", -12.051);
  const r = await insertar("2026-10-02T10:01:00-05:00", -12.051);
  console.log("repetido insertó:", r.rowCount);
  await ver("del celular:", "select origen, lat, registrada_at, created_at, bateria from ubicaciones_campo where dispositivo_id = $1 order by registrada_at", [d.id]);
  // El navegador sigue entrando igual (sin dispositivo, sin registrada_at): vale la de llegada.
  await c.query("insert into ubicaciones_campo (user_id, origen, estado, lat, lon) values ($1, 'periodica', 'ok', -12, -77)", [BRENDA]);
  await c.query("insert into ubicaciones_campo (user_id, origen, estado, lat, lon) values ($1, 'periodica', 'ok', -12, -77)", [BRENDA]);
  await ver("navegador con registrada_at:", "select count(*)::int n from ubicaciones_campo where dispositivo_id is null and registrada_at is not null and lat = -12");
  try {
    await c.query("savepoint s"); await c.query("insert into ubicaciones_campo (user_id, origen, estado, lat, lon) values ($1, 'otra', 'ok', -12, -77)", [BRENDA]);
    console.log("✗ aceptó un origen inventado");
  } catch (e) {
    await c.query("rollback to savepoint s");
    console.log("origen inventado rechazado:", e.message.slice(0, 80));
  }
  // Políticas: un comercial cualquiera (la propia Brenda) no ve los tokens.
  await c.query("savepoint rls");
  await c.query("set local role authenticated");
  await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: BRENDA, role: "authenticated" })]);
  await ver("Brenda ve tokens (debe ser 0):", "select count(*)::int n from dispositivos_campo");
  try {
    await c.query("savepoint s2"); await c.query("insert into dispositivos_campo (user_id, token) values ($1, 'zzzzz-zzzzz-zzzzz-zzzzz')", [BRENDA]);
    console.log("✗ Brenda pudo crear un celular");
  } catch (e) {
    await c.query("rollback to savepoint s2");
    console.log("Brenda no puede crear celulares:", e.message.slice(0, 80));
  }
  await c.query("rollback to savepoint rls");
  const { rows: ger } = await c.query("select id from perfiles where rol = 'gerencia' and activo limit 1");
  if (ger[0]) {
    await c.query("set local role authenticated");
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ger[0].id, role: "authenticated" })]);
    await ver("gerencia ve el celular:", "select count(*)::int n from dispositivos_campo where token = 'k7pxm-3hq9r-abcde-23456'");
    await ver("gerencia ve las posiciones del GPS:", "select count(*)::int n from ubicaciones_campo where origen = 'app'");
  }
} finally {
  await c.query("rollback");
  await c.end();
  console.log("— deshecho, no quedó nada");
}
