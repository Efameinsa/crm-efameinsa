// ============================================================
// CRM EFAMEINSA · Banco de pruebas de postventa
// ============================================================
// Darwin, 27-08: «estos datos de esta cuenta no deben ser iguales a la otra
// cuenta, deben tener puros casos de prueba no reales, que tenga unos 10 en
// cada caso… en todos ellos deben haber sintéticos para ver la funcionalidad
// completa».
//
// Siembra un mundo entero y coherente para `postventa2@efameinsa.com`: diez
// clientes, sus casos, sus despachos, sus máquinas y sus informes, todos
// enlazados entre sí. La migración 0088 es la que garantiza que ese mundo y el
// real no se toquen — acá solo se llena.
//
// POR QUÉ LOS DATOS ESTÁN ESCALONADOS Y NO SON DIEZ FILAS IGUALES. La gracia de
// un banco de pruebas es poder ver CADA estado sin esperar a que ocurra: hay un
// pedido detenido por saldo y otro por dirección sin verificar, uno atrasado y
// uno sin fecha, una garantía por vencer y otra vencida, un equipo con 10.000
// ciclos para probar el argumento del uso, y un caso de garantía pasado de SLA
// para ver el semáforo en rojo. Diez filas idénticas no mostrarían nada.
//
// Las razones sociales llevan PRUEBA en el nombre y los RUC son 200000001xx:
// tienen la forma correcta pero no son de nadie. Nadie los va a confundir.
//
// Uso:
//   node --env-file=.env.local scripts/sembrar-sandbox-postventa.mjs
//   node --env-file=.env.local scripts/sembrar-sandbox-postventa.mjs --limpiar

import { Client } from "pg";

const CORREO = "postventa2@efameinsa.com";
const LIMPIAR = process.argv.includes("--limpiar");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}
const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// ── Fechas relativas a hoy, para que el banco no envejezca ──────────────────
const HOY = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Lima" }));
const dia = (n) => {
  const d = new Date(HOY.getTime() + n * 864e5);
  return d.toISOString().slice(0, 10);
};
const hora = (h) => new Date(HOY.getTime() - h * 36e5).toISOString();

const { rows: [perfil] } = await bd.query(
  `select p.id from perfiles p join auth.users u on u.id = p.id where lower(u.email) = $1`, [CORREO]);
if (!perfil) {
  console.error(`No existe el perfil de ${CORREO}. Corré antes scripts/crear-cuenta-prueba-postventa.mjs`);
  await bd.end();
  process.exit(1);
}
const PV = perfil.id;

// ── Limpieza ────────────────────────────────────────────────────────────────
// Se borra por la marca, no por el dueño: es lo único que define el banco de
// pruebas y no depende de que las filas hayan quedado bien asignadas.
async function limpiar() {
  const t = [];
  for (const [tabla, donde] of [
    ["informes_servicio", "es_prueba"],
    ["soporte_tecnico", "es_prueba"],
    ["equipos_instalados", "es_prueba"],
    ["servicios_postventa", "es_prueba"],
    ["informes_cierre", "es_prueba"],
    ["actividades", `oportunidad_id in (select id from oportunidades where comercial_id = '${PV}')`],
    ["oportunidades", `comercial_id = '${PV}'`],
    ["contactos", `cuenta_id in (select id from cuentas where comercial_id = '${PV}')`],
    ["cuentas", `comercial_id = '${PV}'`],
  ]) {
    const { rowCount } = await bd.query(`delete from ${tabla} where ${donde}`);
    if (rowCount) t.push(`${tabla}: ${rowCount}`);
  }
  console.log(t.length ? "Borrado → " + t.join(" · ") : "No había nada que borrar.");
}

if (LIMPIAR) {
  await limpiar();
  await bd.end();
  process.exit(0);
}

// Sembrar dos veces duplicaría todo: se limpia primero y se vuelve a armar.
await limpiar();

// ── 1. Los diez clientes ────────────────────────────────────────────────────
const CLIENTES = [
  ["LAVANDERIA PRUEBA ANDINA S.A.C.",      "20000000101", "Lima",   "Lima",       "San Miguel",  "MARIA QUISPE",   "987 000 101"],
  ["HOTEL PRUEBA MIRAFLORES E.I.R.L.",     "20000000102", "Lima",   "Lima",       "Miraflores",  "JORGE ROJAS",    "987 000 102"],
  ["TEXTIL PRUEBA DEL SUR S.A.",           "20000000103", "Arequipa", "Arequipa", "Cerro Colorado", "ANA MAMANI",  "987 000 103"],
  ["CLINICA PRUEBA SAN MARTIN S.A.C.",     "20000000104", "Lima",   "Lima",       "San Isidro",  "LUIS FERNANDEZ", "987 000 104"],
  ["MINERA PRUEBA PAMPA VERDE S.A.C.",     "20000000105", "Junín",  "Huancayo",   "El Tambo",    "CARLOS HUAMAN",  "987 000 105"],
  ["LAVANDERIA PRUEBA EL SOL E.I.R.L.",    "20000000106", "Cusco",  "Cusco",      "Wanchaq",     "ROSA CCAHUANA",  "987 000 106"],
  ["HOSPEDAJE PRUEBA COSTA AZUL S.A.C.",   "20000000107", "Piura",  "Piura",      "Castilla",    "PEDRO ZAPATA",   "987 000 107"],
  ["AGROEXPORT PRUEBA VALLE S.A.C.",       "20000000108", "Ica",    "Ica",        "Salas",       "ELENA TORRES",   "987 000 108"],
  ["RESTAURANTE PRUEBA LA PARADA S.A.C.",  "20000000109", "Lima",   "Lima",       "Surco",       "MIGUEL SALAS",   "987 000 109"],
  ["COLEGIO PRUEBA LOS ALAMOS S.A.C.",     "20000000110", "Lima",   "Lima",       "La Molina",   "SILVIA PAREDES", "987 000 110"],
];

const cuentas = [];
for (const [razon, ruc, dep, prov, dist, contacto, tel] of CLIENTES) {
  const { rows: [c] } = await bd.query(
    `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id, cartera_desde, departamento, provincia, distrito, direccion, notas)
     values ($1,'RUC',$2,$3,current_date,$4,$5,$6,$7,'Cliente sintético del banco de pruebas de postventa.')
     returning id, razon_social`,
    [razon, ruc, PV, dep, prov, dist, `Av. de Prueba ${ruc.slice(-3)}, ${dist}`]);
  await bd.query(
    `insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal, documento)
     values ($1,$2,'Jefe de operaciones',$3,$4,true,$5)`,
    [c.id, contacto, tel, `prueba${ruc.slice(-3)}@example.com`, `4${ruc.slice(-7)}`]);
  cuentas.push({ ...c, dep, dist, contacto, tel, provincia: dep !== "Lima" });
}
console.log(`✓ ${cuentas.length} clientes con su contacto`);

// ── 2. Los diez casos que "derivó Central" ──────────────────────────────────
// Escalonados en el tiempo para que el semáforo de SLA muestre los tres
// colores: garantía se pone en rojo a las 2 h, repuesto y mantenimiento a las 24.
const { rows: [motivo] } = await bd.query(
  `select id from catalogo_motivos_rechazo order by nombre limit 1`);

const CASOS = [
  ["garantia",     "asignada",    0.5,  "La lavadora se detiene en el centrifugado y marca error E-13."],
  ["garantia",     "asignada",    5,    "Equipo no enciende desde ayer. Cliente con producción parada."],
  ["garantia",     "seguimiento", 30,   "Cambio de rodamiento en garantía: esperando el repuesto de importación."],
  ["repuesto",     "asignada",    3,    "Manda foto por WhatsApp: necesita el resorte de suspensión."],
  ["repuesto",     "cotizada",    50,   "Cotizado el kit de mangueras y el manómetro. Esperando aprobación."],
  ["repuesto",     "seguimiento", 96,   "Aprobó la compra; el repuesto llega la próxima semana."],
  ["mantenimiento","filtrada",    20,   "Pide mantenimiento preventivo para dos secadoras."],
  ["mantenimiento","potencial",   72,   "Preventivo programado para la próxima visita a provincia."],
  ["mantenimiento","venta",       200,  "Preventivo ejecutado y facturado."],
  ["garantia",     "rechazada",   240,  "No procede: el daño fue por mal uso, fuera de garantía."],
];

let nCasos = 0;
for (let i = 0; i < CASOS.length; i++) {
  const [tipo, etapa, horas, intencionTexto] = CASOS[i];
  const cuenta = cuentas[i];
  const { rows: [op] } = await bd.query(
    `insert into oportunidades (cuenta_id, comercial_id, etapa, intencion, moneda, tipo_postventa,
                                created_at, proxima_accion, proxima_accion_at, origen, motivo_rechazo_id)
     values ($1,$2,$3::etapa_oportunidad,'medio','USD',$4::tipo_postventa,$5,$6,$7,'crm',$8)
     returning id`,
    [cuenta.id, PV, etapa, tipo, hora(horas),
     etapa === "asignada" ? "Llamar al cliente y pedir la serie" : etapa === "seguimiento" ? "Confirmar llegada del repuesto" : null,
     ["asignada", "seguimiento"].includes(etapa) ? dia(i % 3) : null,
     etapa === "rechazada" ? motivo?.id ?? null : null]);
  // El "problema" del formato de llamada del manual va como nota de la gestión.
  await bd.query(
    `insert into actividades (oportunidad_id, realizada_por, tipo, nota, realizada_at)
     values ($1,$2,'llamada',$3,$4)`,
    [op.id, PV, intencionTexto, hora(horas)]);
  nCasos++;
}
console.log(`✓ ${nCasos} casos derivados (garantía, repuesto y mantenimiento) con su gestión`);

// ── 3. Tres cierres de venta, para los pedidos que esperan acuse ────────────
// Correlativos 901-903: la forma es la real y no chocan con la serie de verdad,
// que va por el 004. Como son `es_prueba`, Central nunca los ve.
const ADJUNTOS = JSON.stringify([
  { tipo: "cotizacion", path: "prueba/cotizacion.pdf", nombre: "Presu_901-26.pdf" },
  { tipo: "orden_compra", path: "prueba/oc.pdf", nombre: "OC-4471.pdf" },
  { tipo: "voucher", path: "prueba/voucher.jpg", nombre: "voucher-adelanto.jpg" },
  { tipo: "acuerdo", path: "prueba/acuerdo.pdf", nombre: "acuerdo-firmado.pdf" },
]);

const cierres = [];
for (let i = 0; i < 3; i++) {
  const cuenta = cuentas[i];
  const { rows: [inf] } = await bd.query(
    `insert into informes_cierre
       (serie, correlativo, anio, cuenta_id, fecha, asunto, comprobante, cliente_nuevo, cliente_nombre,
        cliente_doc, cliente_direccion, cliente_correo, orden_compra, contacto_venta, contacto_despacho,
        modalidad_pago, forma_pago, moneda, monto_total, entrega_fecha, entrega_lugar, entrega_direccion,
        incluye, items, adjuntos, creado_por, emitido_at, es_prueba)
     values ('EFAMEINSA', $1, extract(year from current_date)::int, $2, current_date, $3, 'factura', true, $3,
             $4, $5, $6, $7, $8::jsonb, $8::jsonb,
             $9, 'transferencia', 'USD', $10, $11, $12, $5,
             array['24 meses de garantía','Planos de preinstalación','Capacitación'], $13::jsonb, $15::jsonb, $14, now(), true)
     returning id, codigo`,
    [901 + i, cuenta.id, cuenta.razon_social, CLIENTES[i][1],
     `Av. de Prueba ${CLIENTES[i][1].slice(-3)}, ${cuenta.dist}`, `prueba${CLIENTES[i][1].slice(-3)}@example.com`,
     `OC-44${70 + i}`,
     JSON.stringify({ area: "Operaciones", nombre: cuenta.contacto, telefono: cuenta.tel, correo: `prueba${CLIENTES[i][1].slice(-3)}@example.com` }),
     ["50% ADELANTO", "50% CRÉDITO"], [12500, 9800, 21400][i],
     "INMEDIATA AL PAGO DEL 50%",
     cuenta.provincia ? "AGENCIA SHALOM - " + cuenta.dep : "Entrega e instalación en el local del cliente",
     JSON.stringify([{ bloque: "venta", descripcion: ["LAVADORA CENTRIFUGA INDUSTRIAL RIGIDA\nMARCA: PRIMUS\nMODELO: RX180\nCAPACIDAD: 18 KG\n220V/60Hz/3Ph", "SECADORA SEMI INDUSTRIAL A GAS OPL\nMARCA: LG\nMODELO: GIANT C MAX\nCAPACIDAD: 10.2 KG", "LAVADORA CENTRIFUGA SEMI INDUSTRIAL OPL\nMARCA: LG\nMODELO: TITAN MAX\nCAPACIDAD: 13 KG"][i], cantidad: 1, precio_unitario: [12500, 9800, 21400][i] }]),
     PV, ADJUNTOS]);
  cierres.push(inf);
}
console.log(`✓ ${cierres.length} cierres de venta con sus documentos adjuntos`);

// ── 4. Doce pedidos, uno por cada estado que se quiere poder ver ────────────
const EQUIPO = [
  "LAVADORA CENTRIFUGA INDUSTRIAL RIGIDA PRIMUS RX180, CAP: 18 KG, 220V/60Hz/3Ph S: PRB-2400118",
  "SECADORA SEMI INDUSTRIAL A GAS LG GIANT C MAX, CAP: 10.2 KG S: PRB-2400219",
  "LAVADORA CENTRIFUGA SEMI INDUSTRIAL LG TITAN MAX, CAP: 13 KG S: PRB-2400320",
  "SECADORA INDUSTRIAL A VAPOR UNIMAC UT055, CAP: 25 KG S: PRB-2400421",
  "CALDERA GENERADORA DE VAPOR EFAMEINSA, 15 BHP S: PRB-2400522",
  "LAVADORA CENTRIFUGA INDUSTRIAL PRIMUS RX350, CAP: 35 KG S: PRB-2400623",
  "MESA DE PLANCHADO ASPIRANTE Y SOPLANTE SIDI MONDIAL NOVA S: PRB-2400724",
  "SECADORA SEMI INDUSTRIAL ELECTRICA LG, CAP: 10.2 KG S: PRB-2400825",
  "LAVADORA CENTRIFUGA SEMI INDUSTRIAL LG GIANT PRO, CAP: 13 KG S: PRB-2400926",
  "COCHE TRANSPORTADOR DE ROPA CO401 + SECADORA UT075 S: PRB-2401027",
  "LAVADORA CENTRIFUGA INDUSTRIAL UNIMAC UCT060, CAP: 27 KG S: PRB-2401128",
  "SECADORA INDUSTRIAL A GAS PRIMUS DX55, CAP: 25 KG S: PRB-2401229",
];

// [n° de cliente, monto, pagado, modalidad, fecha despacho, estado del avance]
const PEDIDOS = [
  // Tres esperando el acuse de postventa: Central ya marcó sus dos checks.
  { c: 0, monto: 12500, pagado: 6250, mod: "provincia", despacho: null, estado: "nuevo", cierre: 0 },
  { c: 1, monto: 9800,  pagado: 9800, mod: "lima",      despacho: null, estado: "nuevo", cierre: 1 },
  { c: 2, monto: 21400, pagado: 10700, mod: "lima",     despacho: null, estado: "nuevo", cierre: 2 },
  // Esta semana, cada uno frenado en un punto distinto.
  { c: 3, monto: 8400,  pagado: 4200, mod: "lima",      despacho: dia(1), estado: "falta_saldo" },
  { c: 4, monto: 15600, pagado: 15600, mod: "provincia", despacho: dia(1), estado: "falta_direccion" },
  { c: 5, monto: 6900,  pagado: 6900, mod: "provincia", despacho: dia(2), estado: "listo" },
  { c: 6, monto: 11200, pagado: 11200, mod: "lima",     despacho: dia(0), estado: "despachado" },
  { c: 7, monto: 4300,  pagado: 4300, mod: "lima",      despacho: dia(4), estado: "falta_prueba" },
  // Atrasados.
  { c: 8, monto: 18900, pagado: 9450, mod: "provincia", despacho: dia(-6), estado: "falta_saldo" },
  { c: 9, monto: 5200,  pagado: 5200, mod: "lima",      despacho: dia(-2), estado: "listo" },
  // Sin fecha, y dos cerrados con su máquina en el parque.
  { c: 0, monto: 7700,  pagado: 3850, mod: "provincia", despacho: null, estado: "sin_fecha" },
  { c: 1, monto: 13400, pagado: 13400, mod: "lima",     despacho: dia(-20), estado: "cerrado" },
];

const pedidos = [];
for (let i = 0; i < PEDIDOS.length; i++) {
  const p = PEDIDOS[i];
  const cuenta = cuentas[p.c];
  const e = p.estado;
  const nuevo = e === "nuevo";
  const cerrado = e === "cerrado";
  const despachado = e === "despachado" || cerrado;

  const { rows: [s] } = await bd.query(
    `insert into servicios_postventa
      (cuenta_id, cliente_texto, fecha_confirmacion, ubicacion, equipo, tipo_servicio, observaciones,
       monto, moneda, forma_pago, modalidad, informe_cierre_id, numero_pedido_erp,
       pedido_ejecutado_at, pedido_ejecutado_por, liquidacion_at, liquidacion_por,
       aprobado_at, aprobado_por, responsable_id,
       monto_pagado, pago_confirmado_at, pago_confirmado_por,
       prueba_solicitada_at, prueba_lista_at, prueba_lista_por, protocolo_prueba_ref,
       plano_enviado_at, preinstalacion_ok_at,
       direccion_verificada_at, direccion_verificada_con, direccion_entrega,
       fecha_despacho, despacho_nota, despachado_at, transportista, guia, recibe_nombre,
       puesta_en_marcha, completado, cerrado_at, origen, es_prueba)
     values ($1,$2,$3,$4,$5,$6,$7,$8,'USD',$9,$10,$11,$12,
             $13,$14,$13,$14,$15,$16,$16,
             $17,$18,$16,
             $19,$20,$16,$21,
             $22,$23,
             $24,$25,$26,
             $27,$28,$29,$30,$31,$32,
             $33,$34,$35,'crm',true)
     returning id`,
    [
      cuenta.id, `${CLIENTES[p.c][1]} - ${cuenta.razon_social}`, dia(-14 - i),
      p.mod === "provincia" ? `AGENCIA SHALOM - ${cuenta.dep}` : `${cuenta.dist} - Lima`,
      EQUIPO[i], "ENTREGA DE EQUIPO",
      i === 3 ? "Cliente pide entrega antes de las 10 a.m." : null,
      p.monto, "50% ADELANTO + 50% CRÉDITO", p.mod,
      p.cierre != null ? cierres[p.cierre].id : null,
      `P-${9100 + i}`,
      hora(nuevo ? 1 + i : 200), PV,                                    // pedido ejecutado + liquidación
      nuevo ? null : hora(190), nuevo ? null : PV,                       // acuse de postventa
      p.pagado, p.pagado >= p.monto ? hora(180) : null,                  // pago
      nuevo || e === "falta_prueba" ? hora(20) : hora(170),              // prueba solicitada
      nuevo || e === "falta_prueba" ? null : hora(160),                  // prueba lista
      nuevo || e === "falta_prueba" ? null : `PP-${400 + i}`,
      nuevo ? null : hora(185),                                          // plano enviado
      p.mod === "provincia" && !nuevo && e !== "falta_direccion" ? hora(150) : null,
      nuevo || e === "falta_direccion" ? null : hora(140),               // dirección verificada
      nuevo || e === "falta_direccion" ? null : cuenta.contacto,
      p.mod === "provincia" ? `AGENCIA SHALOM - ${cuenta.dep} - ${cuenta.dist}` : `Av. de Prueba ${CLIENTES[p.c][1].slice(-3)}, ${cuenta.dist}`,
      p.despacho, e === "sin_fecha" ? "POR COORDINAR CON EL CLIENTE" : null,
      despachado ? hora(cerrado ? 480 : 5) : null,
      despachado ? (p.mod === "provincia" ? "SHALOM EMPRESARIAL" : "MOVILIDAD PROPIA") : null,
      despachado ? `001-N°0${11300 + i}` : null,
      despachado ? cuenta.contacto : null,
      cerrado ? dia(-18) : null, cerrado, cerrado ? hora(430) : null,
    ]);
  pedidos.push({ id: s.id, cuenta, equipo: EQUIPO[i], cerrado, despacho: p.despacho });
}
console.log(`✓ ${pedidos.length} pedidos: 3 esperando acuse, 5 esta semana, 2 atrasados, 1 sin fecha, 1 cerrado`);

// ── 5. Diez máquinas en el parque instalado ────────────────────────────────
// Cada una en un punto distinto de su vida útil, para poder ver la garantía
// vigente, la que está por vencer, la vencida y el mantenimiento pasado de fecha.
const PARQUE = [
  // [n° equipo, meses desde el despacho, ciclos, meses al próximo mantenimiento]
  [0, 1,  120,   5],
  [1, 3,  980,   3],
  [2, 6,  2400,  0],    // mantenimiento vence hoy
  [3, 11, 5100, -1],    // mantenimiento vencido y garantía por vencer
  [4, 14, 480,  -2],
  [5, 23, 10240, -4],   // el del argumento: 10 mil ciclos, y garantía por vencer
  [6, 26, 3300, -8],    // fuera de garantía
  [7, 30, 7600, -12],   // fuera de garantía
  [8, 2,  260,   4],
  [9, 8,  1850,  1],
];

const equipos = [];
for (const [i, meses, ciclos, mantMeses] of PARQUE) {
  const desdeDespacho = dia(-Math.round(meses * 30));
  const serie = EQUIPO[i].match(/S:\s*([A-Z0-9-]+)/)[1];
  const { rows: [eq] } = await bd.query(
    `insert into equipos_instalados
      (serie, cuenta_id, cliente_texto, modelo_texto, servicio_id, fecha_venta, fecha_despacho,
       guia_remision, fecha_puesta_marcha, garantia_meses, ciclos_inicial, ciclos_ultimo, ciclos_ultimo_at,
       ultimo_mantenimiento, proximo_mantenimiento, ubicacion, es_prueba)
     values ($1,$2,$3,$4,$5,$6,$6,$7,$8,24,5,$9,$10,$11,$12,$13,true)
     returning id, serie, garantia_hasta`,
    [serie, cuentas[i % cuentas.length].id, cuentas[i % cuentas.length].razon_social,
     EQUIPO[i].split(" S:")[0], pedidos[i]?.id ?? null,
     desdeDespacho, `001-N°0${11400 + i}`, dia(-Math.round(meses * 30) + 5),
     ciclos, dia(-3),
     meses > 6 ? dia(-Math.round(meses * 30) + 180) : null,
     dia(Math.round(mantMeses * 30)),
     `${cuentas[i % cuentas.length].dist} - ${cuentas[i % cuentas.length].dep}`]);
  equipos.push(eq);
}
console.log(`✓ ${equipos.length} equipos en el parque (en garantía, por vencer, vencida y mantenimientos atrasados)`);

// ── 6. Diez informes de servicio, todos con su ficha ───────────────────────
// Los textos siguen el estilo de los anexos del manual: trabajo realizado,
// verificación, observaciones y recomendaciones.
const INFORMES = [
  ["puesta_en_marcha", "in_situ",     2,  5,
   "Se ubicó el equipo, se retiraron los pernos de anclaje de transporte y se hicieron las conexiones de agua, desagüe y eléctrica. Se midió el voltaje antes de energizar.",
   "Se realizaron pruebas en vacío y con carga hasta la conformidad del cliente. Se recomienda limpiar el filtro de pelusa cada 2 secados."],
  ["puesta_en_marcha", "videollamada", 5, 5,
   "Puesta en marcha por videollamada con el personal del cliente. Se verificó la instalación del regulador de gas y del manómetro de baja presión.",
   "Se capacitó en uso, cuidado y mantenimiento diario. Se dejó el equipo operativo."],
  ["preinstalacion",   "videollamada", 9, null,
   "Verificación de las condiciones de preinstalación: punto de agua fría, desagüe, salida de vahos y tablero eléctrico.",
   "Falta la línea de desagüe de 2\". Se envió el plano de preinstalación nuevamente al cliente."],
  ["garantia",         "in_situ",     14, 2400,
   "Atención en garantía por error E-13. Se revisó la bomba de desagüe y se encontró obstrucción por pelusa acumulada.",
   "El equipo no contaba con mantenimiento preventivo. Se recomienda el preventivo cada 4 a 6 meses."],
  ["mantenimiento_preventivo", "in_situ", 20, 5100,
   "Mantenimiento preventivo: limpieza de filtros, revisión de fajas, ajuste de rodamientos y calibración del presostato.",
   "Se dejó operativo. Próximo preventivo en 6 meses."],
  ["mantenimiento_correctivo", "in_situ", 26, 10240,
   "Cambio de rodamiento y retén del tambor. Se reemplazaron las fajas de transmisión.",
   "Equipo con 10.240 ciclos: uso intensivo. Se recomienda pasar a preventivo trimestral."],
  ["capacitacion",     "videollamada", 33, 3300,
   "Capacitación al personal nuevo del cliente en operación y mantenimiento diario del equipo.",
   "Se entregó la guía rápida de uso. Personal capacitado en la lista adjunta."],
  ["evaluacion",       "planta",      40, 7600,
   "Evaluación integral en planta del equipo enviado por el cliente. Se levantó el detalle de repuestos a cambiar.",
   "Se cotizará el correctivo por separado. Equipo fuera de garantía."],
  ["garantia",         "videollamada", 48, 260,
   "Diagnóstico virtual: el equipo no enciende. Se verificó tablero y llave termomagnética del cliente.",
   "El problema es de la instalación eléctrica del cliente, no del equipo. Queda en garantía."],
  ["mantenimiento_preventivo", "in_situ", 60, 1850,
   "Preventivo semestral: limpieza general, revisión de mangueras y prueba de ciclos completos.",
   "Sin observaciones. Equipo en buen estado."],
];

let nInf = 0;
for (let i = 0; i < INFORMES.length; i++) {
  const [tipo, modalidad, horasAtras, ciclos, detalle, observaciones] = INFORMES[i];
  const eq = equipos[i];
  const cuenta = cuentas[i % cuentas.length];
  await bd.query(
    `insert into informes_servicio
      (correlativo, anio, tipo, servicio_id, equipo_id, cuenta_id, cliente_texto, equipo_texto,
       modalidad, ejecutado_at, tecnico, elaborado_por, asunto, detalle, verificacion, observaciones,
       ciclos, capacitacion, capacitados, fotos, cliente_conforme_nombre, cliente_conforme_doc,
       enviado_at, emitido_at, es_prueba)
     values ($1, extract(year from current_date)::int, $2::tipo_servicio_pv, $3, $4, $5, $6, $7,
             $8, $9, $10, $11, $12, $13, $14, $15,
             $16, $17::jsonb, $18::jsonb, '[]'::jsonb, $19, $20,
             $9, $9, true)`,
    [901 + i, tipo, pedidos[i]?.id ?? null, eq.id, cuenta.id, cuenta.razon_social, EQUIPO[i],
     modalidad, hora(horasAtras * 24), ["Yony Capulian", "Marco Aliaga", "Ruben Ccopa"][i % 3], PV,
     cuenta.razon_social, detalle,
     "Se verificó el funcionamiento del equipo en vacío y con carga.", observaciones,
     ciclos,
     JSON.stringify({ uso: true, cuidado: true, mantenimiento_diario: tipo !== "evaluacion" }),
     JSON.stringify([{ apellidos_nombres: cuenta.contacto, dni: `4${CLIENTES[i % 10][1].slice(-7)}` }]),
     cuenta.contacto, `4${CLIENTES[i % 10][1].slice(-7)}`]);
  nInf++;
}
console.log(`✓ ${nInf} informes de servicio, cada uno con su ficha abrible`);

// ── 7. Tres del estilo viejo, para ver el contraste ────────────────────────
for (let i = 0; i < 3; i++) {
  const cuenta = cuentas[i + 6];
  await bd.query(
    `insert into soporte_tecnico (cuenta_id, cliente_texto, equipo, detalle, fecha_ejecutado, fecha_envio, responsable_id, origen, es_prueba)
     values ($1,$2,$3,$4,$5,$6,$7,'excel',true)`,
    [cuenta.id, cuenta.razon_social, EQUIPO[i + 6],
     ["VERIFICACIÓN DE PRE INSTALACIÓN", "PUESTA EN MARCHA", "REVISIÓN TÉCNICA"][i],
     dia(-30 - i * 5), dia(-25 - i * 5), PV]);
}
console.log("✓ 3 informes del estilo viejo (planos, sin ficha) para ver la diferencia");

// ── 8. Comprobación: los dos mundos están separados ────────────────────────
const { rows: [r] } = await bd.query(`
  select
    (select count(*) from servicios_postventa where es_prueba)::int  pedidos_prueba,
    (select count(*) from servicios_postventa where not es_prueba)::int pedidos_reales,
    (select count(*) from equipos_instalados where es_prueba)::int    equipos_prueba,
    (select count(*) from equipos_instalados where not es_prueba)::int equipos_reales,
    (select count(*) from informes_servicio where es_prueba)::int     informes_prueba,
    (select count(*) from informes_servicio where not es_prueba)::int informes_reales,
    (select count(*) from soporte_tecnico where es_prueba)::int       soporte_prueba,
    (select count(*) from soporte_tecnico where not es_prueba)::int   soporte_reales,
    (select count(*) from informes_cierre where es_prueba)::int       cierres_prueba,
    (select count(*) from cuentas where comercial_id = $1)::int       clientes,
    (select count(*) from oportunidades where comercial_id = $1)::int casos`, [PV]);

console.log(`\n${"─".repeat(64)}`);
console.log("  BANCO DE PRUEBAS         de prueba   reales");
console.log(`  Clientes                      ${String(r.clientes).padStart(2)}       —`);
console.log(`  Casos de Central              ${String(r.casos).padStart(2)}       —`);
console.log(`  Pedidos / agenda              ${String(r.pedidos_prueba).padStart(2)}      ${String(r.pedidos_reales).padStart(3)}`);
console.log(`  Equipos instalados            ${String(r.equipos_prueba).padStart(2)}      ${String(r.equipos_reales).padStart(3)}`);
console.log(`  Informes de servicio          ${String(r.informes_prueba).padStart(2)}      ${String(r.informes_reales).padStart(3)}`);
console.log(`  Soporte (estilo viejo)        ${String(r.soporte_prueba).padStart(2)}      ${String(r.soporte_reales).padStart(3)}`);
console.log(`  Cierres de venta              ${String(r.cierres_prueba).padStart(2)}       —`);
console.log(`${"─".repeat(64)}`);
console.log("  Los reales siguen intactos y las dos columnas no se cruzan:");
console.log("  la migración 0088 lo garantiza con RLS, no con un filtro de pantalla.");
console.log(`\n  Para borrar todo esto: --limpiar\n`);

await bd.end();
