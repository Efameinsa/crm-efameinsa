// ============================================================
// CRM EFAMEINSA · Los Excel de mantenimiento de Ariana y de Hever
// ============================================================
// Ariana (C4), 27-08: «yo manejaba mi CRM, que era tal cual al CRM de comercial…
// posventa mantenimiento. Te paso el Excel para que lo puedas pasar al CRM».
//
// Y tenía razón: los dos archivos usan EXACTAMENTE el mismo layout de 30
// columnas que los CRM comerciales, así que se reutiliza el mapa de
// `importar-historico-comerciales.mjs` y la tabla de estados que gerencia ya
// confirmó en `docs/08-taxonomia-oficial-efameinsa.md`.
//
// QUÉ ES ESTE TRABAJO, que no es lo que yo había supuesto. No son casos que
// Central deriva: es PROSPECCIÓN SOBRE LA BASE INSTALADA. Ariana pide los files
// que le habilita Lesly y llama a clientes de 2024 y 2025 a los que se les
// vendió equipo y nunca hicieron mantenimiento. Hever recibe las llamadas
// entrantes; a Ariana solo le derivan el prospecto nuevo que pide mantenimiento.
//
// LA DECISIÓN QUE ORDENA TODO: **la cuenta no cambia de dueño**. De los
// clientes de la ruta de Ariana que ya están en el CRM, casi la mitad son de la
// cartera de Katerine o de Brenda. El cliente es de quien lo vendió (regla 1
// del proyecto y migración 0080); lo que se le asigna a ella es la OPORTUNIDAD
// de mantenimiento. Por eso no se toca `cuentas.comercial_id` de nadie.
//
// Una oportunidad por cliente y por archivo, con la etapa más avanzada que
// alcanzó, y todas sus llamadas como actividades con su fecha real.
//
// Uso:
//   node --env-file=.env.local scripts/importar-crm-mantenimiento.mjs
//   node --env-file=.env.local scripts/importar-crm-mantenimiento.mjs --aplicar

import XLSX from "xlsx";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");

const COL = {
  rubro: 3, depart: 4, razonSocial: 5, dniRuc: 6, direcc: 9, provin: 11, distr: 12,
  contacto: 13, cargo: 14, tFijo: 15, tCel: 16, email: 17,
  fEstado: 19, descripcionEstado: 20, estado: 21, accionFut: 22, fAccion: 23,
  nroPpto: 25, monto: 26, equipo: 27,
};

// docs/08-taxonomia-oficial-efameinsa.md — confirmada por gerencia.
const ETAPA_POR_ESTADO = {
  P1_F_REALIZADO: "filtrada", P1_F_REALIZ: "filtrada", REALIZADO: "filtrada",
  P1_F_REALIZ_Y_COTIZADO: "filtrada", "P1_F_REALIZADO Y COTIZADO": "filtrada",
  P1_F_PENDIENTE: "asignada", P1_F_PROY_PEND: "asignada",
  P2_NO_RESPONDE: "seguimiento", P2_ESPERAR: "seguimiento",
  P3_R_COTIZAR: "cotizada",
  P3_RDO_FUTURO: "rechazada", P3_RDO_DARBAJA: "rechazada",
  C1_GC_XAPROBAR: "cotizada", C1_PTO_SIN_CONF: "cotizada", C1_PTO_CONF: "cotizada",
  C3_NO_RESPONDE: "seguimiento", C3_ESPERAR: "seguimiento", C3_NEGOCIAR: "seguimiento",
  C3_SEG_POTENCIAL: "potencial",
  C4_VENTA: "venta", VENTA: "venta",
  C4_RDO_FUTURO: "rechazada", C4_RDO_DAR_BAJA: "rechazada", C4_RDO_COMPET: "rechazada",
};
// Cuál gana cuando un cliente aparece con varios estados a lo largo del año.
const ORDEN = ["asignada", "filtrada", "cotizada", "seguimiento", "potencial", "venta", "rechazada"];

const ARCHIVOS = [
  { quien: "C4", etiqueta: "Ariana Flores",
    ruta: "R:/COPIA CRM ARIANA - POST VENTA/CRM POST VENTA ARIANA - MANTENIMIENTO.xlsx" },
  { quien: "PV", etiqueta: "Hever (postventa)",
    ruta: "R:/COPIA CRM POST VENTA - HEVER/CRM  2026 POST VENTA ACTUALIZADO.xlsx" },
];

const dig = (v) => String(v ?? "").replace(/\D/g, "");
const lim = (v) => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s === "" || s === "-" ? null : s; };
/**
 * Fecha de Excel a ISO, con una salvedad: los archivos traen erratas de año.
 * En el de Hever había dos gestiones fechadas en 2027 sobre un archivo que se
 * llama «CRM 2026». Una gestión no puede haber ocurrido mañana, así que si cae
 * en el futuro se le resta un año, que es la lectura evidente. Si aun así
 * queda en el futuro, se descarta la fecha en vez de inventar una.
 */
const fecha = (s) => {
  if (typeof s !== "number" || s <= 20000 || s >= 60000) return null;
  const d = new Date(Math.round((s - 25569) * 864e5));
  const hoy = new Date();
  if (d > hoy) d.setFullYear(d.getFullYear() - 1);
  return d > hoy ? null : d.toISOString().slice(0, 10);
};
const tipoDoc = (d) => (d.length === 11 ? "RUC" : d.length === 8 ? "DNI" : "SIN_DOC");

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

/**
 * Encontrar al cliente que YA está en el CRM, aunque el Excel lo escriba con
 * otro documento.
 *
 * Buscar solo por `num_doc` exacto habría creado 17 cuentas duplicadas, y el
 * proyecto ya pagó una limpieza de duplicados (14.354 → 14.137). Los tres casos
 * que aparecen en estos archivos:
 *
 *   · DNI contra RUC de persona natural: «VARGAS FONSECA» está en el Excel como
 *     42892789 y en el CRM como 10428927899. El RUC de una persona natural es
 *     «10» + su DNI + un verificador, así que se puede cruzar.
 *   · Cuenta existente SIN documento y misma razón social exacta: «MAYO TOURS
 *     S.A.» ya está, sin RUC. Se enlaza y se le completa el documento.
 *   · Celdas rotas: «206101018962060807527620601721539» son tres RUC pegados.
 *     No se inventa cuál es: se trata como sin documento y se cruza por nombre.
 */
async function resolverCuenta(doc, razon) {
  const valido = doc.length === 8 || doc.length === 11;

  if (valido) {
    const { rows } = await bd.query(`select id, num_doc from cuentas where num_doc = $1 limit 1`, [doc]);
    if (rows[0]) return { ...rows[0], via: "documento" };
  }
  // DNI del Excel → RUC de persona natural en el CRM.
  if (doc.length === 8) {
    const { rows } = await bd.query(
      `select id, num_doc from cuentas where num_doc like $1 and length(num_doc) = 11 limit 2`, [`10${doc}%`]);
    if (rows.length === 1) return { ...rows[0], via: "DNI→RUC" };
  }
  // RUC de persona natural del Excel → DNI en el CRM.
  if (doc.length === 11 && doc.startsWith("10")) {
    const { rows } = await bd.query(`select id, num_doc from cuentas where num_doc = $1 limit 1`, [doc.slice(2, 10)]);
    if (rows[0]) return { ...rows[0], via: "RUC→DNI" };
  }
  // Razón social exacta, y solo si es inequívoca: una sola cuenta candidata.
  const { rows } = await bd.query(
    `select id, num_doc from cuentas where upper(btrim(razon_social)) = upper(btrim($1)) limit 2`, [razon]);
  if (rows.length === 1) return { ...rows[0], via: "razón social" };

  return null;
}

const { rows: motivos } = await bd.query(`select id, nombre from catalogo_motivos_rechazo order by nombre`);
const MOTIVO = motivos[0]?.id ?? null;

let totalCuentasNuevas = 0, totalOportunidades = 0, totalActividades = 0, totalContactos = 0;
const conflictos = [];

for (const archivo of ARCHIVOS) {
  const { rows: [perfil] } = await bd.query(
    `select id, nombre from perfiles where codigo_comercial = $1 and activo`, [archivo.quien]);
  if (!perfil) { console.error(`No existe el perfil ${archivo.quien}`); continue; }

  const wb = XLSX.readFile(archivo.ruta);
  // Un cliente puede estar en PROSPECTO y también en COTIZACIÓN: es el mismo
  // prospecto que avanzó de hoja. Se junta en una sola oportunidad.
  const clientes = new Map();

  for (const hoja of wb.SheetNames) {
    if (!/PROSP|COTIZ/i.test(hoja)) continue;
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: "" });
    let actual = null;

    for (const f of filas.slice(1)) {
      const razon = lim(f[COL.razonSocial]);
      if (!razon || /^nombre|^razon/i.test(razon)) continue;
      const doc = dig(f[COL.dniRuc]);

      if (doc.length >= 8) {
        // Fila cabecera: el cliente, con sus datos.
        const clave = doc;
        if (!clientes.has(clave)) {
          clientes.set(clave, {
            doc, razon,
            rubro: lim(f[COL.rubro]), depart: lim(f[COL.depart]), direcc: lim(f[COL.direcc]),
            provin: lim(f[COL.provin]), distr: lim(f[COL.distr]),
            contacto: lim(f[COL.contacto]), cargo: lim(f[COL.cargo]),
            telefono: lim(f[COL.tCel]) ?? lim(f[COL.tFijo]), email: lim(f[COL.email]),
            equipo: lim(f[COL.equipo]), ppto: lim(f[COL.nroPpto]),
            etapas: [], gestiones: [], proxima: null, proximaAt: null,
          });
        }
        actual = clientes.get(clave);
      }
      // La fila —cabecera o seguimiento— puede traer estado, nota y fechas.
      if (!actual) continue;
      const est = lim(f[COL.estado]);
      if (est) {
        const etapa = ETAPA_POR_ESTADO[est.toUpperCase().replace(/\s+/g, "_")];
        if (etapa) actual.etapas.push(etapa);
      }
      // En las filas de seguimiento la nota se corre a la columna del documento.
      const nota = lim(f[COL.descripcionEstado]) ?? (doc.length < 8 ? lim(f[COL.dniRuc]) : null);
      const cuando = fecha(f[COL.fEstado]) ?? (doc.length < 8 ? fecha(f[COL.dniRuc]) : null);
      if (nota && nota.length > 20) actual.gestiones.push({ nota, cuando });
      const acc = lim(f[COL.accionFut]);
      if (acc) { actual.proxima = acc; actual.proximaAt = fecha(f[COL.fAccion]); }
    }
  }

  // Cruce contra el CRM, tolerante a cómo esté escrito el documento.
  const porDoc = new Map();
  const vias = {};
  for (const [doc, c] of clientes) {
    const hallada = await resolverCuenta(doc, c.razon);
    if (!hallada) continue;
    const { rows: [detalle] } = await bd.query(
      `select c.id, c.num_doc, c.razon_social, c.comercial_id, p.codigo_comercial
         from cuentas c left join perfiles p on p.id = c.comercial_id
        where c.id = $1`, [hallada.id]);
    porDoc.set(doc, { ...detalle, via: hallada.via });
    vias[hallada.via] = (vias[hallada.via] ?? 0) + 1;
  }
  const existentes = [...porDoc.values()];
  const nuevos = [...clientes.keys()].filter((d) => !porDoc.has(d));
  const ajenos = existentes.filter((r) => r.comercial_id && r.codigo_comercial !== archivo.quien);

  console.log("\n" + "=".repeat(74));
  console.log(`${archivo.etiqueta} (${archivo.quien})`);
  console.log(`  clientes en el Excel        : ${clientes.size}`);
  console.log(`  ya están en el CRM          : ${porDoc.size}`, JSON.stringify(vias));
  console.log(`  se crearán                  : ${nuevos.length}`);
  console.log(`  de cartera AJENA            : ${ajenos.length}  (la cuenta NO cambia de dueño)`);
  const porDueño = {};
  for (const r of ajenos) porDueño[r.codigo_comercial] = (porDueño[r.codigo_comercial] ?? 0) + 1;
  if (ajenos.length) console.log(`     ${JSON.stringify(porDueño)}`);
  const conGestiones = [...clientes.values()].reduce((a, c) => a + c.gestiones.length, 0);
  console.log(`  gestiones a registrar       : ${conGestiones}`);
  const etapasResumen = {};
  for (const c of clientes.values()) {
    const e = c.etapas.sort((a, b) => ORDEN.indexOf(b) - ORDEN.indexOf(a))[0] ?? "asignada";
    etapasResumen[e] = (etapasResumen[e] ?? 0) + 1;
  }
  console.log(`  etapas resultantes          :`, JSON.stringify(etapasResumen));

  if (ajenos.length) conflictos.push({ quien: archivo.quien, n: ajenos.length, porDueño });

  if (!APLICAR) {
    totalCuentasNuevas += nuevos.length;
    totalOportunidades += clientes.size;
    totalActividades += conGestiones;
    continue;
  }

  // ── Se escribe ────────────────────────────────────────────────────────────
  for (const [doc, c] of clientes) {
    const hallada = porDoc.get(doc);
    let cuentaId = hallada?.id ?? null;
    // Si se la reconoció por nombre y no tenía documento, se le completa: es
    // el dato que evita el próximo duplicado.
    if (cuentaId && !hallada.num_doc && (doc.length === 8 || doc.length === 11)) {
      await bd.query(
        `update cuentas set num_doc = $2, tipo_doc = $3 where id = $1 and num_doc is null`,
        [cuentaId, doc, tipoDoc(doc)]);
    }

    if (!cuentaId) {
      // Cliente nuevo: entra a la cartera de quien lo trabajó.
      const { rows: [nueva] } = await bd.query(
        `insert into cuentas (razon_social, tipo_doc, num_doc, comercial_id, cartera_desde,
                              departamento, provincia, distrito, direccion, notas)
         values ($1,$2,$3,$4,current_date,$5,$6,$7,$8,$9) returning id`,
        [c.razon, tipoDoc(doc), doc, perfil.id, c.depart, c.provin, c.distr, c.direcc,
         `Importado del CRM de mantenimiento de ${archivo.etiqueta}.`]);
      cuentaId = nueva.id;
      totalCuentasNuevas++;
    }

    if (c.contacto) {
      const { rowCount } = await bd.query(
        `select 1 from contactos where cuenta_id = $1 and upper(nombre) = upper($2)`, [cuentaId, c.contacto]);
      if (!rowCount) {
        await bd.query(
          `insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal)
           values ($1,$2,$3,$4,$5, not exists (select 1 from contactos where cuenta_id = $1))`,
          [cuentaId, c.contacto, c.cargo, c.telefono, c.email]);
        totalContactos++;
      }
    }

    const etapa = c.etapas.sort((a, b) => ORDEN.indexOf(b) - ORDEN.indexOf(a))[0] ?? "asignada";
    // Idempotencia: una sola oportunidad de mantenimiento por cliente y persona.
    const { rows: [yaHay] } = await bd.query(
      `select id from oportunidades
        where cuenta_id = $1 and comercial_id = $2 and tipo_postventa = 'mantenimiento'
          and origen = 'historico_excel' limit 1`, [cuentaId, perfil.id]);
    let opId = yaHay?.id;
    if (!opId) {
      // `segmento` NO se usa para el equipo: es el enum `segmento_producto`
      // (industrial / semi_industrial), no texto libre. El equipo que el
      // cliente tiene queda dentro del relato de las gestiones; su sitio
      // propio es `equipos_instalados`, cuando haya número de serie.
      const { rows: [op] } = await bd.query(
        `insert into oportunidades
           (cuenta_id, comercial_id, etapa, intencion, moneda, tipo_postventa, origen,
            motivo_rechazo_id, proxima_accion, proxima_accion_at)
         values ($1,$2,$3::etapa_oportunidad,'sin_definir','USD','mantenimiento','historico_excel',
                 $4,$5,$6) returning id`,
        [cuentaId, perfil.id, etapa, etapa === "rechazada" ? MOTIVO : null,
         c.proxima, c.proximaAt]);
      opId = op.id;
      totalOportunidades++;
    }

    for (const g of c.gestiones) {
      const { rowCount } = await bd.query(
        `select 1 from actividades where oportunidad_id = $1 and nota = $2`, [opId, g.nota]);
      if (rowCount) continue;
      await bd.query(
        `insert into actividades (oportunidad_id, realizada_por, tipo, nota, realizada_at)
         values ($1,$2,'llamada',$3, coalesce($4::date, current_date))`,
        [opId, perfil.id, g.nota, g.cuando]);
      totalActividades++;
    }
  }
}

console.log("\n" + "─".repeat(74));
if (APLICAR) {
  console.log("  IMPORTADO");
  console.log(`  cuentas creadas       : ${totalCuentasNuevas}`);
  console.log(`  contactos creados     : ${totalContactos}`);
  console.log(`  oportunidades creadas : ${totalOportunidades}`);
  console.log(`  gestiones registradas : ${totalActividades}`);
  console.log("\n  Ninguna cuenta cambió de dueño: solo se agregó la oportunidad");
  console.log("  de mantenimiento a nombre de quien la trabaja.");
} else {
  console.log("  SIMULACIÓN — no se escribió nada.");
  console.log(`  se crearían ${totalCuentasNuevas} cuentas, ${totalOportunidades} oportunidades y ${totalActividades} gestiones.`);
  for (const c of conflictos) {
    console.log(`\n  ⚠ ${c.quien} va a trabajar ${c.n} clientes de cartera ajena ${JSON.stringify(c.porDueño)}.`);
    console.log(`    La cuenta sigue siendo de su comercial; la oportunidad de mantenimiento es de ${c.quien}.`);
  }
  console.log("\n  Para aplicarlo: --aplicar\n");
}
await bd.end();
