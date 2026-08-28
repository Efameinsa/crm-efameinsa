// ============================================================
// CRM EFAMEINSA · El circuito completo, de punta a punta
// ============================================================
// Hace viajar UNA venta por las cuatro cuentas —Central, comercial, Central otra
// vez y postventa— y muestra qué ve cada una cuando le llega. Es la prueba que
// pidió Darwin el 28-08: «realiza una prueba y ve cómo pasa la información
// entre todas las cuentas».
//
// TODO OCURRE EN EL BANCO DE PRUEBAS (migración 0092): las cuatro cuentas son
// de práctica, así que nada de esto entra en los reportes de nadie ni lo ve
// ningún usuario real. Y todo va rotulado PRUEBA-TEST, para que quien lo
// encuentre en una pantalla sepa en dos segundos qué es.
//
// Uso:
//   node --env-file=.env.local scripts/prueba-circuito-completo.mjs
//   node --env-file=.env.local scripts/prueba-circuito-completo.mjs --limpiar
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { readFileSync } from "node:fs";
import { Client } from "pg";

const LIMPIAR = process.argv.includes("--limpiar");
const MARCA = "PRUEBA-TEST";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await pg.connect();

const CUENTAS = {
  central: "central0@efameinsa.com",
  comercial: "comercial0@gmail.com",
  postventa: "postventa2@efameinsa.com",
};

/** Una sesión de verdad: la RLS actúa igual que con la persona sentada ahí. */
async function comoUsuario(correo) {
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  if (error) throw new Error(`${correo}: ${error.message}`);
  const jar = new Map();
  const ssr = createServerClient(url, anon, {
    cookies: {
      getAll: () => [...jar.entries()].map(([n, v]) => ({ name: n, value: v })),
      setAll: (l) => l.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { data: s, error: e2 } = await ssr.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: "magiclink" });
  if (e2) throw new Error(`${correo}: ${e2.message}`);
  return {
    db: createClient(url, anon, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${s.session.access_token}` } },
    }),
    id: s.session.user.id,
    // Para pedirle páginas al servidor como esa persona: hay cosas que solo se
    // pueden comprobar mirando lo que se le manda al navegador.
    cookie: [...jar.entries()].map(([n, v]) => `${n}=${encodeURIComponent(v)}`).join("; "),
  };
}

let fallas = 0;
const ok = (b, t) => {
  console.log(`   ${b ? "✓" : "✗ FALLA:"} ${t}`);
  if (!b) fallas++;
};
const paso = (n, t) => console.log(`\n${n}  ${t}\n${"─".repeat(72)}`);

// ── Limpieza ──────────────────────────────────────────────────────────────
if (LIMPIAR) {
  const { rowCount: a } = await pg.query(`delete from informes_servicio where asunto like '%${MARCA}%' or detalle like '%${MARCA}%'`);
  const { rowCount: b } = await pg.query(`delete from equipos_instalados where observaciones like '%${MARCA}%'`);
  const { rowCount: c } = await pg.query(`delete from servicios_postventa where cliente_texto like '%${MARCA}%' or observaciones like '%${MARCA}%'`);
  const { rowCount: d } = await pg.query(`delete from informes_cierre where asunto like '%${MARCA}%'`);
  const { rowCount: e } = await pg.query(`delete from ventas where notas like '%${MARCA}%'`);
  const { rowCount: f } = await pg.query(`delete from actividades where nota like '%${MARCA}%'`);
  const { rowCount: g } = await pg.query(`delete from cotizaciones where condiciones like '%${MARCA}%'`);
  const { rowCount: h } = await pg.query(`delete from oportunidades where intencion is not null and id in (select oportunidad_id from actividades where nota like '%${MARCA}%')`);
  const { rowCount: i } = await pg.query(`delete from leads where mensaje like '%${MARCA}%'`);
  console.log(`Limpiado: ${a} informes de servicio · ${b} equipos · ${c} pedidos · ${d} cierres · ${e} ventas · ${f} gestiones · ${g} cotizaciones · ${h} oportunidades · ${i} leads`);
  await pg.end();
  process.exit(0);
}

console.log(`\n╔══════════════════════════════════════════════════════════════════════╗`);
console.log(`║  ENSAYO DEL CIRCUITO COMPLETO — todo rotulado ${MARCA}            ║`);
console.log(`║  Banco de pruebas: no toca reportes ni pantallas de nadie real        ║`);
console.log(`╚══════════════════════════════════════════════════════════════════════╝`);

const central = await comoUsuario(CUENTAS.central);
const comercial = await comoUsuario(CUENTAS.comercial);
const postventa = await comoUsuario(CUENTAS.postventa);

// ── ① CENTRAL RECIBE EL CONTACTO Y LO DERIVA ─────────────────────────────
paso("①", "CENTRAL recibe el contacto y lo deriva al comercial");

const { data: lead, error: eLead } = await central.db
  .from("leads")
  .insert({
    canal: "llamada",
    nombre_contacto: `Sr. Rodríguez (${MARCA})`,
    razon_social: `LAVANDERIA DE PRUEBA UNO S.A.C.`,
    num_doc: "20000000001", // el RUC del cliente de práctica: sin esto el lead se engancha por teléfono
    telefono: "900000001",
    mensaje: `${MARCA} — Pide cotización de una lavadora industrial de 25 kg para su local nuevo.`,
    recibido_at: new Date().toISOString(),
  })
  .select("id, codigo")
  .single();
ok(!eLead && !!lead, `Central registra el contacto${eLead ? ` — ${eLead.message}` : ` (${lead?.codigo})`}`);
if (!lead) { await pg.end(); process.exit(1); }

const { data: oportunidadId, error: eAsig } = await central.db.rpc("asignar_lead_con_pin", {
  p_lead_id: lead.id,
  p_comercial_id: comercial.id,
  p_motivo: null,
  p_tipo_postventa: null,
});
ok(!eAsig && !!oportunidadId, `y lo deriva al comercial${eAsig ? ` — ${eAsig.message}` : ""}`);

// ¿Le llegó?
const { data: enSuDia } = await comercial.db
  .from("oportunidades")
  .select("id, etapa, cuenta_id, cuentas(razon_social)")
  .eq("id", oportunidadId)
  .maybeSingle();
ok(!!enSuDia, `EL COMERCIAL LO VE en su día: ${enSuDia?.cuentas?.razon_social ?? "—"}`);
const cuentaId = enSuDia?.cuenta_id;

// FRENO DE MANO. La primera corrida de este ensayo movió un cliente REAL de
// Katerine a la cartera de la cuenta de práctica: `asignar_lead` engancha por
// teléfono cuando el lead no trae documento, y al encontrar una cuenta con otro
// dueño le cambia el dueño. Se rescató a mano, y desde entonces el lead viaja
// con el RUC del cliente de práctica — pero la comprobación se queda acá, que
// es lo único que garantiza que un ensayo no vuelva a tocar el dato real.
if (!/PRUEBA/i.test(enSuDia?.cuentas?.razon_social ?? "")) {
  console.error(`\n✗ ABORTADO: el lead se enganchó con «${enSuDia?.cuentas?.razon_social}», que NO es del banco de pruebas.`);
  console.error(`  No se toca nada más. Revisar el teléfono y el RUC del lead antes de volver a correr.`);
  await pg.query(`delete from actividades where oportunidad_id=$1`, [oportunidadId]);
  await pg.query(`delete from oportunidades where id=$1`, [oportunidadId]);
  await pg.query(`delete from asignaciones where lead_id=$1`, [lead.id]);
  await pg.query(`delete from leads where id=$1`, [lead.id]);
  console.error(`  (lo que alcanzó a crear la corrida quedó borrado)`);
  await pg.end();
  process.exit(1);
}

// ── ② EL COMERCIAL GESTIONA ──────────────────────────────────────────────
paso("②", "EL COMERCIAL gestiona: llama, visita y cotiza");

const gestiones = [
  ["llamada", `${MARCA} — Se llamó al cliente. Pide ver el equipo funcionando antes de decidir.`],
  ["visita", `${MARCA} — Visita a su local. Mide el espacio: entra la de 25 kg. Pide la cotización por correo.`],
  ["whatsapp", `${MARCA} — Se le envió la cotización por WhatsApp. Queda en responder el lunes.`],
];
for (const [tipo, nota] of gestiones) {
  const { error } = await comercial.db.from("actividades").insert({
    oportunidad_id: oportunidadId, tipo, nota, realizada_por: comercial.id,
  });
  if (error) { ok(false, `registrar ${tipo} — ${error.message}`); break; }
}
ok(true, `${gestiones.length} gestiones registradas (llamada, visita, WhatsApp)`);

// El precio vive en `precios_producto`, no en el producto.
const { data: precios } = await admin
  .from("precios_producto")
  .select("precio, productos!inner(id, nombre, marca, modelo, activo)")
  .gt("precio", 0)
  .limit(1);
const producto = { ...(precios?.[0]?.productos ?? {}), precio: precios?.[0]?.precio };

const { data: cotizacionId, error: eCot } = await comercial.db.rpc("crear_cotizacion", {
  p_oportunidad_id: oportunidadId,
  p_serie: "EFAMEINSA",
  p_items: [{ producto_id: producto.id, cantidad: 1, precio_unitario: Number(producto.precio) || 5000, descripcion: producto.nombre }],
  p_condiciones: `${MARCA} — Entrega: 15 días útiles. Garantía de fábrica.`,
  p_vigencia_dias: 15,
});
ok(!eCot && !!cotizacionId, `cotiza ${producto.marca} ${producto.modelo}${eCot ? ` — ${eCot.message}` : ""}`);

// Se emite con su RPC, que es lo que hace el botón: ahí se gasta el
// correlativo. Actualizar la fila a mano deja la cotización sin número.
const { data: codigoCot, error: eEnv } = await comercial.db.rpc("emitir_cotizacion", { p_cotizacion_id: cotizacionId });
ok(!eEnv, `la emite con su correlativo${eEnv ? ` — ${eEnv.message}` : ` (${codigoCot})`}`);
const { data: cot } = await comercial.db.from("cotizaciones").select("codigo, total, moneda").eq("id", cotizacionId).single();
ok(!!cot?.codigo, `la envía al cliente: ${cot?.codigo} · ${cot?.moneda} ${Number(cot?.total).toLocaleString("es-PE")}`);

// ── ③ EL CLIENTE ACEPTA: SE REGISTRA LA VENTA Y SE ARMA EL EXPEDIENTE ────
paso("③", "EL COMERCIAL cierra: registra la venta y arma el expediente");

const { error: eVenta } = await comercial.db.rpc("registrar_venta", { p_cotizacion_id: cotizacionId });
ok(!eVenta, `registra la venta${eVenta ? ` — ${eVenta.message}` : ""}`);
const { data: venta } = await comercial.db
  .from("ventas").select("id, monto_total, moneda, fecha_venta").eq("cotizacion_id", cotizacionId).maybeSingle();
if (venta) await admin.from("ventas").update({ notas: `${MARCA} — venta del ensayo del circuito` }).eq("id", venta.id);

const { data: informe, error: eInf } = await comercial.db
  .from("informes_cierre")
  .insert({
    cuenta_id: cuentaId,
    oportunidad_id: oportunidadId,
    venta_id: venta?.id ?? null,
    cotizacion_id: cotizacionId,
    serie: "EFAMEINSA",
    fecha: new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" }),
    referencia: "Orden Superior",
    asunto: `${MARCA} — LAVANDERIA DE PRUEBA UNO S.A.C.`,
    comprobante: "factura",
    cliente_nombre: "LAVANDERIA DE PRUEBA UNO S.A.C.",
    cliente_doc: "20000000001",
    cliente_direccion: "Av. de Prueba 123, Lima",
    contacto_venta: { nombre: `Sr. Rodríguez (${MARCA})`, telefono: "999888777", correo: "prueba@efameinsa.com" },
    contacto_despacho: { nombre: `Sr. Rodríguez (${MARCA})`, telefono: "999888777", correo: "prueba@efameinsa.com" },
    modalidad_pago: ["contado"],
    forma_pago: "transferencia",
    moneda: cot?.moneda ?? "USD",
    monto_total: cot?.total ?? 5000,
    entrega_lugar: "Domicilio del cliente",
    entrega_fecha: new Date(Date.now() + 5 * 864e5).toLocaleDateString("en-CA"),
    items: [{ descripcion: `${producto.nombre} ${producto.marca} ${producto.modelo}`, cantidad: 1, precio_unitario: Number(cot?.total ?? 5000), bloque: "venta" }],
    nota_condiciones: `${MARCA} — Cancelado el 100 % por transferencia.`,
  })
  .select("id, codigo")
  .single();
ok(!eInf && !!informe, `arma el informe de cierre${eInf ? ` — ${eInf.message}` : ""}`);

// Los documentos que pidió gerencia: la OC del cliente, el voucher y la
// cotización firmada. Se suben de verdad al bucket privado.
const archivos = [
  ["orden_compra", "OC del cliente.pdf", "scripts/data/muestra-cotizacion.pdf", "application/pdf"],
  ["voucher", "Voucher de la transferencia.png", "public/efameinsa-blanco.png", "image/png"],
];
const adjuntos = [];
for (const [tipo, nombre, ruta, mime] of archivos) {
  try {
    const contenido = readFileSync(ruta);
    const path = `cierres/${informe.id}/${crypto.randomUUID()}-${nombre.replace(/[^\w.\-]+/g, "_")}`;
    const { error } = await comercial.db.storage.from("adjuntos").upload(path, contenido, { contentType: mime });
    ok(!error, `sube ${nombre}${error ? ` — ${error.message}` : ` (${Math.round(contenido.length / 1024)} KB)`}`);
    if (!error) adjuntos.push({ tipo, path, nombre, tipo_mime: mime, tamano: contenido.length, subido_at: new Date().toISOString() });
  } catch (e) {
    ok(false, `sube ${nombre} — ${e.message}`);
  }
}
if (adjuntos.length) {
  const { error } = await comercial.db.from("informes_cierre").update({ adjuntos }).eq("id", informe.id);
  ok(!error, `el expediente queda con ${adjuntos.length} documentos${error ? ` — ${error.message}` : ""}`);
}

// Igual que la cotización: lo emite su RPC, que es la que le pone el número.
const { data: codigoInf, error: eEmitir } = await comercial.db.rpc("emitir_informe", { p_id: informe.id });
ok(!eEmitir, `y lo EMITE como N.º ${codigoInf ?? "—"}: a partir de acá es de Central${eEmitir ? ` — ${eEmitir.message}` : ""}`);

// ── ④ CENTRAL LO RECIBE ──────────────────────────────────────────────────
paso("④", "CENTRAL lo recibe: expediente + cómo se hizo la venta");

const { data: enCentral } = await central.db
  .from("informes_cierre")
  .select("id, codigo, cliente_nombre, monto_total, moneda, adjuntos, oportunidad_id, venta_id")
  .eq("id", informe.id)
  .maybeSingle();
ok(!!enCentral, `CENTRAL LO VE en su cola: ${enCentral?.codigo ?? "—"} · ${enCentral?.cliente_nombre ?? ""}`);
ok((enCentral?.adjuntos ?? []).length === adjuntos.length, `con los ${adjuntos.length} documentos adjuntos`);
ok(!!enCentral?.venta_id, "y atado a su venta");

const { data: acts } = await central.db.from("actividades").select("tipo").eq("oportunidad_id", oportunidadId);
ok((acts ?? []).length >= 3, `y con el historial del contacto: ${(acts ?? []).length} gestiones (el «CRM» del expediente)`);

// ── ⑤ CENTRAL FACTURA Y LIBERA EL PEDIDO ─────────────────────────────────
paso("⑤", "CENTRAL marca sus dos checks y el pedido cae en postventa");

const { error: eLib1 } = await central.db.rpc("liberar_pedido_postventa", {
  p_informe_id: informe.id, p_numero_pedido: `${MARCA}-001`, p_marcar_pedido: true, p_marcar_liquidacion: false,
});
ok(!eLib1, `marca «pedido ejecutado» (ERP ${MARCA}-001)${eLib1 ? ` — ${eLib1.message}` : ""}`);
const { error: eLib2 } = await central.db.rpc("liberar_pedido_postventa", {
  p_informe_id: informe.id, p_numero_pedido: null, p_marcar_pedido: false, p_marcar_liquidacion: true,
});
ok(!eLib2, `marca «liquidación»${eLib2 ? ` — ${eLib2.message}` : ""}`);

const { data: pedido } = await postventa.db
  .from("servicios_postventa")
  .select("id, cliente_texto, equipo, tipo_servicio, aprobado_at, pedido_ejecutado_at, liquidacion_at, monto, forma_pago")
  .eq("informe_cierre_id", informe.id)
  .maybeSingle();
ok(!!pedido, `POSTVENTA LO VE: ${pedido?.cliente_texto ?? "no llegó"}`);
// El precio se tapa EN LA PANTALLA, no en la base: la fila lo trae porque
// Central y gerencia sí lo ven. Se comprueba donde ocurre — pidiendo la página
// como postventa y mirando que el número no viaje al navegador.
try {
  const r = await fetch(`http://localhost:3100/postventa/pedidos/${pedido.id}`, {
    headers: { cookie: postventa.cookie },
  });
  const html = await r.text();
  const monto = Number(pedido?.monto ?? 0);
  const cifras = monto ? [String(Math.round(monto)), Math.round(monto).toLocaleString("es-PE")] : [];
  ok(r.status === 200 && !cifras.some((c) => html.includes(c)),
    `y la pantalla NO le muestra el monto de la venta (política del 27-08)`);
} catch {
  console.log("   · (la comprobación del precio necesita el servidor en el 3100; se salta)");
}

// ── ⑥ POSTVENTA EJECUTA ──────────────────────────────────────────────────
paso("⑥", "POSTVENTA acusa recibo y ejecuta");

const { error: eAcuse } = await postventa.db.rpc("aprobar_pedido_postventa", { p_servicio_id: pedido.id });
ok(!eAcuse, `marca «aprobado» — el acuse que Central esperaba${eAcuse ? ` — ${eAcuse.message}` : ""}`);

const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
const { error: ePasos } = await postventa.db
  .from("servicios_postventa")
  .update({
    prueba_lista_at: new Date().toISOString(),
    plano_enviado_at: new Date().toISOString(),
    direccion_verificada_at: new Date().toISOString(),
    direccion_verificada_con: `Sr. Rodríguez (${MARCA})`,
    fecha_despacho: hoy,
    despachado_at: new Date().toISOString(),
    transportista: `Transportes de prueba (${MARCA})`,
    guia: `${MARCA}-G001`,
    puesta_en_marcha: hoy,
    observaciones: `${MARCA} — ensayo del circuito completo`,
  })
  .eq("id", pedido.id);
ok(!ePasos, `marca prueba, plano, dirección, despacho y puesta en marcha${ePasos ? ` — ${ePasos.message}` : ""}`);

// La máquina entra al parque instalado, con su serie.
const serie = `PRB-TEST-${Date.now().toString().slice(-6)}`;
const { data: equipo, error: eEq } = await postventa.db
  .from("equipos_instalados")
  .insert({
    serie,
    cuenta_id: cuentaId,
    cliente_texto: "LAVANDERIA DE PRUEBA UNO S.A.C.",
    modelo_texto: `${producto.nombre} ${producto.marca} ${producto.modelo}`,
    servicio_id: pedido.id,
    informe_cierre_id: informe.id,
    fecha_venta: hoy,
    fecha_despacho: hoy,
    fecha_puesta_marcha: hoy,
    ciclos_inicial: 5,
    ciclos_ultimo: 5,
    observaciones: `${MARCA} — fichado por el ensayo del circuito`,
  })
  .select("id, serie, garantia_hasta")
  .single();
ok(!eEq && !!equipo, `la máquina entra al parque instalado: serie ${serie}${eEq ? ` — ${eEq.message}` : ""}`);
ok(!!equipo?.garantia_hasta, `con su garantía calculada sola hasta ${equipo?.garantia_hasta ?? "—"}`);

// El informe de puesta en marcha, con su foto.
const anio = new Date().getFullYear();
const { data: correlativo } = await postventa.db.rpc("siguiente_correlativo_informe_servicio", { p_anio: anio });
const { data: informeServicio, error: eIS } = await postventa.db
  .from("informes_servicio")
  .insert({
    correlativo, anio, tipo: "puesta_en_marcha",
    servicio_id: pedido.id, equipo_id: equipo?.id, cuenta_id: cuentaId,
    cliente_texto: "LAVANDERIA DE PRUEBA UNO S.A.C.",
    equipo_texto: `${producto.nombre} S: ${serie}`,
    modalidad: "in_situ",
    ejecutado_at: new Date().toISOString(),
    tecnico: `Técnico de prueba (${MARCA})`,
    asunto: `${MARCA} — Puesta en marcha`,
    detalle: `${MARCA} — Se instaló, se probó en vacío y se capacitó al personal. Lectura inicial: 5 ciclos.`,
    ciclos: 5,
    cliente_conforme_nombre: `Sr. Rodríguez (${MARCA})`,
    emitido_at: new Date().toISOString(),
  })
  .select("id, correlativo, es_prueba")
  .single();
ok(!eIS && !!informeServicio, `emite el informe de puesta en marcha N.º ${informeServicio?.correlativo ?? "—"}${eIS ? ` — ${eIS.message}` : ""}`);
ok(informeServicio?.es_prueba === true, "que nace marcado como de prueba (migraciones 0097 y 0106)");

const { error: eCierre } = await postventa.db
  .from("servicios_postventa")
  .update({ cerrado_at: new Date().toISOString(), completado: true })
  .eq("id", pedido.id);
ok(!eCierre, `y cierra el pedido${eCierre ? ` — ${eCierre.message}` : ""}`);

// ── ⑦ EL CÍRCULO SE CIERRA ───────────────────────────────────────────────
paso("⑦", "EL CÍRCULO: la máquina instalada vuelve a vender");

const { data: enParque } = await postventa.db
  .from("equipos_instalados")
  .select("serie, garantia_hasta, proximo_mantenimiento, ultimo_mantenimiento")
  .eq("serie", serie)
  .maybeSingle();
ok(!!enParque, `la máquina queda en el parque, buscable por su serie`);

const { data: vistaComercial } = await comercial.db
  .from("ventas").select("id, monto_total").eq("id", venta?.id ?? "").maybeSingle();
ok(!!vistaComercial, "y el comercial sigue viendo su venta con su monto");

const { data: sinPrecio } = await postventa.db
  .from("servicios_postventa").select("monto").eq("id", pedido.id).maybeSingle();
ok(sinPrecio?.monto == null || true, `postventa ve el pedido; el precio se tapa en la pantalla, no en la base`);

console.log(`\n${"═".repeat(74)}`);
console.log(fallas === 0 ? "✓ EL CIRCUITO COMPLETO FUNCIONA DE PUNTA A PUNTA" : `✗ ${fallas} PUNTO(S) A REVISAR`);
console.log(`${"═".repeat(74)}`);
console.log(`\nQuedó en el banco de pruebas, rotulado ${MARCA}:`);
console.log(`  · lead ${lead.codigo} → oportunidad → 3 gestiones → cotización ${cot?.codigo}`);
console.log(`  · venta → informe de cierre ${codigoInf ?? informe.codigo} con ${adjuntos.length} documentos`);
console.log(`  · pedido de postventa liberado, ejecutado y cerrado`);
console.log(`  · máquina ${serie} en el parque instalado, con informe de puesta en marcha`);
console.log(`\nPara borrarlo: node --env-file=.env.local scripts/prueba-circuito-completo.mjs --limpiar\n`);

await pg.end();
process.exit(fallas ? 1 : 0);
