// Migración histórica de TODOS los comerciales, desde R:\COPIA CRM Cx PARA
// MARKETING\*.xlsx (23 archivos, 2018-2026, ~16 mil prospectos).
//
// ALCANCE DELIBERADO DE ESTA PASADA: solo cuentas + contactos + historial
// narrativo (columna DESCRIPCION ESTADO → cuentas.notas). NO crea
// oportunidades/actividades/ventas todavía — la columna ESTADO usa un código
// interno (ej. "C1_PTO_Conf", "P1_F_Realiz_Y_Cotizado") cuyo significado
// exacto Darwin confirmó solo parcialmente (17-08-2026): "PTO_Conf" significa
// "por confirmar" — NO es una venta cerrada, es un pedido pendiente de
// confirmación. El resto de la taxonomía (P1_F_*, C1-C3, etc.) sigue sin
// confirmar, y el campo MONTO solo está lleno en 22 de 16225 filas — no hay
// forma confiable de derivar ventas históricas todavía. Se deja para una
// segunda pasada una vez que gerencia confirme la tabla de equivalencias
// completa de ESTADO → etapa_oportunidad.
//
// ESTRUCTURA DE COLUMNAS: se mapea por POSICIÓN, no por nombre de encabezado.
// Se comprobó que 3 de los 23 archivos usan encabezados distintos para la
// misma columna (columna 0: "ITEM" en la mayoría, "N°" en uno, en blanco en
// otro) — filtrar por nombre de columna los habría descartado en silencio.
// El orden de las 30 columnas es idéntico en los 23 archivos, verificado a mano.
//
// Uso:
//   node --env-file=.env.local scripts/importar-historico-comerciales.mjs --raiz "R:\" [--aplicar]
//
// Sin --aplicar: solo imprime estadísticas y conflictos, no escribe nada.

import { Client } from "pg";
import XLSX from "xlsx";
import { readdirSync, statSync } from "fs";
import { join } from "path";

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}

const RAIZ = leerArgumento("raiz");
const APLICAR = process.argv.includes("--aplicar");

if (!RAIZ) {
  console.error('Uso: node --env-file=.env.local scripts/importar-historico-comerciales.mjs --raiz "R:\\" [--aplicar]');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

const COL = {
  item: 0, bdProsp: 1, provProsp: 2, rubro: 3, depart: 4, razonSocial: 5,
  dniRuc: 6, codMkt: 7, fInscrip: 8, direcc: 9, pais: 10, provin: 11,
  distr: 12, contacto: 13, cargo: 14, tFijo: 15, tCel: 16, email: 17,
  fCompra: 18, fEstado: 19, descripcionEstado: 20, estado: 21,
  accionFut: 22, fAccion: 23, intCompra: 24, nroPpto: 25, monto: 26,
  equipo: 27, eqInd: 28, eFinal: 29,
};

// Nombres de encabezado esperados por columna, para detectar si algún archivo
// tiene el orden de columnas distinto al verificado (no solo el texto).
const ENCABEZADOS_ESPERADOS = {
  3: /rubro/i, 5: /nombre|razon/i, 6: /dni|ruc/i, 9: /direc/i,
  17: /email|correo/i, 20: /descripcion.*estado/i, 26: /monto/i, 27: /equipo/i,
};

function soloDigitos(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function inferirTipoDoc(digitos) {
  if (digitos.length === 11) return "RUC";
  if (digitos.length === 8) return "DNI";
  return "SIN_DOC";
}
function excelFechaAISO(serial) {
  if (typeof serial !== "number" || serial <= 0) return null;
  // Excel: dia 1 = 1900-01-01, con el bug del año bisiesto 1900 que XLSX ya
  // corrige en sheet_to_json con cellDates, pero acá leemos crudo con header:1.
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function limpio(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}
function telefono(v) {
  const s = limpio(v);
  if (!s) return null;
  return s.replace(/\r?\n/g, " ").trim();
}

function listarXlsx(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (/^~\$/.test(entry)) continue; // temporales de Word/Excel abiertos
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...listarXlsx(p));
    else if (/\.xlsx$/i.test(entry)) out.push(p);
  }
  return out;
}

function comercialDeCarpeta(ruta) {
  const m = ruta.match(/COPIA CRM (C\d+)/i);
  return m ? m[1].toUpperCase() : null;
}

function leerArchivo(ruta) {
  const wb = XLSX.readFile(ruta);
  const nombreHoja = wb.SheetNames.find((n) => /prosp/i.test(n));
  if (!nombreHoja) return { filas: [], advertencias: [`sin hoja PROSP.: ${ruta}`] };
  const hoja = wb.Sheets[nombreHoja];
  const filasCrudas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, range: 0 });

  const advertencias = [];
  const encabezado = filasCrudas[0] ?? [];
  for (const [idx, patron] of Object.entries(ENCABEZADOS_ESPERADOS)) {
    const texto = String(encabezado[idx] ?? "");
    if (!patron.test(texto)) {
      advertencias.push(`columna ${idx} esperaba /${patron.source}/ pero encabezado dice "${texto}" en ${ruta}`);
    }
  }

  const filas = [];
  for (let i = 1; i < filasCrudas.length; i++) {
    const f = filasCrudas[i];
    if (!f || typeof f[COL.item] !== "number") continue; // solo filas cabecera de prospecto
    const digitos = soloDigitos(f[COL.dniRuc]);
    const tipoDoc = inferirTipoDoc(digitos);
    filas.push({
      archivo: ruta,
      tipoDoc,
      numDoc: tipoDoc === "SIN_DOC" ? null : digitos,
      razonSocial: limpio(f[COL.razonSocial]),
      rubroTexto: limpio(f[COL.rubro]),
      departamento: limpio(f[COL.depart]),
      provincia: limpio(f[COL.provin]),
      distrito: limpio(f[COL.distr]),
      direccion: limpio(f[COL.direcc]),
      contacto: limpio(f[COL.contacto]),
      cargo: limpio(f[COL.cargo]),
      telFijo: telefono(f[COL.tFijo]),
      telCel: telefono(f[COL.tCel]),
      email: limpio(f[COL.email]),
      fInscrip: excelFechaAISO(f[COL.fInscrip]),
      fEstado: excelFechaAISO(f[COL.fEstado]),
      descripcionEstado: limpio(f[COL.descripcionEstado]),
      estado: limpio(f[COL.estado]),
      monto: typeof f[COL.monto] === "number" && f[COL.monto] > 0 ? f[COL.monto] : null,
      equipo: limpio(f[COL.equipo]),
      nroPpto: limpio(f[COL.nroPpto]),
    });
  }
  return { filas, advertencias };
}

async function main() {
  const archivos = listarXlsx(RAIZ);
  console.log(`Archivos .xlsx encontrados: ${archivos.length}\n`);

  const todasLasFilas = [];
  const advertenciasGlobales = [];
  for (const archivo of archivos) {
    const comercial = comercialDeCarpeta(archivo);
    if (!comercial) {
      advertenciasGlobales.push(`no se pudo determinar el comercial de la ruta: ${archivo}`);
      continue;
    }
    const { filas, advertencias } = leerArchivo(archivo);
    advertenciasGlobales.push(...advertencias);
    for (const f of filas) f.comercialCarpeta = comercial;
    todasLasFilas.push(...filas);
    console.log(`  ${comercial.padEnd(4)} ${filas.length.toString().padStart(5)} filas  ${archivo}`);
  }

  console.log(`\nTotal filas cabecera de prospecto: ${todasLasFilas.length}`);
  if (advertenciasGlobales.length) {
    console.log(`\n⚠️  ${advertenciasGlobales.length} advertencias de estructura:`);
    for (const a of advertenciasGlobales) console.log(`  - ${a}`);
  }

  // --- Dedup por documento: se queda la fila con F_ESTADO (o F_INSCRIP) más
  // reciente como version autoritativa de esa cuenta. Se registra cualquier
  // caso donde el "ganador" pertenece a un comercial distinto de alguno de
  // los "perdedores", para revisión de gerencia.
  const porDoc = new Map();
  const conflictosComercial = [];
  for (const f of todasLasFilas) {
    if (!f.numDoc) continue;
    const fechaF = f.fEstado ?? f.fInscrip ?? "0000-00-00";
    const actual = porDoc.get(f.numDoc);
    if (!actual) {
      porDoc.set(f.numDoc, f);
      continue;
    }
    const fechaActual = actual.fEstado ?? actual.fInscrip ?? "0000-00-00";
    if (actual.comercialCarpeta !== f.comercialCarpeta) {
      conflictosComercial.push({
        numDoc: f.numDoc,
        razonSocial: f.razonSocial ?? actual.razonSocial,
        comerciales: [...new Set([actual.comercialCarpeta, f.comercialCarpeta])],
      });
    }
    if (fechaF > fechaActual) porDoc.set(f.numDoc, f);
  }

  const sinDoc = todasLasFilas.filter((f) => !f.numDoc);

  console.log(`\nCuentas únicas con documento válido (RUC/DNI): ${porDoc.size}`);
  console.log(`Filas sin documento válido (se importan igual, sin dedup por doc): ${sinDoc.length}`);
  console.log(`\nCasos donde el mismo RUC/DNI aparece bajo más de un comercial: ${conflictosComercial.length}`);
  if (conflictosComercial.length) {
    console.log("(se queda con el comercial de la fecha de contacto más reciente; primeros 15 casos)");
    for (const c of conflictosComercial.slice(0, 15)) {
      console.log(`  - ${c.numDoc} · ${c.razonSocial} · aparece en: ${c.comerciales.join(", ")}`);
    }
  }

  const conNotas = [...porDoc.values(), ...sinDoc].filter((f) => f.descripcionEstado);
  const conMonto = todasLasFilas.filter((f) => f.monto);
  const estadosPorConfirmar = todasLasFilas.filter((f) => /PTO_Conf/i.test(f.estado ?? ""));

  console.log(`\nFilas con historial narrativo (columna DESCRIPCION ESTADO, va a cuentas.notas): ${conNotas.length}`);
  console.log(`Filas con MONTO explícito (posibles ventas, NO se importan en esta pasada): ${conMonto.length}`);
  console.log(`Filas con estado "..._PTO_Conf" = "por confirmar" (pedido pendiente, NO es venta cerrada): ${estadosPorConfirmar.length}`);

  console.log(`\n${APLICAR ? "=== ESCRIBIENDO EN LA BASE ===" : "=== SIMULACIÓN (sin --aplicar, no se escribe nada) ==="}`);
  if (!APLICAR) {
    console.log("\nCorre de nuevo con --aplicar para escribir cuentas + contactos + notas.");
    console.log("NO se crean oportunidades/actividades/ventas en esta pasada (ver comentario al inicio del script).");
    return;
  }

  const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await cliente.connect();

  try {
    const { rows: comercialesDb } = await cliente.query(
      "select id, codigo_comercial from perfiles where rol = 'comercial'",
    );
    const idPorComercial = new Map(comercialesDb.map((c) => [c.codigo_comercial, c.id]));

    const { rows: rubrosDb } = await cliente.query("select id, nombre from catalogo_rubros");

    function matchRubro(texto) {
      if (!texto) return null;
      const t = texto.toLowerCase();
      const match = rubrosDb.find((r) => t.includes(r.nombre.toLowerCase()) || r.nombre.toLowerCase().includes(t));
      return match ? match.id : null;
    }

    let insertadas = 0, saltadasPorConflicto = 0, saltadasSinComercial = 0;

    async function insertarCuenta(f) {
      const comercialId = idPorComercial.get(f.comercialCarpeta);
      if (!comercialId) {
        saltadasSinComercial++;
        return;
      }
      const notas = f.descripcionEstado
        ? `[Histórico ${f.comercialCarpeta}${f.fEstado ? ", " + f.fEstado : ""}] ${f.descripcionEstado}`
        : null;

      const { rows, rowCount } = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, rubro_id, departamento, provincia, distrito, direccion, comercial_id, cartera_desde, notas)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         on conflict (num_doc) where num_doc is not null and tipo_doc <> 'SIN_DOC' do nothing
         returning id`,
        [f.tipoDoc, f.numDoc, f.razonSocial || "(sin razón social)", matchRubro(f.rubroTexto),
         f.departamento, f.provincia, f.distrito, f.direccion, comercialId,
         f.fInscrip, notas],
      );
      if (rowCount === 0) { saltadasPorConflicto++; return null; }
      insertadas++;
      return rows[0].id; // RETURNING evita una consulta extra de ida y vuelta
    }

    async function insertarCuentaSinDoc(f) {
      const comercialId = idPorComercial.get(f.comercialCarpeta);
      if (!comercialId) { saltadasSinComercial++; return null; }
      const notas = f.descripcionEstado
        ? `[Histórico ${f.comercialCarpeta}${f.fEstado ? ", " + f.fEstado : ""}] ${f.descripcionEstado}`
        : null;
      const { rows } = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, rubro_id, departamento, provincia, distrito, direccion, comercial_id, cartera_desde, notas)
         values ('SIN_DOC', null, $1,$2,$3,$4,$5,$6,$7,$8,$9)
         returning id`,
        [f.razonSocial || "(sin razón social)", matchRubro(f.rubroTexto),
         f.departamento, f.provincia, f.distrito, f.direccion, comercialId, f.fInscrip, notas],
      );
      insertadas++;
      return rows[0].id;
    }

    async function insertarContacto(cuentaId, f) {
      if (!cuentaId) return;
      const nombre = f.contacto || f.razonSocial || "(sin nombre)";
      const tel = f.telCel || f.telFijo;
      if (!f.contacto && !tel && !f.email) return; // nada que agregar
      await cliente.query(
        `insert into contactos (cuenta_id, nombre, cargo, telefono, email, es_principal)
         values ($1,$2,$3,$4,$5,true)`,
        [cuentaId, nombre, f.cargo, tel, f.email],
      );
    }

    let i = 0;
    const total = porDoc.size + sinDoc.length;
    for (const f of porDoc.values()) {
      const id = await insertarCuenta(f);
      if (id) await insertarContacto(id, f);
      i++;
      if (i % 1000 === 0) console.log(`  ${i}/${total}...`);
    }
    for (const f of sinDoc) {
      const id = await insertarCuentaSinDoc(f);
      if (id) await insertarContacto(id, f);
      i++;
      if (i % 1000 === 0) console.log(`  ${i}/${total}...`);
    }

    console.log(`\nInsertadas: ${insertadas}`);
    console.log(`Saltadas por ya existir (mismo RUC/DNI): ${saltadasPorConflicto}`);
    console.log(`Saltadas por falta de perfil de comercial en la base: ${saltadasSinComercial}`);
  } finally {
    await cliente.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
