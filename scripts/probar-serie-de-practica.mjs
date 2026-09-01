// ============================================================
// CRM EFAMEINSA · ¿Las cuentas de práctica numeran en su propia serie?
// ============================================================
// Verifica la migración 0145 contra la base real, con sesiones reales de las
// cuentas de práctica (C0 comercial, PV0 postventa), de punta a punta:
//
//   1. C0 cotiza y ENVÍA → el código sale PRUEBA_n-26, el correlativo vive
//      en 900001+, y el contador real de la serie no se mueve.
//   2. C0 emite un informe de cierre → sale PRUEBA-9nn-2026 y el contador
//      real de informes no se mueve.
//   3. PV0 pide número de informe de servicio → sale en el rango 900 y el
//      contador real queda igual.
//
// Deja la base como la encontró: el cliente, la oportunidad, la cotización y
// el informe de práctica que crea se borran al final, pase lo que pase.
//
// Uso: node --env-file=.env.local scripts/probar-serie-de-practica.mjs
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const C0 = "comercial0@gmail.com";
const PV0 = "postventa2@efameinsa.com";
const MARCA = "(PRÁCTICA) VERIFICACIÓN 0145";

let fallas = 0;
const check = (b, t) => {
  console.log(`${b ? "  ✓" : "  ✗ FALLA:"} ${t}`);
  if (!b) fallas++;
};

async function sesion(correo) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) throw error;
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error: e2 } = await c.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw e2;
  return c;
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();
const uno = async (sql, p = []) => (await bd.query(sql, p)).rows[0];
const contadores = async () =>
  Object.fromEntries((await bd.query(`select clave, ultimo from correlativos`)).rows.map((r) => [r.clave, r.ultimo]));

const { id: c0 } = await uno("select p.id from perfiles p join auth.users u on u.id = p.id where u.email = $1", [C0]);
const creado = { cuenta: null, oportunidad: null, cotizacion: null, informe: null };

async function limpiar() {
  // La cotización enviada es inmutable por trigger (0012): para borrar la de
  // práctica se apaga dentro de esta transacción, como hace la limpieza.
  await bd.query("begin");
  await bd.query("set local session_replication_role = replica");
  if (creado.informe) {
    await bd.query(
      `delete from informes_servicio where es_prueba and (servicio_id in (select id from servicios_postventa where informe_cierre_id = $1)
                                                       or equipo_id in (select id from equipos_instalados where informe_cierre_id = $1))`,
      [creado.informe],
    );
    await bd.query("delete from equipos_instalados where informe_cierre_id = $1 and es_prueba", [creado.informe]);
    await bd.query("delete from servicios_postventa where informe_cierre_id = $1 and es_prueba", [creado.informe]);
    await bd.query("delete from ventas where oportunidad_id = $1", [creado.oportunidad]);
    await bd.query("delete from informes_cierre where id = $1", [creado.informe]);
  }
  if (creado.cotizacion) {
    await bd.query("delete from cotizacion_items where cotizacion_id = $1", [creado.cotizacion]);
    await bd.query("delete from cotizaciones where id = $1", [creado.cotizacion]);
  }
  if (creado.oportunidad) {
    await bd.query("delete from actividades where oportunidad_id = $1", [creado.oportunidad]);
    await bd.query("delete from oportunidades where id = $1", [creado.oportunidad]);
  }
  if (creado.cuenta) await bd.query("delete from cuentas where id = $1", [creado.cuenta]);
  await bd.query("commit");
  console.log("\n(se borró todo lo que creó la prueba)");
}

try {
  const antes = await contadores();
  const comercial = await sesion(C0);

  // ── Un cliente y una oportunidad de práctica para C0 ─────────────────────
  const cuenta = await uno(
    `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id) values ($1, 'RUC', $2, $3) returning id`,
    [MARCA, "20" + String(Date.now()).slice(-9), c0],
  );
  creado.cuenta = cuenta.id;
  const op = await uno(
    `insert into oportunidades (cuenta_id, comercial_id, etapa, origen) values ($1, $2, 'seguimiento', 'crm') returning id`,
    [creado.cuenta, c0],
  );
  creado.oportunidad = op.id;

  // ── 1. Cotizar a precio de lista y enviar ────────────────────────────────
  console.log("1. COTIZACIÓN DE PRÁCTICA (C0)");
  const { rows: candidatos } = await bd.query(
    `select pp.producto_id, pp.precio from precios_producto pp join productos p on p.id = pp.producto_id
      where pp.precio > 0 and p.activo order by pp.precio limit 8`,
  );
  let cot = null;
  for (const cand of candidatos) {
    const { data, error } = await comercial.rpc("crear_cotizacion", {
      p_oportunidad_id: creado.oportunidad,
      p_serie: "EFAMEINSA",
      p_items: [{ producto_id: cand.producto_id, cantidad: 1, precio_unitario: Number(cand.precio), descripcion: "PRUEBA 0145" }],
      p_condiciones: "PRUEBA interna, se borra sola.",
      p_vigencia_dias: 15,
    });
    if (error) throw new Error(`crear_cotizacion: ${error.message}`);
    const est = await uno("select estado_aprobacion from cotizaciones where id = $1", [data]);
    if (est.estado_aprobacion === "auto_aprobada") { cot = data; break; }
    await bd.query("delete from cotizacion_items where cotizacion_id = $1", [data]);
    await bd.query("delete from cotizaciones where id = $1", [data]);
  }
  if (!cot) throw new Error("No se encontró un equipo que se apruebe solo a precio de lista");
  creado.cotizacion = cot;

  const envio = await comercial.rpc("emitir_cotizacion", { p_cotizacion_id: cot });
  check(!envio.error, `se envía${envio.error ? ` — ${envio.error.message}` : ""}`);
  const fila = await uno("select codigo, correlativo, estado from cotizaciones where id = $1", [cot]);
  check(/^PRUEBA_\d+-\d\d$/.test(fila.codigo ?? ""), `el código dice que es prueba: ${fila.codigo}`);
  check(fila.correlativo >= 900001, `el correlativo vive lejos de la serie real: ${fila.correlativo}`);
  check(fila.estado === "enviada", `queda enviada (${fila.estado})`);
  const d1 = await contadores();
  check(d1["EFAMEINSA-2026"] === antes["EFAMEINSA-2026"], `el contador real EFAMEINSA no se movió (${antes["EFAMEINSA-2026"]} → ${d1["EFAMEINSA-2026"]})`);
  check((d1["PRUEBA-EFAMEINSA-2026"] ?? 0) === (antes["PRUEBA-EFAMEINSA-2026"] ?? 0) + 1, `el contador de práctica avanzó uno (${d1["PRUEBA-EFAMEINSA-2026"]})`);

  // ── 2. Informe de cierre de práctica ─────────────────────────────────────
  console.log("\n2. INFORME DE CIERRE DE PRÁCTICA (C0)");
  const inf = await uno(
    `insert into informes_cierre (serie, cuenta_id, oportunidad_id, cotizacion_id, asunto, cliente_nombre, monto_total, items, es_prueba, creado_por)
     values ('EFAMEINSA', $1, $2, $3, 'PRUEBA 0145', $4, 100, '[{"descripcion":"PRUEBA 0145","cantidad":1,"precio":100}]'::jsonb, true, $5)
     returning id, codigo`,
    [creado.cuenta, creado.oportunidad, cot, MARCA, c0],
  );
  creado.informe = inf.id;
  const emision = await comercial.rpc("emitir_informe", { p_id: inf.id });
  check(!emision.error, `se emite${emision.error ? ` — ${emision.error.message}` : ""}`);
  const infFila = await uno("select codigo, correlativo from informes_cierre where id = $1", [inf.id]);
  check(/^PRUEBA-9\d\d-2026$/.test(infFila.codigo ?? ""), `el código dice que es prueba: ${infFila.codigo} (devuelto: ${emision.data})`);
  check(emision.data === infFila.codigo, "lo que devuelve la función es lo que queda guardado");
  const d2 = await contadores();
  check(d2["INFORME-EFAMEINSA-2026"] === antes["INFORME-EFAMEINSA-2026"], `el contador real de informes no se movió (${antes["INFORME-EFAMEINSA-2026"]} → ${d2["INFORME-EFAMEINSA-2026"]})`);

  // ── 3. Informe de servicio de práctica ───────────────────────────────────
  console.log("\n3. NÚMERO DE INFORME DE SERVICIO (PV0)");
  const postventa = await sesion(PV0);
  const num = await postventa.rpc("siguiente_correlativo_informe_servicio", { p_anio: 2026 });
  check(!num.error, `se obtiene número${num.error ? ` — ${num.error.message}` : ""}`);
  check(num.data >= 901 && num.data < 1000, `sale en el rango de práctica: ${num.data}`);
  const d3 = await contadores();
  check(d3["INFORME-SERVICIO-2026"] === antes["INFORME-SERVICIO-2026"], `el contador real de servicio no se movió (${antes["INFORME-SERVICIO-2026"]} → ${d3["INFORME-SERVICIO-2026"]})`);

  // ── Y una comercial real sigue igual ─────────────────────────────────────
  console.log("\n4. LA SERIE REAL");
  const real = await uno("select codigo from cotizaciones where serie='EFAMEINSA' and correlativo = (select max(correlativo) from cotizaciones where serie='EFAMEINSA' and correlativo < 900000)");
  check(real.codigo === "Presu_2210-26", `la última real sigue siendo la de Katherine: ${real.codigo}`);
} catch (e) {
  console.error("\n✗ La prueba se cayó:", e.message);
  fallas++;
} finally {
  await limpiar();
  await bd.end();
}
console.log(fallas ? `\n${fallas} falla(s).` : "\nTodo en orden.");
process.exit(fallas ? 1 : 0);
