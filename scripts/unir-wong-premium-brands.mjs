/**
 * 23-09-2026 · Katerine (C5): unir WONG LU VEGA EDGARDO LORENZO (RUC
 * 10082588600, su ficha desde el 14-08, cotizado por Open desde mayo) con
 * PREMIUM BRANDS S.A.C (RUC 20515112554), ficha que Central abrió hoy 10:10
 * con el lead PRO-09749 y derivó a Moisés (C2). Es el mismo requerimiento
 * con un contacto nuevo (Johnny García Juárez, 954782771): lo dijo Katerine
 * y lo dejó escrito Moisés a las 12:37 («Es prospecto de Katerine…») al
 * pasar su expediente a «derivada».
 *
 * fusionar_cuentas() no une dos fichas con RUC propio («revísela a mano»):
 * esto es esa revisión, con los mismos pasos. Queda PREMIUM BRANDS (el RUC
 * con el que se factura; el RUC manda sobre el nombre), en cartera de
 * Katerine y con su antigüedad del 14-08.
 *
 * Uso: node --env-file=.env.local scripts/unir-wong-premium-brands.mjs [--aplicar]
 */
import pg from "pg";

const ORIGEN = "776bb880-28d9-466b-8bc1-41e3d4342f33"; // WONG LU VEGA EDGARDO LORENZO
const DESTINO = "90359fd3-a812-458a-9ec2-95eb967dd5de"; // PREMIUM BRANDS S.A.C
const KATERINE = "4379b0d4-1d15-419a-9090-a22686f5eef8";
const SANTOS = "492bced6-10ab-4d0c-8e4b-e430e0510b08";
const MOTIVO =
  "Mismo cliente: WONG LU VEGA EDGARDO LORENZO (RUC 10082588600) es la ficha con que Katerine cotiza a este cliente desde mayo; PREMIUM BRANDS S.A.C es la empresa, y entró hoy por WhatsApp con otro contacto (Johnny García Juárez, PRO-09749). Unidas a pedido de Katerine el 23-09; Moisés (C2) lo confirmó en su llamada de las 12:37.";

const aplicar = process.argv.includes("--aplicar");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (s, p = []) => c.query(s, p).then((r) => r.rows);
const n = (s, p) => c.query(s, p).then((r) => r.rowCount);
try {
  await q("begin");
  const [o] = await q("select * from cuentas where id = $1 for update", [ORIGEN]);
  const [d] = await q("select * from cuentas where id = $1 for update", [DESTINO]);
  if (o.fusionada_en || d.fusionada_en || o.comercial_id !== KATERINE) throw new Error("las fichas ya no están como se revisaron");
  const moises = d.comercial_id;

  // Johnny quedó dos veces: Katerine lo agregó a su ficha a las 12:38 (sin
  // correo). Queda el de Central, que trae el correo de la empresa.
  const borrados = await n("delete from contactos where cuenta_id = $1 and telefono = '954782771'", [ORIGEN]);

  const movidos = {};
  for (const [tabla, col] of [
    ["oportunidades", "cuenta_id"], ["contactos", "cuenta_id"], ["atenciones", "cuenta_id"], ["servicios_postventa", "cuenta_id"],
  ]) movidos[tabla] = await n(`update ${tabla} set ${col} = $2 where ${col} = $1`, [ORIGEN, DESTINO]);
  await q("select set_config('app.fusionando_cuentas', 'si', true)");
  for (const tabla of ["informes_cierre", "informes_servicio", "equipos_instalados", "cotizaciones_historicas", "leads", "soporte_tecnico", "visitas_planta", "aperturas_llamada", "asignaciones", "wa_asignaciones_automaticas"])
    movidos[tabla] = await n(`update ${tabla} set cuenta_id = $2 where cuenta_id = $1`, [ORIGEN, DESTINO]);
  movidos.inventario = await n("update inventario_equipos set reservado_para = $2 where reservado_para = $1", [ORIGEN, DESTINO]);
  movidos.sedes = await n("update cuentas set cuenta_padre_id = $2 where cuenta_padre_id = $1 and id <> $2", [ORIGEN, DESTINO]);

  await q(
    `update cuentas set comercial_id = $2,
            cartera_desde = least(cartera_desde, $3),
            ultima_venta_at = greatest(ultima_venta_at, $4),
            distrito = coalesce(distrito, $5),
            notas = concat_ws(E'\n', notas, $6::text),
            updated_at = now()
      where id = $1`,
    [DESTINO, KATERINE, o.cartera_desde, o.ultima_venta_at, o.distrito, `Antes: WONG LU VEGA EDGARDO LORENZO, RUC 10082588600 (ficha unida el 23-09). ${MOTIVO}`],
  );
  await q("update cuentas set fusionada_en = $2, updated_at = now() where id = $1", [ORIGEN, DESTINO]);
  await q(
    "insert into asignaciones (cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas) values ($1, $2, $3, 'decision_gerencia', $4, $5)",
    [DESTINO, moises, KATERINE, SANTOS, `Fichas unidas (WONG LU VEGA → PREMIUM BRANDS). ${MOTIVO}`],
  );

  console.log({ contacto_repetido_borrado: borrados, movidos });
  console.log(await q(`select cu.razon_social, cu.num_doc, cu.cartera_desde, p.nombre comercial, (select count(*) from oportunidades where cuenta_id = cu.id) expedientes, (select string_agg(nombre || ' ' || telefono, ' · ') from contactos where cuenta_id = cu.id) contactos from cuentas cu join perfiles p on p.id = cu.comercial_id where cu.id = $1`, [DESTINO]));
  await q(aplicar ? "commit" : "rollback");
  console.log(aplicar ? "APLICADO" : "ensayo: deshecho (use --aplicar)");
} catch (e) {
  await q("rollback");
  console.error("NO se aplicó:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
