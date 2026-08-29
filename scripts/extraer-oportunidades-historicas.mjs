// Bloque A, Fase 1 (docs/10-plan-ajustes-reunion-21-08.md) — extrae las
// oportunidades reales de los Excel de cada comercial en R:, SIN TOCAR LA
// BASE. Genera scripts/data/oportunidades-historicas.json + un reporte de
// cobertura para revisar antes de seguir con la Fase 2.
//
// POR QUÉ HACÍA FALTA: el CRM tiene 1.297 oportunidades y las 1.297 son
// etapa='venta' — la importación anterior solo extrajo las filas C4_VENTA de
// COTIZ. y descartó todo lo demás (P1_F_Realizado, C3_Esperar, etc.). Por eso
// Carlos, probando el CRM como comercial nuevo, no encontraba SUS
// oportunidades: literalmente no existen. Este script las trae de las hojas
// PROSP. y COTIZ., que es donde vive el estado real de cada prospecto.
//
// EL EXCEL AGREGA UNA FILA POR GESTIÓN, NO POR CLIENTE. C3_Esperar aparece
// 52.808 veces: no son 52 mil prospectos, es la misma gente con seguimientos
// repetidos. Este script se queda con la fila de F_ESTADO más alto por
// cliente (el estado ACTUAL, no el historial completo de gestiones).
//
// IDENTIDAD DEL CLIENTE — regla explícita, pensada para no mezclar personas:
//   1. Si trae RUC/DNI válido (8 u 11 dígitos): se agrupa GLOBALMENTE por ese
//      documento, sin importar el comercial. Es una llave dura.
//   2. Si no trae documento y el nombre NO es un comodín ("SIN NOMBRE" etc.):
//      se agrupa por (comercial + nombre normalizado) — SOLO dentro del mismo
//      comercial. Cruzar nombres entre comerciales sin un documento que lo
//      confirme es adivinar, y ya se vio un caso real: 1.255 nombres/RUC
//      aparecen bajo dos comerciales (C1 y C5) en los archivos, y C1 en
//      concreto tiene apenas ~11 clientes propios — mezclarlos habría sido
//      un error.
//   3. Si no trae documento Y el nombre es un comodín (249 filas, 0,2 %): se
//      descarta. No hay ninguna llave confiable para esa fila.
//
// EL COMERCIAL DE LA OPORTUNIDAD ES EL DE LA CUENTA, NO EL DEL EXCEL. Si el
// cliente ya existe en el CRM (por documento/teléfono), el dueño actual de la
// cartera NO se toca acá — reasignar cartera es decisión manual de gerencia
// (docs/03-reglas-negocio.md, regla 1), no un efecto secundario de un import.
// Solo las cuentas NUEVAS quedan con el comercial del Excel.
//
// Uso: node scripts/extraer-oportunidades-historicas.mjs

import XLSX from "xlsx";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = "R:/";
const SALIDA = "scripts/data/oportunidades-historicas.json";

// ── Utilidades (mismas que scripts/importar-ventas-historicas.mjs, para no
// introducir una segunda forma de leer las mismas fechas/teléfonos) ────────
const soloDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const inferirTipoDoc = (d) => (d.length === 11 ? "RUC" : d.length === 8 ? "DNI" : null);
function excelFechaAISO(serial) {
  if (typeof serial !== "number" || serial <= 0) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function normalizarTelefono(t) {
  if (!t) return null;
  const d = String(t).replace(/\D/g, "");
  return d.length > 9 && d.startsWith("51") ? d.slice(2) : d || null;
}
const normalizarEmail = (e) => { const s = String(e ?? "").trim().toLowerCase(); return s.includes("@") ? s : null; };
const normalizarRazonSocial = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
function codigoCentral(s) {
  const m = String(s ?? "").toUpperCase().replace(/O/g, "0").match(/PR0*\s*(\d+)/);
  return m ? "PRO" + String(parseInt(m[1], 10)) : null;
}
function parseMonto(raw) {
  if (raw == null) return null;
  if (typeof raw === "number") return raw > 0 ? Math.round(raw * 100) / 100 : null;
  let s = String(raw).trim();
  if (!s || /^\d+-\d+$/.test(s)) return null;
  s = s.replace(/^(S\/\.?|US\$|USD|\$)\s*/i, "").trim();
  const lc = s.lastIndexOf(","), ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lc > -1) s = s.replace(/,/g, "");
  const n = parseFloat(s);
  return !isFinite(n) || n <= 0 ? null : Math.round(n * 100) / 100;
}

// Mismo criterio que scripts/lib-fusionar-cuentas.mjs — reescrito acá porque
// ese módulo trae también fusionar()/historia() que dependen de una conexión
// a la base, y esta fase no toca la base.
const NOMBRES_COMODIN =
  /^(SIN\s*(NOMBRE|DATOS|RAZON\s*SOCIAL|INFORMACION|ESPECIFICAR)|N\s*[/.]?\s*D|NO\s+(SE\s+INDICA|HAY\s+DATOS|INDICA|ESPECIFICA)|\(?\s*SIN\s+RAZON\s+SOCIAL\s*\)?|CLIENTE|VARIOS|X+|-+|\.+)$/;
function esComodin(razonSocial) {
  const limpio = String(razonSocial ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase().replace(/[^A-Z0-9 /.()-]/g, " ").replace(/\s+/g, " ").trim();
  if (!limpio) return true;
  if (NOMBRES_COMODIN.test(limpio)) return true;
  if (/^SIN\b/.test(limpio)) {
    const resto = limpio.replace(/^SIN\b/, "").trim().split(/[\s/-]+/).filter(Boolean);
    const RELLENO = new Set(["NOMBRE", "DATOS", "RAZON", "SOCIAL", "NI", "Y", "DE", "LA", "EL", "INFORMACION", "ESPECIFICAR", "REGISTRO", "SIN"]);
    if (resto.length && resto.every((p) => RELLENO.has(p))) return true;
  }
  const trozos = limpio.split(/\s*[/-]\s*/).filter(Boolean);
  return trozos.length > 1 && trozos.every((t) => NOMBRES_COMODIN.test(t.trim()));
}

// ── Mapa ESTADO → etapa. Cubre las 33 formas que EXISTEN en los archivos hoy
// (verificado escaneando los 22 Excel completos) — no es una lista genérica,
// es exhaustiva contra el dato real. Si algún día aparece un archivo nuevo
// con un estado no listado aquí, el script lo reporta en vez de adivinar. ──
const MAPA_ESTADO = {
  "": { etapa: "asignada", nota: "Sin estado registrado — nunca se trabajó" },
  "C3_ESPERAR": { etapa: "seguimiento" },
  "P1_F_REALIZ_Y_COTIZADO": { etapa: "filtrada" },
  "C1_PTO_CONF": { etapa: "cotizada" },
  "C3_NO_RESPONDE": { etapa: "seguimiento" },
  "P1_F_REALIZADO": { etapa: "filtrada" },
  // ⚠️ Pregunta para Carlos (§9 del plan): ¿"derivado" o "datos actualizados"?
  "P1_F_DERIV_ACTUA": { etapa: "filtrada", dudoso: true },
  // «Potencial» significa dos cosas distintas y no hay que confundirlas. En el
  // Excel, `C3_Seg_Potencial` es una etiqueta congelada el día que el comercial
  // tocó la fila por última vez —hay filas de 2021—. En el CRM, desde el cuadro
  // semanal del 25-08, `etapa='potencial'` significa «lo que voy a cerrar ESTA
  // semana» y alimenta «LO QUE QUEDÓ PENDIENTE» del reporte. Traducirlo literal
  // llenó los reportes de Brenda y de Katerine de clientes que nadie negocia
  // (29-08: «no sabemos por qué nos sale como potenciales» — y era verdad).
  // Va a `seguimiento`, como sus hermanos C3_ESPERAR / C3_NO_RESPONDE /
  // C3_NEGOCIAR: sigue en cartera, pero no reclama una semana que no le toca.
  // A `potencial` se llega SOLO trabajando dentro del CRM.
  "C3_SEG_POTENCIAL": { etapa: "seguimiento" },
  "C1_PTO_VECES": { etapa: "cotizada" },
  // motivoRechazoId 441 = "Sin precisar (import histórico)": el plan (§9,
  // pregunta 4) deja explícitamente para Carlos si estos 1.678 clientes
  // deben quedar visibles/recuperables o esconderse — no se adivina un
  // motivo real de los 8 del catálogo. Queda con etapa='rechazada' (así
  // sale en el Excel) y un motivo genérico, reasignable en bloque después.
  "C4_RDO_FUTURO": { etapa: "rechazada", motivoRechazoId: 441 },
  "P3_R_COTIZAR": { etapa: "cotizada" },
  "C4_VENTA": { etapa: "venta", saltar: true }, // ya está importada — ver §3.5 del plan
  "P2_ESPERAR": { etapa: "seguimiento" },
  "C2_REU_SHOWROOM": { etapa: "seguimiento", actividad: "showroom" },
  "P2_NO_RESPONDE": { etapa: "seguimiento" },
  "C2_REU_ONLINE": { etapa: "seguimiento", actividad: "otro" },
  // ⚠️ Prefijo "H_" sin documentar en el manual — pregunta para Carlos.
  "H_ESPERAR": { etapa: "seguimiento", dudoso: true },
  "C4_RDO_DAR_BAJA": { etapa: "rechazada", motivoRechazoId: 441 },
  "P3_RDO_DARBAJA": { etapa: "rechazada", motivoRechazoId: 441 },
  "P1_F_PENDIENTE": { etapa: "asignada" },
  "P3_RDO_FUTURO": { etapa: "rechazada", motivoRechazoId: 441 },
  "H_NORESP": { etapa: "seguimiento", dudoso: true },
  "C4_RDO_DERIVADO": { etapa: "derivada" },
  "H_TRASLADAR_CRM": { etapa: "asignada", dudoso: true },
  "C1_GC_XAPROBAR": { etapa: "cotizada", pendienteGerencia: true },
  "C1_PTO_SIN_CONF": { etapa: "cotizada" },
  "C4_RDO_COMPET": { etapa: "rechazada", motivoRechazoId: 1 }, // "Compró a la competencia"
  "C3_NEGOCIAR": { etapa: "seguimiento" },
  "C2_REU_EXTERIOR": { etapa: "seguimiento", actividad: "visita" },
  "H_RDO_FUTURO": { etapa: "rechazada", dudoso: true, motivoRechazoId: 441 },
  "P3_RDO_DERIVADO": { etapa: "derivada" },
  "H_RDO_DARBAJA": { etapa: "rechazada", dudoso: true, motivoRechazoId: 441 },
  "C": { descartar: true }, // basura, 1 fila
};

const MAPA_INTENCION = {
  "": "sin_definir", "MEDIO": "medio", "MEDIO_BAJO": "medio_bajo", "MEDIO_ALTO": "medio_alto",
  "BAJO": "bajo", "ALTO_POTENCIAL": "alto_potencial", "MEDIA": "medio", "ALTO": "alto_potencial",
  "ALTA": "alto_potencial", "BAJA": "bajo", "NAJO": "bajo", "_BAJO": "bajo", "BAJOI": "bajo",
  "MEDIOALTO": "medio_alto", "BAJOº": "bajo", "BAJ": "bajo",
};
const intencionDe = (v) => MAPA_INTENCION[String(v ?? "").toUpperCase().replace(/\s+/g, "")] ?? "sin_definir";

const MAPA_ACCION = {
  "LLAMAR": "Llamar al cliente",
  "VALIDARGC": "Validar con gerencia comercial",
  "VALIDAR_GC": "Validar con gerencia comercial",
  "PROYECTO_PEND": "Proyecto en evaluación de gerencia",
  "COORD_REUNION": "Coordinar reunión",
  "ENVIAR_PPTO": "Enviar presupuesto",
  "FILTRAR": "Filtrar en SUNAT / redes",
  "DERIVAR_OTRO": "Derivar a otro comercial",
  // FIN_* significa que ya no queda acción pendiente en ese punto del proceso.
  "FIN_PROSPECTO": null, "FIN_COTIZAR": null,
  "FINDELPROSPECTO": null, "FINDEPROSPECTO": null, "FINDELPROPSECTO": null,
};
function accionDe(v) {
  const k = String(v ?? "").toUpperCase().replace(/\s+/g, "");
  if (k === "") return null;
  if (k in MAPA_ACCION) return MAPA_ACCION[k];
  return null; // basura de digitación (fechas, nombres colados) — no se inventa una acción
}

// Best-effort, SOLO para cuentas nuevas (nunca pisa un rubro ya cargado).
const RUBRO_POR_PALABRA = [
  [/HOTEL|HOSTAL/, 1], [/CLINICA|MEDIC|HOSPITAL/, 2],
  [/LAV[_ ]?COMERCIAL|LAV[_ ]?PROFESIONAL|LAV[_ ]?PROYECTO|OTROS_COMERCIAL/, 3],
  [/REST|CATERING/, 4], [/TEXTIL/, 5], [/MINER/, 6],
];
function rubroDe(v) {
  const s = String(v ?? "").toUpperCase();
  if (!s || s === "NO DEFINIDO" || s === "PROYECTO NUEVO") return null;
  for (const [re, id] of RUBRO_POR_PALABRA) if (re.test(s)) return id;
  return 8; // "Otro" — hay un rubro declarado, no encaja en los específicos
}

// ── Escaneo de archivos ─────────────────────────────────────────────────
const archivos = [];
(function recorrer(dir, prof = 0) {
  if (prof > 3) return;
  for (const e of readdirSync(dir)) {
    if (e.startsWith("~$")) continue;
    const p = join(dir, e);
    try {
      if (statSync(p).isDirectory()) recorrer(p, prof + 1);
      else if (/\.xlsx?$/i.test(e)) archivos.push(p);
    } catch { /* carpeta sin permiso, se ignora */ }
  }
})(RAIZ);

const comercialDe = (ruta) => "C" + ((ruta.match(/CRM C(\d)/i) ?? [])[1] ?? "?");

// Acumuladores del reporte de cobertura.
const stats = {
  archivos: archivos.length, filasLeidas: 0, sinRazonSocial: 0,
  descartadasComodin: 0, descartadasBasura: 0, estadosSinMapa: new Set(),
};

// clave de identidad → registro ganador (el de F_ESTADO más alto)
const porDoc = new Map();      // documento global
const porComercialNombre = new Map(); // comercial + nombre (sin documento)

for (const archivo of archivos) {
  const comercial = comercialDe(archivo);
  let wb;
  try { wb = XLSX.readFile(archivo); } catch (e) { console.log(`⚠️ No se pudo leer ${archivo}: ${e.message}`); continue; }

  for (const hoja of ["PROSP.", "COTIZ."]) {
    if (!wb.SheetNames.includes(hoja)) continue;
    for (const f of XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null })) {
      const razonCruda = f["NOMBRE_RAZON SOCIAL"];
      if (razonCruda == null || String(razonCruda).trim() === "") { stats.sinRazonSocial++; continue; }
      stats.filasLeidas++;

      const doc = soloDigitos(f["DNI_RUC"]);
      const tieneDocValido = doc.length === 8 || doc.length === 11;
      const razon = String(razonCruda).trim();

      if (!tieneDocValido && esComodin(razon)) { stats.descartadasComodin++; continue; }

      const fEstado = Number(f.F_ESTADO) || 0;
      const registro = {
        archivo, hoja, comercial, razon,
        doc: tieneDocValido ? doc : null,
        tipoDoc: tieneDocValido ? inferirTipoDoc(doc) : null,
        rubro: f.RUBRO ?? null,
        departamento: f.DEPART ?? null,
        provincia: f.PROVIN ?? null,
        distrito: f.DISTR ?? null,
        direccion: f.DIRECC ?? null,
        contacto: f.CONTACTO ?? null,
        cargo: f.CARGO ?? null,
        telCel: f.T_CEL ?? null,
        telFijo: f.T_FIJO ?? null,
        email: f.EMAIL ?? null,
        fEstado,
        fAccion: Number(f.F_ACCION) || 0,
        estadoCrudo: f.ESTADO ?? null,
        accionFutCruda: f.ACCION_FUT ?? null,
        descripcionEstado: f["DESCRIPCION ESTADO"] ?? null,
        intCompraCruda: f.INT_COMPRA ?? null,
        provProspCruda: f.PROV_PROSP ?? null,
        codMkt: f.COD_MKT ?? null,
        nroPpto: f.Nro_PPTO ?? null,
        monto: f.MONTO ?? null,
        equipo: f.EQUIPO ?? null,
      };

      if (tieneDocValido) {
        const prev = porDoc.get(doc);
        if (!prev || fEstado >= prev.fEstado) porDoc.set(doc, registro);
      } else {
        const clave = comercial + "|" + normalizarRazonSocial(razon);
        const prev = porComercialNombre.get(clave);
        if (!prev || fEstado >= prev.fEstado) porComercialNombre.set(clave, registro);
      }
    }
  }
}

console.log(`Archivos escaneados: ${stats.archivos}`);
console.log(`Filas con razón social: ${stats.filasLeidas} · descartadas por nombre comodín sin documento: ${stats.descartadasComodin}`);
console.log(`Clientes únicos por documento: ${porDoc.size} · por (comercial+nombre): ${porComercialNombre.size}`);
console.log(`Total de registros a procesar: ${porDoc.size + porComercialNombre.size}`);

// ── Traducción a la forma final ────────────────────────────────────────
const salida = [];
const porEtapa = new Map(), porComercial = new Map();
let saltadasVenta = 0, dudosas = 0, sinMapaCount = 0;
const ejemplosSinMapa = [];

function procesar(r) {
  const claveEstado = String(r.estadoCrudo ?? "").toUpperCase().replace(/\s+/g, "");
  const mapa = MAPA_ESTADO[claveEstado];
  if (!mapa) {
    sinMapaCount++;
    stats.estadosSinMapa.add(r.estadoCrudo);
    if (ejemplosSinMapa.length < 5) ejemplosSinMapa.push({ estado: r.estadoCrudo, cliente: r.razon });
    return; // no se inventa un mapeo — se reporta y se revisa a mano
  }
  if (mapa.descartar) { stats.descartadasBasura++; return; }
  if (mapa.saltar) { saltadasVenta++; return; } // C4_VENTA: ya está importada

  if (mapa.dudoso) dudosas++;

  const fechaEstadoISO = excelFechaAISO(r.fEstado);
  const fechaAccionISO = excelFechaAISO(r.fAccion);

  const item = {
    comercial: r.comercial,
    razon: r.razon,
    doc: r.doc,
    tipoDoc: r.tipoDoc,
    telefono: normalizarTelefono(r.telCel) ?? normalizarTelefono(r.telFijo),
    telCel: r.telCel, telFijo: r.telFijo,
    email: normalizarEmail(r.email),
    contacto: r.contacto ? String(r.contacto).trim().replace(/,$/, "") : null,
    cargo: r.cargo,
    rubroId: rubroDe(r.rubro),
    departamento: r.departamento ? String(r.departamento).trim() : null,
    provincia: r.provincia ? String(r.provincia).trim() : null,
    distrito: r.distrito ? String(r.distrito).trim() : null,
    direccion: r.direccion ? String(r.direccion).trim() : null,
    etapa: mapa.etapa,
    motivoRechazoId: mapa.motivoRechazoId ?? null,
    pendienteGerencia: Boolean(mapa.pendienteGerencia),
    actividadTipo: mapa.actividad ?? null,
    dudoso: Boolean(mapa.dudoso),
    intencion: intencionDe(r.intCompraCruda),
    proximaAccion: accionDe(r.accionFutCruda),
    proximaAccionAt: fechaAccionISO,
    procedencia: r.provProspCruda ? String(r.provProspCruda).trim().toUpperCase() : null,
    codigoCentral: codigoCentral(r.codMkt),
    fechaEstado: fechaEstadoISO,
    nota: r.descripcionEstado ? String(r.descripcionEstado).trim() : null,
    estadoOriginal: r.estadoCrudo,
    accionFutOriginal: r.accionFutCruda,
    nroPpto: r.nroPpto ? String(r.nroPpto).trim() : null,
    montoRef: parseMonto(r.monto),
    equipoRef: r.equipo ? String(r.equipo).trim() : null,
    hoja: r.hoja,
  };
  salida.push(item);
  porEtapa.set(item.etapa, (porEtapa.get(item.etapa) ?? 0) + 1);
  porComercial.set(item.comercial, (porComercial.get(item.comercial) ?? 0) + 1);
}

for (const r of porDoc.values()) procesar(r);
for (const r of porComercialNombre.values()) procesar(r);

writeFileSync(SALIDA, JSON.stringify(salida, null, 1));

console.log(`\n=== REPORTE DE COBERTURA — revisar antes de la Fase 2 ===`);
console.log(`Oportunidades a crear: ${salida.length}`);
console.log(`Saltadas por ser C4_VENTA (ya importadas antes): ${saltadasVenta}`);
console.log(`Basura descartada (estado='C', 1 fila esperada): ${stats.descartadasBasura}`);
console.log(`Con estado marcado "dudoso" (preguntar a Carlos, §9 del plan): ${dudosas}`);
console.log(`Filas con estado SIN mapeo conocido: ${sinMapaCount}`);
if (stats.estadosSinMapa.size) {
  console.log(`  ⚠️ ESTADOS NO RECONOCIDOS (no deberían existir si el escaneo previo fue completo):`);
  console.log("  ", [...stats.estadosSinMapa]);
  console.log("   ejemplos:", JSON.stringify(ejemplosSinMapa));
}

console.log(`\nPor comercial:`);
console.table([...porComercial].sort((a, b) => b[1] - a[1]).map(([c, n]) => ({ comercial: c, oportunidades: n })));
console.log(`\nPor etapa resultante:`);
console.table([...porEtapa].sort((a, b) => b[1] - a[1]).map(([e, n]) => ({ etapa: e, n })));

const conFechaAccion = salida.filter((s) => s.proximaAccionAt).length;
const conDoc = salida.filter((s) => s.doc).length;
const conRubro = salida.filter((s) => s.rubroId).length;
console.log(`\nCon fecha de próxima acción: ${conFechaAccion} (${(100 * conFechaAccion / salida.length).toFixed(1)}%)`);
console.log(`Con documento: ${conDoc} (${(100 * conDoc / salida.length).toFixed(1)}%)`);
console.log(`Con rubro identificado: ${conRubro} (${(100 * conRubro / salida.length).toFixed(1)}%)`);
console.log(`\nEscrito en ${SALIDA}`);
