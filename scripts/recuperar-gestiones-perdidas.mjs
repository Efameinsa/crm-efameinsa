// Recupera el historial de seguimiento que el import perdió.
//
// EL PROBLEMA. C4 reportó el 24-08 que la información de dos prospectos «no se
// encuentra en la plataforma». Sí estaban, pero con UNA sola gestión cuando su
// Excel tenía siete. La causa está en extraer-oportunidades-historicas.mjs:
//
//   if (!prev || fEstado >= prev.fEstado) porDoc.set(doc, registro);
//
// Se quedaba con la ÚLTIMA fila por clave y descartaba las demás. Y como las
// comerciales escriben el RUC solo en la primera fila del cliente y lo dejan
// vacío en los seguimientos, cada cliente generaba DOS claves —una por
// documento y otra por nombre— así que sobrevivían dos gestiones: la última con
// RUC y la última sin él. Todo lo del medio se perdió.
//
// Medido: 14.583 gestiones perdidas en 1.648 clientes. El peor caso tenía 180
// gestiones en el Excel y 8 en el CRM.
//
// QUÉ HACE ESTE SCRIPT. Lee los Excel actualizados que entregaron las
// comerciales, arma la lista completa de gestiones por cliente y crea en el CRM
// las que faltan. Es ADITIVO: no borra ni modifica nada de lo que ya está.
//
// Las cuentas partidas en dos (misma persona con y sin documento) NO se fusionan
// acá: eso cambia la identidad de un cliente y se decide aparte. Las gestiones
// se cargan sobre la cuenta que tenga documento, que es la que sobrevive a una
// fusión futura.
//
// Uso:
//   node --env-file=.env.local scripts/recuperar-gestiones-perdidas.mjs            (diagnóstico)
//   node --env-file=.env.local scripts/recuperar-gestiones-perdidas.mjs --aplicar
//   ... --comercial=C4     para hacer una cartera a la vez
//   ... --cliente="GARCIA CASTILLA DIANA EDITH"   para probar con uno solo

import XLSX from "xlsx";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const DIR = "C:/Users/diseno/Downloads/ACTUALIZADOS";
const APLICAR = process.argv.includes("--aplicar");
const SOLO_COMERCIAL = process.argv.find((a) => a.startsWith("--comercial="))?.split("=")[1] ?? null;
const SOLO_CLIENTE = process.argv.find((a) => a.startsWith("--cliente="))?.split("=")[1]?.toUpperCase() ?? null;

// El Excel de Brenda dice COMERCIAL8, pero su código activo es C1 (C8 quedó
// como codigo_anterior tras la fusión de carteras del 22-08).
const MAPA_COMERCIAL = { 4: "C4", 5: "C5", 8: "C1" };

/** Serial de Excel → "YYYY-MM-DD". El 0 es 30-12-1899. */
function fechaExcel(n) {
  const v = Number(n);
  if (!v || v < 1) return null;
  return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
}

/** Para comparar el texto de una gestión contra la que ya está en el CRM. */
function normalizar(t) {
  return String(t ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9áéíóúñ ]/gi, "")
    .trim()
    .slice(0, 120);
}

// El ESTADO del Excel insinúa qué se hizo; sin esto todo entraría como "nota"
// y el reporte por tipo de gestión quedaría plano.
function tipoDesdeEstado(estado) {
  const e = String(estado ?? "").toUpperCase();
  if (e.includes("REU_ONLINE")) return "otro";
  if (e.includes("REU_SHOWROOM")) return "showroom";
  if (e.includes("VISITA")) return "visita";
  if (e.startsWith("P1_F")) return "filtro";
  return "nota";
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// ── 1. Todas las gestiones del Excel, agrupadas por cliente ─────────────────
const porCliente = new Map(); // "C4|NOMBRE" → [{fecha, texto, estado, hoja}]
for (const archivo of readdirSync(DIR).filter((x) => /\.xlsx?$/i.test(x))) {
  const cod = MAPA_COMERCIAL[Number(/COMERCIAL\s*(\d+)/i.exec(archivo)?.[1])] ?? null;
  if (!cod || (SOLO_COMERCIAL && cod !== SOLO_COMERCIAL)) continue;
  const wb = XLSX.readFile(join(DIR, archivo));
  for (const hoja of ["PROSP.", "COTIZ."]) {
    if (!wb.SheetNames.includes(hoja)) continue;
    for (const f of XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null })) {
      const razon = String(f["NOMBRE_RAZON SOCIAL"] ?? "").trim().toUpperCase();
      const texto = String(f["DESCRIPCION ESTADO"] ?? "").trim();
      const fecha = fechaExcel(f.F_ESTADO);
      if (!razon || !texto || !fecha) continue;
      if (SOLO_CLIENTE && razon !== SOLO_CLIENTE) continue;
      const clave = `${cod}|${razon}`;
      if (!porCliente.has(clave)) porCliente.set(clave, []);
      porCliente.get(clave).push({ fecha, texto, estado: f.ESTADO ?? null, hoja });
    }
  }
}
console.log(`Excel: ${porCliente.size} cliente(s) con gestiones escritas`);

// ── 2. Qué hay en el CRM ────────────────────────────────────────────────────
const { rows: cuentas } = await bd.query(`
  select c.id, upper(btrim(c.razon_social)) nombre, c.tipo_doc, p.codigo_comercial cod, p.id comercial_id
  from cuentas c join perfiles p on p.id = c.comercial_id
  where p.codigo_comercial in ('C1','C4','C5')`);

// Por cliente puede haber más de una cuenta (la partida en dos). Se elige la
// que tiene documento: es la que sobrevive si algún día se fusionan.
const cuentaDe = new Map();
for (const c of cuentas) {
  const k = `${c.cod}|${c.nombre}`;
  const actual = cuentaDe.get(k);
  if (!actual || (actual.tipo_doc === "SIN_DOC" && c.tipo_doc !== "SIN_DOC")) cuentaDe.set(k, c);
}

// Las oportunidades y actividades que ya existen, por cliente.
const { rows: acts } = await bd.query(`
  select upper(btrim(c.razon_social)) nombre, p.codigo_comercial cod,
         to_char(a.realizada_at at time zone 'America/Lima', 'YYYY-MM-DD') fecha, a.nota
  from actividades a
  join oportunidades o on o.id = a.oportunidad_id
  join cuentas c on c.id = o.cuenta_id
  join perfiles p on p.id = c.comercial_id
  where p.codigo_comercial in ('C1','C4','C5')`);
const yaEsta = new Map(); // "cod|nombre" → Set de "fecha|textoNormalizado"
for (const a of acts) {
  const k = `${a.cod}|${a.nombre}`;
  if (!yaEsta.has(k)) yaEsta.set(k, new Set());
  // La nota guardada trae un prefijo "[Histórico …]" o "[Actualización …]".
  const limpio = String(a.nota ?? "").replace(/^\[[^\]]*\]\s*/, "");
  // La fecha viene ya como texto desde Postgres: pg convierte las columnas
  // `date` a objeto Date de JS, y String(Date) da "Wed Aug 19" — la huella
  // nunca calzaba y todo parecía faltar.
  yaEsta.get(k).add(`${a.fecha}|${normalizar(limpio)}`);
}

// ── 3. Diferencia ───────────────────────────────────────────────────────────
const aInsertar = [];
let sinCuenta = 0;
for (const [clave, gestiones] of porCliente) {
  const cuenta = cuentaDe.get(clave);
  if (!cuenta) { sinCuenta++; continue; }
  const existentes = yaEsta.get(clave) ?? new Set();
  const vistas = new Set();
  for (const g of gestiones) {
    const huella = `${g.fecha}|${normalizar(g.texto)}`;
    // El mismo texto puede repetirse en PROSP. y COTIZ.: se carga una vez.
    if (existentes.has(huella) || vistas.has(huella)) continue;
    vistas.add(huella);
    aInsertar.push({ cuentaId: cuenta.id, comercialId: cuenta.comercial_id, clave, ...g });
  }
}

console.log(`Clientes del Excel sin cuenta en el CRM: ${sinCuenta}`);
console.log(`\nGESTIONES A RECUPERAR: ${aInsertar.length}`);
const porCod = {};
for (const x of aInsertar) porCod[x.clave.split("|")[0]] = (porCod[x.clave.split("|")[0]] ?? 0) + 1;
console.log("  por cartera:", Object.entries(porCod).map(([k, v]) => `${k}=${v}`).join(" · "));

if (aInsertar.length) {
  console.log("\n  ejemplos:");
  for (const x of aInsertar.slice(0, 5)) {
    console.log(`   ${x.fecha} · ${x.clave.slice(0, 44)} · ${x.texto.slice(0, 58)}`);
  }
}

if (!APLICAR) {
  console.log("\n(Dry-run: no se insertó nada. Correr con --aplicar.)");
  await bd.end();
  process.exit(0);
}

// ── 4. Insertar ─────────────────────────────────────────────────────────────
// Cada cliente necesita una oportunidad a la que colgar la gestión. Se usa la
// que ya tiene; si tuviera varias, la más reciente, que es donde el comercial
// está trabajando.
const oportunidadDe = new Map();
const { rows: ops } = await bd.query(`
  select distinct on (cuenta_id) cuenta_id, id
  from oportunidades where cuenta_id = any($1::uuid[])
  order by cuenta_id, updated_at desc`, [[...new Set(aInsertar.map((x) => x.cuentaId))]]);
for (const o of ops) oportunidadDe.set(o.cuenta_id, o.id);

await bd.query("begin");
let insertadas = 0, sinOportunidad = 0;
try {
  // Por lotes y no fila por fila: son más de diez mil, y el equipo está
  // trabajando en esta misma base — cuanto menos tiempo tomada la tabla, mejor.
  const LOTE = 500;
  const listos = aInsertar.filter((x) => {
    if (oportunidadDe.has(x.cuentaId)) return true;
    sinOportunidad++;
    return false;
  });

  for (let i = 0; i < listos.length; i += LOTE) {
    const trozo = listos.slice(i, i + LOTE);
    const valores = [];
    const marcas = trozo.map((x, j) => {
      const b = j * 5;
      valores.push(
        oportunidadDe.get(x.cuentaId),
        tipoDesdeEstado(x.estado),
        `[Histórico ${x.hoja}, estado ${x.estado ?? "(vacío)"}] ${x.texto}`,
        x.comercialId,
        x.fecha,
      );
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::date + time '12:00')`;
    });
    await bd.query(
      `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at) values ${marcas.join(",")}`,
      valores,
    );
    insertadas += trozo.length;
    if (i % 2500 === 0) console.log(`  … ${insertadas}/${listos.length}`);
  }
  await bd.query("commit");
  console.log(
    `\n✓ ${insertadas} gestión(es) recuperada(s).` +
      (sinOportunidad ? ` ${sinOportunidad} sin oportunidad donde colgarlas.` : ""),
  );
} catch (e) {
  await bd.query("rollback");
  console.error("\n✗ Rollback:", e.message);
  process.exitCode = 1;
}

await bd.end();
