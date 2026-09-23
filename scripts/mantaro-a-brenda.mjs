/**
 * 23-09-2026 · CORPORACION HOTELERA MANTARO SAC (RUC 20507416137) pasa a la
 * cartera de Brenda (C1), pedido de Brenda y decisión de Santos (gerencia).
 *
 * 1. El cliente estaba partido: la ficha con RUC (Ariana, C4) y «… - HOTEL
 *    SUDAMERICA» sin RUC (Katerine, C5, nota de 05-2023), con el mismo
 *    contacto Carlos Novoa (998 194 367). Se une la sin RUC en la del RUC,
 *    con los pasos de fusionar_cuentas() (que pide PIN desde la pantalla).
 * 2. Se reasigna como lo hace reasignar_cartera(): cartera desde hoy y los
 *    expedientes abiertos pasan a Brenda. La venta de 2022 sigue siendo de
 *    Katerine y las gestiones siguen firmadas por quien las hizo (la llamada
 *    de Ariana del 21-09 queda suya).
 *
 * Liberable por la regla de 3 meses sin venta (última: 13-09-2022).
 * Uso: node --env-file=.env.local scripts/mantaro-a-brenda.mjs [--aplicar]
 */
import pg from "pg";

const RUC = "71c2efce-20bd-4040-bed0-22f97bb3ad45"; // CORPORACION HOTELERA MANTARO SAC
const SIN_RUC = "fb781ec3-0bd1-4756-a885-11796302c410"; // … - HOTEL SUDAMERICA
const BRENDA = "e03cde25-7d86-4e21-8abb-08c21a279ed4";
const SANTOS = "492bced6-10ab-4d0c-8e4b-e430e0510b08";
const MOTIVO = "Pasa a la cartera de Brenda (C1) a su pedido, por decisión de gerencia (Santos, 23-09). Liberable: sin venta desde el 13-09-2022.";

const aplicar = process.argv.includes("--aplicar");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = (s, p = []) => c.query(s, p).then((r) => r.rows);
const n = (s, p) => c.query(s, p).then((r) => r.rowCount);
try {
  await q("begin");
  const [d] = await q("select * from cuentas where id = $1 for update", [RUC]);
  const [o] = await q("select * from cuentas where id = $1 for update", [SIN_RUC]);
  if (d.fusionada_en || o.fusionada_en || d.comercial_id === BRENDA) throw new Error("las fichas ya no están como se revisaron");
  const ariana = d.comercial_id;

  // 1. Unir la ficha sin RUC. Carlos Novoa está en las dos: queda el de la
  //    ficha del RUC; su DNI (venía pegado al nombre) pasa a las notas.
  const contactoRepetido = await n("delete from contactos where cuenta_id = $1 and regexp_replace(coalesce(telefono,''), '[^0-9]', '', 'g') like '%998194367'", [SIN_RUC]);
  const movidos = {};
  for (const t of ["oportunidades", "contactos", "atenciones", "servicios_postventa"]) movidos[t] = await n(`update ${t} set cuenta_id = $2 where cuenta_id = $1`, [SIN_RUC, RUC]);
  await q("select set_config('app.fusionando_cuentas', 'si', true)");
  for (const t of ["informes_cierre", "informes_servicio", "equipos_instalados", "cotizaciones_historicas", "leads", "soporte_tecnico", "visitas_planta", "aperturas_llamada", "asignaciones", "wa_asignaciones_automaticas"])
    movidos[t] = await n(`update ${t} set cuenta_id = $2 where cuenta_id = $1`, [SIN_RUC, RUC]);
  await q("update cuentas set fusionada_en = $2, updated_at = now() where id = $1", [SIN_RUC, RUC]);

  // 2. Reasignar, igual que reasignar_cartera().
  await q(
    `update cuentas set comercial_id = $2, cartera_desde = hoy_lima(), updated_at = now(),
            notas = concat_ws(E'\n', notas, $3::text) where id = $1`,
    [RUC, BRENDA, `${MOTIVO} Se le unió la ficha «CORPORACION HOTELERA MANTARO SAC - HOTEL SUDAMERICA» (sin RUC, cartera de Katerine). Contacto: Carlos Miguel Novoa Narváez, DNI 07547542.`],
  );
  const ops = await q(
    `update oportunidades set comercial_id = $2, updated_at = now()
      where cuenta_id = $1 and etapa in ('asignada','filtrada','cotizada','seguimiento','potencial','historico') and comercial_id is distinct from $2
      returning id, etapa, lead_id`,
    [RUC, BRENDA],
  );
  const leads = await n("update leads set asignado_a = $2, updated_at = now() where id = any($1) and estado = 'asignado'", [ops.map((x) => x.lead_id).filter(Boolean), BRENDA]);
  await q("insert into asignaciones (cuenta_id, de_comercial, a_comercial, motivo, decidida_por, notas) values ($1, $2, $3, 'decision_gerencia', $4, $5)", [RUC, ariana, BRENDA, SANTOS, MOTIVO]);
  const abierto = ops.find((x) => x.etapa === "seguimiento");
  if (abierto)
    await q("insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ($1, 'nota', $2, $3, now())", [abierto.id, `${MOTIVO} Antes lo trabajaba Ariana (llamada del 21-09).`, SANTOS]);

  console.log({ contactoRepetido, movidos, expedientes_a_brenda: ops.map((x) => x.etapa), leads });
  console.log(await q(`select cu.razon_social, cu.num_doc, cu.cartera_desde, p.nombre, (select string_agg(o.etapa || ':' || pp.nombre, ', ') from oportunidades o join perfiles pp on pp.id = o.comercial_id where o.cuenta_id = cu.id) expedientes, (select string_agg(nombre || ' ' || telefono, ' · ') from contactos where cuenta_id = cu.id) contactos from cuentas cu join perfiles p on p.id = cu.comercial_id where cu.id = $1`, [RUC]));
  await q(aplicar ? "commit" : "rollback");
  console.log(aplicar ? "APLICADO" : "ensayo: deshecho (use --aplicar)");
} catch (e) {
  await q("rollback");
  console.error("NO se aplicó:", e.message);
  process.exitCode = 1;
} finally {
  await c.end();
}
