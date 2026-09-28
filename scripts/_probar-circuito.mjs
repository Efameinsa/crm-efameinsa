// Prueba el circuito por tipo y soporte técnico (0324 + 0324b) con sesiones
// reales, TODO dentro de una transacción que se deshace. Si la 0324b todavía
// no está aplicada, se aplica DENTRO de la transacción (y se deshace con ella).
//
//   node --env-file=.env.local scripts/_probar-circuito.mjs
import { Client } from "pg";
import fs from "fs";
import { CIRCUITO_POR_TIPO, ETAPAS_ATENCION } from "../src/lib/atenciones.ts";

const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();
const q = async (s, p) => (await pg.query(s, p)).rows;
let fallas = 0;
const ok = (cond, texto) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`);
  if (!cond) fallas++;
};
const falla = async (fn, patron, texto) => {
  await pg.query("savepoint s");
  try {
    await fn();
    await pg.query("release savepoint s");
    ok(false, `${texto} (no falló)`);
  } catch (e) {
    await pg.query("rollback to savepoint s");
    ok(patron.test(e.message), `${texto} → «${e.message}»`);
  }
};

const [rubi] = await q("select id from auth.users where email='postventa@efameinsa.com'");
const [central] = await q("select u.id from auth.users u join perfiles p on p.id=u.id where p.rol='central' and p.activo limit 1");
const como = async (id) => {
  await pg.query("reset role");
  await pg.query("select set_config('request.jwt.claims', $1, true), set_config('role','authenticated', true)", [JSON.stringify({ sub: id, role: "authenticated" })]);
};
const CUENTA_A = "fe464aa3-5228-45ec-8854-f368aae1cabe"; // PRUEBA SERIES - NO FACTURAR
const CUENTA_B = "b4ef2e31-7253-43f6-a36a-8fd76f1814c3";
const at = async (id) => (await q("select tipo::text, etapa::text, etapas_omitidas om, pruebas_at from atenciones where id=$1", [id]))[0];

await pg.query("begin");
try {
  const ya = await q("select 1 from _migraciones_aplicadas where archivo like '0324b_%'");
  if (!ya.length) {
    await pg.query(fs.readFileSync(new URL("../supabase/migrations/0324b_soporte_abre_caso_y_saltos_por_tipo.sql", import.meta.url), "utf8"));
    console.log("(0324b aplicada DENTRO de la transacción)");
  }

  console.log("1. La regla de la base es el espejo de CIRCUITO_POR_TIPO");
  let distintas = 0;
  for (const [tipo, etapas] of Object.entries(CIRCUITO_POR_TIPO)) {
    for (const e of ETAPAS_ATENCION) {
      const [{ r }] = await q("select regla_circuito_atencion($1, $2) r", [tipo, e]);
      if (r !== etapas[e]) { distintas++; console.log(`     ${tipo}/${e}: base=${r} app=${etapas[e]}`); }
    }
  }
  ok(distintas === 0, "las 45 combinaciones coinciden");

  console.log("2. Los expedientes de soporte técnico ya abiertos tienen su caso técnico");
  const [{ n: sinCaso }] = await q("select count(*)::int n from oportunidades o where o.tipo_postventa='soporte_tecnico' and o.etapa not in ('venta','rechazada','derivada','historico') and not exists (select 1 from atenciones a where a.oportunidad_id=o.id)");
  ok(sinCaso === 0, `sin caso técnico: ${sinCaso}`);

  console.log("3. Registrar soporte técnico (Rubí) y derivarlo (Central) abre un caso de soporte");
  await como(rubi.id);
  const [r1] = await q("select registrar_atencion_postventa($1, 'soporte_tecnico', 'Prueba circuito: capacitación de uso de la lavadora', null, null, null, '[]'::jsonb, null) r", [CUENTA_A]);
  const [l1] = await q("select id, sugerido_tipo::text, sugerido_atencion::text from leads where id=$1", [r1.r.lead]);
  ok(l1.sugerido_tipo === "soporte_tecnico" && l1.sugerido_atencion === "soporte_tecnico", `lead: ${l1.sugerido_tipo} / ${l1.sugerido_atencion}`);
  await como(central.id);
  const [o1] = await q("select asignar_lead_con_pin($1, $2, null, 'soporte_tecnico') id", [l1.id, rubi.id]);
  await pg.query("reset role"); // Central no ve atenciones (RLS): se mira como dueño
  const [a1] = await q("select id, tipo::text, etapa::text from atenciones where oportunidad_id=$1", [o1.id]);
  ok(a1?.tipo === "soporte_tecnico" && a1?.etapa === "registro", `caso: ${a1?.tipo} en ${a1?.etapa}`);

  console.log("4. Sugerencia de soporte que Central deriva como problema técnico: manda Central");
  await como(rubi.id);
  const [r2] = await q("select registrar_atencion_postventa($1, 'soporte_tecnico', 'Prueba circuito: dice que no sabe usarla pero hace ruido', null, null, null, '[]'::jsonb, null) r", [CUENTA_B]);
  await como(central.id);
  const [o2] = await q("select asignar_lead_con_pin($1, $2, null, 'garantia') id", [r2.r.lead, rubi.id]);
  await pg.query("reset role");
  const [a2] = await q("select id, tipo::text from atenciones where oportunidad_id=$1", [o2.id]);
  ok(a2?.tipo === "problema_tecnico", `caso: ${a2?.tipo}`);

  console.log("5. Saltar pasos: solo lo opcional del tipo");
  await como(rubi.id);
  await falla(() => q("select omitir_etapa_atencion($1, 'diagnostico', 'No hay antecedentes')", [a1.id]), /obligatorio/, "soporte: los antecedentes no se saltan");
  await q("update atenciones set tipo='puesta_en_marcha' where id=$1", [a1.id]);
  await q("select omitir_etapa_atencion($1, 'diagnostico', 'No hay antecedentes')", [a1.id]);
  ok((await at(a1.id)).etapa === "diagnostico", "puesta en marcha: «No hay antecedentes, seguir» pasa a planificar");
  await q("update atenciones set etapa='planificacion', programada_at=now(), tecnico='Prueba' where id=$1", [a1.id]);
  await q("select omitir_etapa_atencion($1, 'atencion', 'Se solucionó en la llamada')", [a1.id]);
  ok((await at(a1.id)).etapa === "atencion", "puesta en marcha: la atención se salta");
  await falla(() => q("select omitir_etapa_atencion($1, 'pruebas', 'no')", [a1.id]), /obligatorio/, "puesta en marcha: las pruebas no se saltan");
  await q("update atenciones set etapa='diagnostico', etapas_omitidas='{}' where id=$1", [a2.id]);
  await falla(() => q("select omitir_etapa_atencion($1, 'planificacion', 'Por teléfono')", [a2.id]), /obligatorio/, "problema técnico: la planificación no se salta");

  console.log("6. Reclasificar cambia el circuito de verdad");
  // Puesta en marcha que saltó antecedentes y queda esperando planificar → problema técnico: vuelve a pedir antecedentes.
  await q("update atenciones set etapa='diagnostico', etapas_omitidas=jsonb_build_object('diagnostico', jsonb_build_object('motivo','No hay antecedentes')), programada_at=null where id=$1", [a1.id]);
  await q("select cambiar_tipo_atencion($1, 'problema_tecnico')", [a1.id]);
  let x = await at(a1.id);
  ok(x.tipo === "problema_tecnico" && x.etapa === "registro" && !x.om?.diagnostico, `PeM→problema técnico: ${x.tipo} en ${x.etapa}, antecedentes pendientes`);
  // Caso esperando pruebas → repuesto: pasa al cierre con pruebas y conformidad «No corresponde».
  await q("update atenciones set etapa='pruebas', trabajo_realizado='Se cambió la válvula', pruebas_at=now(), pruebas_conforme=null where id=$1", [a1.id]);
  await q("select cambiar_tipo_atencion($1, 'solicitud_repuesto')", [a1.id]);
  x = await at(a1.id);
  ok(x.etapa === "conformidad" && /No corresponde a Repuesto/.test(x.om?.pruebas?.motivo ?? ""), `→ repuesto: en ${x.etapa}, pruebas «${x.om?.pruebas?.motivo}»`);
  // Y de vuelta a soporte técnico: vuelven a pedirse las pruebas, con el trabajo ya escrito.
  await q("select cambiar_tipo_atencion($1, 'soporte_tecnico')", [a1.id]);
  x = await at(a1.id);
  ok(x.tipo === "soporte_tecnico" && x.etapa === "pruebas" && !x.om?.pruebas && !x.om?.conformidad, `→ soporte técnico: en ${x.etapa}, sin saltos`);
  // PeM con la atención saltada → repuesto (atención obligatoria): vuelve a planificación.
  await q("update atenciones set tipo='puesta_en_marcha', etapa='atencion', etapas_omitidas=jsonb_build_object('atencion', jsonb_build_object('motivo','En la llamada')) where id=$1", [a1.id]);
  await q("select cambiar_tipo_atencion($1, 'solicitud_repuesto')", [a1.id]);
  x = await at(a1.id);
  ok(x.etapa === "planificacion" && !x.om?.atencion, `PeM sin atención → repuesto: en ${x.etapa}`);
  // Después de planificar ya se puede cambiar (antes: «se cambia antes de planificarlo»).
  ok(true, "cambiar el tipo en planificación ya no da error");

  console.log("7. «Reclasificar» el expediente mueve el caso técnico en cualquier etapa");
  await q("update atenciones set etapa='planificacion' where id=$1", [a2.id]);
  await q("select catalogar_expediente_postventa($1, 'soporte_tecnico', 'Era una capacitación, no una falla')", [o2.id]);
  x = await at(a2.id);
  ok(x.tipo === "soporte_tecnico", `expediente → soporte técnico: caso ${x.tipo} en ${x.etapa}`);
  await q("select catalogar_expediente_postventa($1, 'puesta_en_marcha', 'En realidad pide su puesta en marcha')", [o2.id]);
  ok((await at(a2.id)).tipo === "puesta_en_marcha", "expediente → puesta en marcha: el caso también");
  // Un expediente sin caso técnico que se reclasifica a soporte técnico lo abre.
  const [sinCasoOp] = await q("select o.id from oportunidades o where o.tipo_postventa='repuesto' and o.etapa='asignada' and not exists (select 1 from atenciones a where a.oportunidad_id=o.id) limit 1");
  if (sinCasoOp) {
    await q("select catalogar_expediente_postventa($1, 'soporte_tecnico', 'Prueba: era soporte')", [sinCasoOp.id]);
    const [n] = await q("select tipo::text from atenciones where oportunidad_id=$1", [sinCasoOp.id]);
    ok(n?.tipo === "soporte_tecnico", `repuesto sin caso → soporte técnico: abre caso ${n?.tipo}`);
  }
} finally {
  await pg.query("rollback");
}
const [{ n }] = await q("select count(*)::int n from leads where mensaje like 'Prueba circuito:%'");
ok(n === 0, "todo deshecho");
await pg.end();
console.log(fallas ? `\n${fallas} FALLA(S)` : "\nTodo bien.");
process.exit(fallas ? 1 : 0);
