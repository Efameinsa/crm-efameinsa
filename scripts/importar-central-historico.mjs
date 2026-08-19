// Importa el maestro de Central (U:\SEGUIMIENTO DE PROSPECTOS-<año>.xls,
// hoja "Seguimiento", 2019-2026) como leads históricos del CRM. Es el
// registro de TODO contacto entrante de la empresa: quién llegó, por qué
// vía, cuándo se recibió, cuándo y a quién se asignó, y (a veces) el Nº de
// cotización que generó — la materia prima de tiempos de atención,
// continuidad de cartera y atribución.
//
// Decisiones:
//  - estado = 'historico' (migración 0016): ya fueron gestionados; no
//    ensucian la bandeja de Central (que filtra pendiente_triaje).
//  - canal = mapeo de VIA (cómo llegó la conversación). El ORIGEN de
//    Central NO se usa como fuente de marketing (verificado 2026-08-18:
//    dice "O_PagWeb" en el 99 % de los casos, es el valor por defecto);
//    se conserva crudo en `mensaje` junto con estado y Nº de cotización.
//  - codigo = el PRO#### de Central cuando existe (formato distinto al
//    'PRO-00123' del CRM actual: no colisiona con la serie nueva).
//  - dedup: (1) dentro de la corrida por codigo PRO; (2) contra la base:
//    se salta la fila si ya existe un lead con el mismo codigo, o con el
//    mismo teléfono el mismo día (los 226 leads de Google que Central
//    también registró ya viven en el CRM con su gclid — mejor identidad).
//  - cuenta_id: cruce por teléfono normalizado SOLO si calza una única
//    cuenta (mismo criterio estricto de siempre).
//  - asignado_a: por N° DE COMERCIAL cuando hay perfil (C1..C10); el
//    nombre de "ASIGNADO A:" queda en mensaje si no hay perfil.
//
// Uso:
//   node --env-file=.env.local scripts/importar-central-historico.mjs [--solo 2019] [--aplicar]

import XLSX from "xlsx";
import { readdirSync } from "fs";
import { Client } from "pg";

const APLICAR = process.argv.includes("--aplicar");
const iSolo = process.argv.indexOf("--solo");
const SOLO = iSolo !== -1 ? process.argv[iSolo + 1] : null;

const norm = (t) => {
  if (!t) return null;
  const d = String(t).replace(/\D/g, "");
  return d.length > 9 && d.startsWith("51") ? d.slice(2) : d || null;
};
const limpio = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
};
const excelFecha = (serial) => {
  if (typeof serial !== "number" || serial <= 0) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
// "10:13 am" / "2:22 pm " → "10:13" / "14:22"; serial excel (fracción) también.
function hora(v) {
  if (v == null) return null;
  if (typeof v === "number" && v > 0 && v < 1) {
    const min = Math.round(v * 24 * 60);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = String(v).trim().toLowerCase().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[3]?.startsWith("p") && h < 12) h += 12;
  if (m[3]?.startsWith("a") && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}
const codigoPro = (s) => {
  const m = String(s ?? "").toUpperCase().replace(/O(?=\d)/g, "0").match(/PR?0?O?\s*-?\s*(\d{2,6})/);
  return m ? "PRO" + String(parseInt(m[1], 10)) : null;
};

const CANAL = [
  [/WHAT|WSP|WA\b/, "whatsapp"],
  [/LLAMADA|TELEF|CELULAR|LLAMO/, "llamada"],
  [/CORREO|MAIL/, "email"],
  [/WEB|FORMULARIO|PAGINA/, "formulario_web"],
  [/FACE|FB/, "facebook"],
  [/INSTA/, "instagram"],
  [/PRESENCIAL|TIENDA|VISITA|OFICINA/, "presencial"],
  [/REFER/, "referido"],
];
const canalDeVia = (via) => CANAL.find(([re]) => re.test(String(via ?? "").toUpperCase()))?.[1] ?? "otro";
const AREA = [
  [/COTIZ|COMERC|VENTA/, "comercial"],
  [/SERV|TECNIC|MANTEN|REPUESTO|GARANT/, "servicio_tecnico"],
  [/POST/, "postventa"],
  [/RRHH|RECURSOS|TRABAJO|PRACTIC|CV|CURRIC/, "rrhh"],
  [/PROVEED/, "proveedores"],
  [/ADMIN|COBRO|FACTUR|TESOR|PAGO|CONTAB/, "administracion"],
];
const areaDe = (a) => AREA.find(([re]) => re.test(String(a ?? "").toUpperCase()))?.[1] ?? "otros";

function leerArchivo(ruta) {
  const wb = XLSX.readFile(ruta);
  const hoja = wb.Sheets["Seguimiento"];
  if (!hoja) return { filas: [], err: "sin hoja Seguimiento" };
  const rows = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null });
  const hIdx = rows.findIndex((r) => r && r.some((c) => String(c ?? "").toUpperCase().startsWith("VIA")) && r.some((c) => String(c ?? "").toUpperCase().startsWith("TELÉFONO") || String(c ?? "").toUpperCase().startsWith("TELEFONO")));
  if (hIdx === -1) return { filas: [], err: "no se encontró fila de encabezado" };
  const H = rows[hIdx].map((c) => String(c ?? "").trim().toUpperCase());
  const col = (...nombres) => H.findIndex((h) => nombres.some((n) => h.startsWith(n)));
  const iVia = col("VIA");
  const C = {
    codigo: col("CODIGO", "COD-MKT") !== -1 ? col("CODIGO", "COD-MKT") : Math.max(0, iVia - 1),
    via: iVia, origen: col("ORIGEN"), area: col("AREA"),
    nombre: col("APELLIDOS", "NOMBRE"), empresa: col("EMPRESA"),
    depto: col("DEPARTAMENTO"), correo: col("CORREO"), tel: col("TELÉFONO", "TELEFONO"),
    fRec: col("FECHA/RECEP"), hRec: col("HORA/RECEP"), fAsig: col("FECHA/ASIG"), hAsig: col("HORA/ASIG"),
    asignadoA: col("ASIGNADO A"), dni: col("DNI"), nCom: col("N° DE COMERCIAL", "N° DE COMERCIAL", "N° DE COMERCIAL", "N° DE COMERCIAL"),
    estado: col("ESTADO"), nCot: col("Nº COTIZACION", "N° COTIZACION"), obs: col("OBSERVACIONES"),
  };
  const anioArchivo = Number((ruta.match(/(\d{4})/) ?? [])[1]) || null;
  const filas = [];
  for (const r of rows.slice(hIdx + 1)) {
    if (!r) continue;
    const nombre = limpio(r[C.nombre]), empresa = limpio(r[C.empresa]), tel = limpio(r[C.tel]);
    if (!nombre && !empresa && !tel) continue;
    filas.push({
      codigo: codigoPro(r[C.codigo]),
      via: limpio(r[C.via]), origen: limpio(r[C.origen]), area: limpio(r[C.area]),
      nombre, empresa, depto: limpio(r[C.depto]),
      correo: limpio(r[C.correo]), telefono: tel,
      fRec: excelFecha(r[C.fRec]), hRec: hora(r[C.hRec]),
      fAsig: excelFecha(r[C.fAsig]), hAsig: hora(r[C.hAsig]),
      anio: (r[C.fRec] && Number(excelFecha(r[C.fRec])?.slice(0, 4))) || anioArchivo,
      asignadoA: limpio(r[C.asignadoA]), dni: String(r[C.dni] ?? "").replace(/\D/g, "") || null,
      nCom: limpio(r[C.nCom]), estado: limpio(r[C.estado]), nCot: limpio(r[C.nCot]), obs: limpio(r[C.obs]),
    });
  }
  return { filas, err: null };
}

async function main() {
  const archivos = readdirSync("U:/")
    .filter((f) => /^SEGUIMIENTO DE PROSPECTOS-(\d{4})( op)?\.xls$/.test(f))
    .filter((f) => !SOLO || f.includes(SOLO))
    .sort();
  const pg = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await pg.connect();
  try {
    const { rows: perfiles } = await pg.query("select id, codigo_comercial from perfiles where rol = 'comercial'");
    const idPorCom = new Map(perfiles.map((p) => [p.codigo_comercial, p.id]));
    const { rows: leadsExist } = await pg.query("select codigo, telefono_normalizado tel, recibido_at::date f, fuente from leads");
    const codigosExist = new Set(leadsExist.map((l) => l.codigo).filter(Boolean));
    const telDia = new Set(leadsExist.filter((l) => l.tel).map((l) => l.tel + "|" + (l.f ? l.f.toISOString().slice(0, 10) : "")));
    const telPublicidad = new Set(leadsExist.filter((l) => l.tel && (l.fuente === "google_ads" || l.fuente === "meta_ads")).map((l) => l.tel));
    const { rows: cts } = await pg.query("select telefono_normalizado tel, array_agg(distinct cuenta_id) cuentas from contactos where telefono_normalizado is not null group by 1");
    const cuentaPorTel = new Map(cts.filter((c) => c.cuentas.length === 1).map((c) => [c.tel, c.cuentas[0]]));

    const vistos = new Set();
    let total = 0, importables = 0, dupCodigo = 0, dupTelDia = 0, dupPublicidad = 0, conCuenta = 0, conComercial = 0;
    const porArchivo = {}, porCanal = {}, porArea = {};
    const lote = [];
    for (const f of archivos) {
      const { filas, err } = leerArchivo("U:/" + f);
      if (err) { console.log(`⚠ ${f}: ${err}`); continue; }
      porArchivo[f.match(/(\d{4})/)[1]] = filas.length;
      for (const r of filas) {
        total++;
        const tel = norm(r.telefono);
        const codigoAnual = r.codigo && r.anio ? `${r.codigo}-${String(r.anio).slice(2)}` : null;
        if (codigoAnual && (vistos.has(codigoAnual) || codigosExist.has(codigoAnual))) { dupCodigo++; continue; }
        const claveTelDia = tel && r.fRec ? tel + "|" + r.fRec : null;
        if (claveTelDia && (vistos.has(claveTelDia) || telDia.has(claveTelDia))) { dupTelDia++; continue; }
        if (tel && telPublicidad.has(tel) && r.fRec && r.fRec >= "2026-05-01") { dupPublicidad++; continue; }
        if (codigoAnual) vistos.add(codigoAnual);
        if (claveTelDia) vistos.add(claveTelDia);
        importables++;
        const canal = canalDeVia(r.via);
        const area = areaDe(r.area);
        porCanal[canal] = (porCanal[canal] ?? 0) + 1;
        porArea[area] = (porArea[area] ?? 0) + 1;
        const comercialId = idPorCom.get("C" + String(r.nCom ?? "").replace(/\D/g, "")) ?? null;
        if (comercialId) conComercial++;
        const cuentaId = tel ? cuentaPorTel.get(tel) ?? null : null;
        if (cuentaId) conCuenta++;
        const partes = [];
        if (r.origen) partes.push(`Origen Central: ${r.origen}`);
        if (r.estado) partes.push(`Estado: ${r.estado}`);
        if (r.nCot) partes.push(`Nº cotización: ${r.nCot}`);
        if (!comercialId && r.asignadoA) partes.push(`Asignado a: ${r.asignadoA}`);
        if (r.obs) partes.push(r.obs);
        lote.push({
          codigo: codigoAnual, canal, area,
          nombre: r.nombre ?? r.empresa ?? "(sin nombre)", razon: r.empresa,
          tel: r.telefono, email: r.correo && r.correo.includes("@") ? r.correo : null,
          numDoc: r.dni && (r.dni.length === 8 || r.dni.length === 11) ? r.dni : null,
          recibido: r.fRec ? `${r.fRec}T${r.hRec ?? "12:00"}:00-05:00` : null,
          asignadoAt: r.fAsig ? `${r.fAsig}T${r.hAsig ?? "12:00"}:00-05:00` : null,
          comercialId, cuentaId,
          mensaje: partes.length ? partes.join(" · ") : null,
        });
      }
    }
    console.log("Filas por año:", porArchivo);
    console.log(`Total filas: ${total} · importables: ${importables}`);
    console.log(`  saltadas — código ya existente/repetido: ${dupCodigo} · mismo teléfono+día ya en CRM: ${dupTelDia} · ya es lead de publicidad: ${dupPublicidad}`);
    console.log(`  con comercial asignable: ${conComercial} · con cuenta enlazada por teléfono: ${conCuenta}`);
    console.log("  por canal:", porCanal);
    console.log("  por área:", porArea);

    if (!APLICAR) { console.log("\n=== SIMULACIÓN (sin --aplicar) ==="); return; }

    console.log("\n=== ESCRIBIENDO (transacción única) ===");
    await pg.query("begin");
    let n = 0;
    for (const l of lote) {
      await pg.query(
        `insert into leads (codigo, estado, area_destino, canal, nombre_contacto, razon_social, telefono, email, num_doc,
                            recibido_at, asignado_a, asignado_at, cuenta_id, mensaje)
         values ($1, 'historico', $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()), $10, $11::timestamptz, $12, $13)`,
        [l.codigo, l.area, l.canal, l.nombre, l.razon, l.tel, l.email, l.numDoc, l.recibido, l.comercialId, l.asignadoAt, l.cuentaId, l.mensaje],
      );
      if (++n % 2000 === 0) console.log(`  ${n}/${lote.length}...`);
    }
    await pg.query("commit");
    console.log(`✓ ${n} leads históricos de Central importados.`);
  } catch (e) {
    await pg.query("rollback").catch(() => {});
    console.error("✗ rollback:", e.message);
    process.exit(1);
  } finally {
    await pg.end();
  }
}
main();
