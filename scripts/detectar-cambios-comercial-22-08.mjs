// Sincronización semanal Excel → CRM (post reunión 21-08): Katerine (C5), Brenda
// (C8) y Ariana (C4) entregaron sus Excel actualizados al viernes 22-08. Los
// comerciales se van hasta el lunes y, a partir de entonces, ya no deberían
// volver a tocar el Excel — así que esta es la ÚLTIMA sincronización de este
// tipo. Por eso importa contrastar SOLO lo que cambió frente a lo que ya se
// importó (scripts/data/oportunidades-historicas.json, ~2026-08-15) en vez de
// reimportar todo de nuevo.
//
// SOLO LECTURA — no escribe en la base ni en el JSON base. Genera un reporte
// de diferencias para revisar antes de decidir cómo aplicarlas.
//
// MISMA LÓGICA DE EXTRACCIÓN Y MAPEO que extraer-oportunidades-historicas.mjs
// (MAPA_ESTADO, identidad por doc / comercial+nombre, etc.) — se reescribe acá
// en vez de importar ese módulo porque ahí el escaneo recorre R:/ completo y
// aquí son 3 archivos puntuales en otra ruta.
//
// Uso: node scripts/detectar-cambios-comercial-22-08.mjs

import XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import baseline from "./data/oportunidades-historicas.json" with { type: "json" };

const ARCHIVOS = [
  { comercial: "C5", ruta: "C:/Users/diseno/Downloads/ACTUALIZADOS/CRM COMERCIAL5 L 2026-Katerine Tello.xlsx" },
  { comercial: "C8", ruta: "C:/Users/diseno/Downloads/ACTUALIZADOS/CRM COMERCIAL8 2026-(BRENDA TABOADA).xlsx" },
  { comercial: "C4", ruta: "C:/Users/diseno/Downloads/ACTUALIZADOS/Copia de Copia de CRM COMERCIAL4 2026-(ariana flores CANCAHRI).xlsx" },
];
const SALIDA_JSON = "scripts/data/cambios-comercial-22-08.json";

// ── Mismas utilidades que extraer-oportunidades-historicas.mjs ────────────
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

const MAPA_ESTADO = {
  "": { etapa: "asignada", nota: "Sin estado registrado — nunca se trabajó" },
  "C3_ESPERAR": { etapa: "seguimiento" },
  "P1_F_REALIZ_Y_COTIZADO": { etapa: "filtrada" },
  "C1_PTO_CONF": { etapa: "cotizada" },
  "C3_NO_RESPONDE": { etapa: "seguimiento" },
  "P1_F_REALIZADO": { etapa: "filtrada" },
  "P1_F_DERIV_ACTUA": { etapa: "filtrada", dudoso: true },
  "C3_SEG_POTENCIAL": { etapa: "potencial" },
  "C1_PTO_VECES": { etapa: "cotizada" },
  "C4_RDO_FUTURO": { etapa: "rechazada", motivoRechazoId: 441 },
  "P3_R_COTIZAR": { etapa: "cotizada" },
  "C4_VENTA": { etapa: "venta", saltar: true },
  "P2_ESPERAR": { etapa: "seguimiento" },
  "C2_REU_SHOWROOM": { etapa: "seguimiento", actividad: "showroom" },
  "P2_NO_RESPONDE": { etapa: "seguimiento" },
  "C2_REU_ONLINE": { etapa: "seguimiento", actividad: "otro" },
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
  "C4_RDO_COMPET": { etapa: "rechazada", motivoRechazoId: 1 },
  "C3_NEGOCIAR": { etapa: "seguimiento" },
  "C2_REU_EXTERIOR": { etapa: "seguimiento", actividad: "visita" },
  "H_RDO_FUTURO": { etapa: "rechazada", dudoso: true, motivoRechazoId: 441 },
  "P3_RDO_DERIVADO": { etapa: "derivada" },
  "H_RDO_DARBAJA": { etapa: "rechazada", dudoso: true, motivoRechazoId: 441 },
  "C": { descartar: true },
};

const MAPA_INTENCION = {
  "": "sin_definir", "MEDIO": "medio", "MEDIO_BAJO": "medio_bajo", "MEDIO_ALTO": "medio_alto",
  "BAJO": "bajo", "ALTO_POTENCIAL": "alto_potencial", "MEDIA": "medio", "ALTO": "alto_potencial",
  "ALTA": "alto_potencial", "BAJA": "bajo", "NAJO": "bajo", "_BAJO": "bajo", "BAJOI": "bajo",
  "MEDIOALTO": "medio_alto", "BAJOº": "bajo", "BAJ": "bajo",
};
const intencionDe = (v) => MAPA_INTENCION[String(v ?? "").toUpperCase().replace(/\s+/g, "")] ?? "sin_definir";

const MAPA_ACCION = {
  "LLAMAR": "Llamar al cliente", "VALIDARGC": "Validar con gerencia comercial",
  "VALIDAR_GC": "Validar con gerencia comercial", "PROYECTO_PEND": "Proyecto en evaluación de gerencia",
  "COORD_REUNION": "Coordinar reunión", "ENVIAR_PPTO": "Enviar presupuesto",
  "FILTRAR": "Filtrar en SUNAT / redes", "DERIVAR_OTRO": "Derivar a otro comercial",
  "FIN_PROSPECTO": null, "FIN_COTIZAR": null,
  "FINDELPROSPECTO": null, "FINDEPROSPECTO": null, "FINDELPROPSECTO": null,
};
function accionDe(v) {
  const k = String(v ?? "").toUpperCase().replace(/\s+/g, "");
  if (k === "") return null;
  if (k in MAPA_ACCION) return MAPA_ACCION[k];
  return null;
}

const RUBRO_POR_PALABRA = [
  [/HOTEL|HOSTAL/, 1], [/CLINICA|MEDIC|HOSPITAL/, 2],
  [/LAV[_ ]?COMERCIAL|LAV[_ ]?PROFESIONAL|LAV[_ ]?PROYECTO|OTROS_COMERCIAL/, 3],
  [/REST|CATERING/, 4], [/TEXTIL/, 5], [/MINER/, 6],
];
function rubroDe(v) {
  const s = String(v ?? "").toUpperCase();
  if (!s || s === "NO DEFINIDO" || s === "PROYECTO NUEVO") return null;
  for (const [re, id] of RUBRO_POR_PALABRA) if (re.test(s)) return id;
  return 8;
}

// ── Extracción de los 3 Excel nuevos, misma regla de "gana el F_ESTADO más
// alto por cliente" — pero SOLO dentro de cada comercial: no tiene sentido
// cruzar doc globalmente entre archivos que ya vienen separados por comercial. ──
const porDoc = new Map(); // doc -> registro (global, como el import original)
const porComercialNombre = new Map();

for (const { comercial, ruta } of ARCHIVOS) {
  let wb;
  try { wb = XLSX.readFile(ruta); } catch (e) { console.error(`✗ No se pudo leer ${ruta}: ${e.message}`); process.exit(1); }

  for (const hoja of ["PROSP.", "COTIZ."]) {
    if (!wb.SheetNames.includes(hoja)) continue;
    for (const f of XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null })) {
      const razonCruda = f["NOMBRE_RAZON SOCIAL"];
      if (razonCruda == null || String(razonCruda).trim() === "") continue;

      const doc = soloDigitos(f["DNI_RUC"]);
      const tieneDocValido = doc.length === 8 || doc.length === 11;
      const razon = String(razonCruda).trim();
      if (!tieneDocValido && esComodin(razon)) continue;

      const fEstado = Number(f.F_ESTADO) || 0;
      const registro = {
        comercial, razon,
        doc: tieneDocValido ? doc : null,
        tipoDoc: tieneDocValido ? inferirTipoDoc(doc) : null,
        rubro: f.RUBRO ?? null, departamento: f.DEPART ?? null, provincia: f.PROVIN ?? null,
        distrito: f.DISTR ?? null, direccion: f.DIRECC ?? null, contacto: f.CONTACTO ?? null,
        cargo: f.CARGO ?? null, telCel: f.T_CEL ?? null, telFijo: f.T_FIJO ?? null, email: f.EMAIL ?? null,
        fEstado, fAccion: Number(f.F_ACCION) || 0,
        estadoCrudo: f.ESTADO ?? null, accionFutCruda: f.ACCION_FUT ?? null,
        descripcionEstado: f["DESCRIPCION ESTADO"] ?? null, intCompraCruda: f.INT_COMPRA ?? null,
        provProspCruda: f.PROV_PROSP ?? null, codMkt: f.COD_MKT ?? null, nroPpto: f.Nro_PPTO ?? null,
        monto: f.MONTO ?? null, equipo: f.EQUIPO ?? f.EQUIPOS ?? null, hoja,
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

function traducir(r) {
  const claveEstado = String(r.estadoCrudo ?? "").toUpperCase().replace(/\s+/g, "");
  const mapa = MAPA_ESTADO[claveEstado];
  if (!mapa || mapa.descartar) return { sinMapa: !mapa, item: null, estadoCrudo: r.estadoCrudo, razon: r.razon };
  if (mapa.saltar) return { yaEsVenta: true, item: null };

  return {
    item: {
      comercial: r.comercial, razon: r.razon, doc: r.doc, tipoDoc: r.tipoDoc,
      telefono: normalizarTelefono(r.telCel) ?? normalizarTelefono(r.telFijo),
      telCel: r.telCel, telFijo: r.telFijo, email: normalizarEmail(r.email),
      contacto: r.contacto ? String(r.contacto).trim().replace(/,$/, "") : null,
      cargo: r.cargo, rubroId: rubroDe(r.rubro),
      departamento: r.departamento ? String(r.departamento).trim() : null,
      provincia: r.provincia ? String(r.provincia).trim() : null,
      distrito: r.distrito ? String(r.distrito).trim() : null,
      direccion: r.direccion ? String(r.direccion).trim() : null,
      etapa: mapa.etapa, motivoRechazoId: mapa.motivoRechazoId ?? null,
      pendienteGerencia: Boolean(mapa.pendienteGerencia), actividadTipo: mapa.actividad ?? null,
      dudoso: Boolean(mapa.dudoso), intencion: intencionDe(r.intCompraCruda),
      proximaAccion: accionDe(r.accionFutCruda), proximaAccionAt: excelFechaAISO(r.fAccion),
      procedencia: r.provProspCruda ? String(r.provProspCruda).trim().toUpperCase() : null,
      codigoCentral: codigoCentral(r.codMkt), fechaEstado: excelFechaAISO(r.fEstado),
      nota: r.descripcionEstado ? String(r.descripcionEstado).trim() : null,
      estadoOriginal: r.estadoCrudo, accionFutOriginal: r.accionFutCruda,
      nroPpto: r.nroPpto ? String(r.nroPpto).trim() : null, montoRef: parseMonto(r.monto),
      equipoRef: r.equipo ? String(r.equipo).trim() : null, hoja: r.hoja,
    },
  };
}

const nuevos = [];
let sinMapa = 0, yaVenta = 0, basura = 0;
for (const r of [...porDoc.values(), ...porComercialNombre.values()]) {
  const t = traducir(r);
  if (t.sinMapa) { sinMapa++; continue; }
  if (t.yaEsVenta) { yaVenta++; continue; }
  if (!t.item) { basura++; continue; }
  nuevos.push(t.item);
}

console.log(`Registros vigentes en los 3 Excel nuevos: ${nuevos.length}`);
console.log(`  (sin mapeo de estado: ${sinMapa} · ya en venta, se ignoran igual que en el import original: ${yaVenta})`);

// ── Baseline: mismo criterio de identidad, restringido a C4/C5/C8 ─────────
const baseDoc = new Map();
const baseNombre = new Map();
for (const b of baseline) {
  if (!["C4", "C5", "C8"].includes(b.comercial)) continue;
  if (b.doc) baseDoc.set(b.doc, b);
  else baseNombre.set(b.comercial + "|" + normalizarRazonSocial(b.razon), b);
}
console.log(`Baseline (2026-08-15) para C4/C5/C8: ${baseDoc.size + baseNombre.size}`);

// ── Comparación ─────────────────────────────────────────────────────────
const CAMPOS_COMPARADOS = ["etapa", "intencion", "proximaAccion", "proximaAccionAt", "nota", "nroPpto", "montoRef", "equipoRef", "procedencia"];

const nuevosClientes = [];
const conCambios = [];
const sinCambios = [];
const vistos = new Set();

for (const item of nuevos) {
  const clave = item.doc ? "D" + item.doc : "N" + item.comercial + "|" + normalizarRazonSocial(item.razon);
  vistos.add(clave);
  const previo = item.doc ? baseDoc.get(item.doc) : baseNombre.get(item.comercial + "|" + normalizarRazonSocial(item.razon));

  if (!previo) {
    nuevosClientes.push(item);
    continue;
  }

  const diffs = {};
  for (const campo of CAMPOS_COMPARADOS) {
    const a = previo[campo] ?? null;
    const b = item[campo] ?? null;
    if (String(a ?? "") !== String(b ?? "")) diffs[campo] = { antes: a, ahora: b };
  }

  if (Object.keys(diffs).length === 0) {
    sinCambios.push(item);
  } else {
    conCambios.push({ clave, comercial: item.comercial, razon: item.razon, doc: item.doc, diffs, item, previo });
  }
}

// Clientes que estaban en el baseline pero no aparecen en el Excel nuevo —
// por regla de negocio NO se tocan (ver docs/03-reglas-negocio.md), solo se
// cuentan para que quede visible que no se pierden ni se borran.
let desaparecidos = 0;
for (const b of [...baseDoc.values(), ...baseNombre.values()]) {
  const clave = b.doc ? "D" + b.doc : "N" + b.comercial + "|" + normalizarRazonSocial(b.razon);
  if (!vistos.has(clave)) desaparecidos++;
}

// ── Reporte ─────────────────────────────────────────────────────────────
console.log(`\n=== RESULTADO DEL CONTRASTE ===`);
console.log(`Clientes nuevos (no estaban en el baseline): ${nuevosClientes.length}`);
console.log(`Clientes con cambios: ${conCambios.length}`);
console.log(`Sin cambios: ${sinCambios.length}`);
console.log(`En baseline pero ausentes del Excel nuevo (no se tocan): ${desaparecidos}`);

const porTipoDeCambio = new Map();
for (const c of conCambios) {
  for (const campo of Object.keys(c.diffs)) {
    porTipoDeCambio.set(campo, (porTipoDeCambio.get(campo) ?? 0) + 1);
  }
}
console.log(`\nCambios por campo:`);
console.table([...porTipoDeCambio].sort((a, b) => b[1] - a[1]).map(([campo, n]) => ({ campo, clientes: n })));

const porComercialNuevos = new Map(), porComercialCambios = new Map();
for (const n of nuevosClientes) porComercialNuevos.set(n.comercial, (porComercialNuevos.get(n.comercial) ?? 0) + 1);
for (const c of conCambios) porComercialCambios.set(c.comercial, (porComercialCambios.get(c.comercial) ?? 0) + 1);
console.log(`\nNuevos por comercial:`, Object.fromEntries(porComercialNuevos));
console.log(`Cambios por comercial:`, Object.fromEntries(porComercialCambios));

console.log(`\nMuestra de 5 cambios de etapa:`);
console.log(
  conCambios
    .filter((c) => c.diffs.etapa)
    .slice(0, 5)
    .map((c) => ({ razon: c.razon, antes: c.diffs.etapa.antes, ahora: c.diffs.etapa.ahora })),
);

writeFileSync(
  SALIDA_JSON,
  JSON.stringify({ generadoDe: ARCHIVOS.map((a) => a.ruta), nuevosClientes, conCambios, desaparecidos }, null, 1),
);
console.log(`\nEscrito en ${SALIDA_JSON} (para revisar antes de decidir cómo aplicarlo)`);
