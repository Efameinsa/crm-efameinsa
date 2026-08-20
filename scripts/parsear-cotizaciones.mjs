// FASE 1 — Extrae los datos de las cotizaciones históricas de la empresa
// (unidad S: = OPEN INVESTMENTS, unidad T: = EFAMEINSA) a un JSON, y emite un
// reporte de cobertura campo por campo. NO toca la base de datos: solo lee.
//
// POR QUÉ UN PARSER Y NO UN MODELO: las cotizaciones salen de la misma
// plantilla de Word desde hace años, así que esto es coincidencia de patrones,
// no comprensión de lenguaje. Un parser cuesta 0, es reproducible y —lo que
// importa aquí— NO PUEDE INVENTAR UN MONTO. Un LLM leyendo 2.500 cotizaciones
// sí puede, y esa cifra entraría al reporte de gerencia sin que nadie la
// vuelva a mirar. Regla del script: si un dato no sale limpio, queda null.
//
// DE DÓNDE SALE CADA COSA (medido sobre muestras de 40 documentos por unidad):
//   · nombre del archivo → Nº de presupuesto, año y cliente, sin abrir nada
//   · .doc  → identificación, fecha, cliente, teléfono, correo, ítems y el
//     asesor (la firma trae comercialN@efameinsa.com, que da el código)
//   · .pdf  → LOS MONTOS. El .doc los pierde: antiword no renderiza las tablas
//     anidadas donde vive el precio, y sale la fila vacía. Cobertura de precio
//     medida: .doc 60 % en Efameinsa contra 97 % en el PDF.
//
// Uso:
//   node scripts/parsear-cotizaciones.mjs [--unidad T] [--limite 50] [--salida archivo.json]

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdirSync, writeFileSync, statSync } from "node:fs";
const ejecutar = promisify(execFile);

const arg = (n, def = null) => { const i = process.argv.indexOf(`--${n}`); return i !== -1 ? process.argv[i + 1] : def; };
const UNIDADES = arg("unidad") ? [arg("unidad")] : ["T", "S"];
const LIMITE = Number(arg("limite", "0")) || 0;
const SALIDA = arg("salida", "scripts/data/cotizaciones-historicas.json");
const SERIE = { T: "EFAMEINSA", S: "OPEN" };
const CONCURRENCIA = 8;

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };

async function texto(ruta) {
  try {
    if (/\.pdf$/i.test(ruta)) {
      const { stdout } = await ejecutar("pdftotext", ["-layout", "-enc", "UTF-8", ruta, "-"], { maxBuffer: 32e6 });
      return stdout;
    }
    if (/\.docx$/i.test(ruta)) {
      const { stdout } = await ejecutar("unzip", ["-p", ruta, "word/document.xml"], { maxBuffer: 32e6, encoding: "buffer" });
      return stdout.toString("utf8").replace(/<\/w:p>/g, "\n").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/[ \t]+/g, " ");
    }
    // .doc: antiword saca cp1252; sin -m y sin iconv salen "N�" y "Se�ora".
    const { stdout } = await ejecutar("antiword", ["-m", "cp1252.txt", ruta], { maxBuffer: 32e6, encoding: "buffer" });
    return new TextDecoder("windows-1252").decode(stdout);
  } catch {
    return "";
  }
}

/** "1,905.93" / "2490" → 1905.93. Devuelve null si no es un número creíble. */
function num(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(/[^\d.,]/g, "").replace(/,(?=\d{3}\b)/g, "").replace(/,/g, "."));
  return Number.isFinite(n) && n > 0 && n < 10_000_000 ? Math.round(n * 100) / 100 : null;
}

function parsearNombre(base) {
  // "Presu_100-26, CLIENTE" · "Presu_ 1387-26, X" · "Presu_2092--26,Y" · "Presu_-XXXX AMAZONAS"
  const m = base.match(/^Presu_?\s*-?\s*(\d{1,4})\s*-+\s*(\d{2})\s*[,\-]?\s*(.*)$/i);
  if (m) return { correlativo: Number(m[1]), anio: 2000 + Number(m[2]), cliente: m[3].trim() || null };
  const soloCliente = base.replace(/^Presu_?\s*-?\s*[X\d]*\s*-*\s*\d{0,2}\s*[,\-]?\s*/i, "").trim();
  return { correlativo: null, anio: null, cliente: soloCliente || null };
}

function parsearDoc(t) {
  const r = {};
  const cod = t.match(/COTIZACI[OÓ]N\s*N[°ºo.]*\s*:?\s*(\d{1,4})\s*-+\s*(\d{2})/i);
  if (cod) { r.correlativoDoc = Number(cod[1]); r.anioDoc = 2000 + Number(cod[2]); }

  const fe = t.match(/Lima\s*,\s*(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+del?\s+(\d{4})/i);
  if (fe) {
    const mes = MESES[fe[2].toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")];
    if (mes) r.fecha = `${fe[3]}-${String(mes).padStart(2, "0")}-${String(Number(fe[1])).padStart(2, "0")}`;
  }

  // Cliente: la línea con contenido que sigue a "Señor/Señora/Señores".
  const lineas = t.split(/\r?\n/).map((l) => l.replace(/\s+/g, " ").trim());
  const iSr = lineas.findIndex((l) => /^Se[ñn]or(a|es)?\s*:?\s*$/i.test(l));
  if (iSr !== -1) {
    const sig = lineas.slice(iSr + 1).find((l) => l.length > 2 && !/^\|/.test(l));
    if (sig) r.cliente = sig.replace(/[.,;]+$/, "").slice(0, 200);
  }

  const tel = t.match(/Tel[eé]fono\s*:?\s*([\d\s()+-]{6,})/i);
  if (tel) r.telefono = tel[1].replace(/[^\d]/g, "").slice(0, 15) || null;
  const cor = t.match(/Correo\s*:?\s*([^\s|]+@[^\s|,;]+)/i);
  if (cor) r.correo = cor[1].toLowerCase().replace(/[.,;]+$/, "");
  const at = t.match(/Atenci[oó]n\s*:?\s*([^\n|]{2,80})/i);
  if (at) r.atencion = at[1].replace(/[.,;]+$/, "").trim();

  // Asesor: el email de la firma da el código (comercial9 → C9); el nombre
  // está en la celda inmediatamente anterior a "Área Comercial".
  // Sin exigir el ".com": al extraer el Word la línea suele quedar cortada en
  // "comercial8@efameinsa", y esa variante se perdía. "comercialN@efameinsa"
  // solo puede ser la firma del asesor, así que no hay riesgo de confusión.
  // Las dos razones sociales firman con su propio dominio: las cotizaciones de
  // Open llevan comercialN@openinvestments.com.pe. Buscar solo "@efameinsa"
  // dejaba a Open con el asesor en blanco más de la mitad de las veces.
  // Tampoco se exige el ".com": al extraer el Word la línea suele quedar
  // cortada en "comercial8@efameinsa", y esa variante se perdía.
  const mail = t.match(/comercial\s*(\d{1,2})\s*@\s*(efameinsa|openinvestments)/i);
  if (mail) {
    r.asesorCodigo = `C${Number(mail[1])}`;
    r.asesorEmail = `comercial${Number(mail[1])}@${mail[2].toLowerCase()}${/open/i.test(mail[2]) ? ".com.pe" : ".com"}`;
  }
  // El nombre del asesor va en la línea anterior a su cargo. El cargo cambia
  // según quién firme ("Área Comercial", "Post Venta"…), y en el Word la línea
  // viene partida en celdas con "|" mientras que en el PDF es texto suelto.
  const iCargo = lineas.findIndex((l) => /^\|?\s*(Área|Area) Comercial|Post\s*-?\s*Venta|Asesor(a)? Comercial/i.test(l));
  if (iCargo > 0) {
    for (let i = iCargo - 1; i >= Math.max(0, iCargo - 3); i--) {
      const celdas = lineas[i].split("|").map((x) => x.trim()).filter((x) => x && x !== "[pic]");
      const nom = celdas.find((x) => /^[A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.\s]{5,60}$/.test(x)
        && !/Área|Area|Comercial|Post|Venta|Tel|Cel|Email|Atentamente|Agradeciendo/i.test(x));
      if (nom) { r.asesorNombre = nom.replace(/[.]+$/, "").trim(); break; }
    }
  }

  r.items = [...t.matchAll(/ITEM\s+[IVX]+\s*\.?-\s*([^\n|]{4,90})/gi)].map((m) => m[1].trim());
  const val = t.match(/VALIDEZ DE LA COTIZACI[OÓ]N\s*:?\s*(\d{1,3})\s*D[IÍ]AS/i);
  if (val) r.validezDias = Number(val[1]);
  return r;
}

function parsearPdf(t) {
  const r = {};
  // Prioridad: SUB TOTAL impreso — es el total real, ya sin IGV y con las
  // cantidades incluidas (la misma base que guarda el CRM). El total CON IGV
  // se guarda aparte solo como verificación cruzada, nunca como el monto.
  const sub = t.match(/SUB\s*TOTAL[^\d\n]{0,80}?([\d.,]{3,15})/i);
  if (sub) r.subtotal = num(sub[1]);
  const tot = t.match(/TOTAL\s+INCLUIDO\s+IGV[^\d\n]{0,80}?([\d.,]{3,15})/i);
  if (tot) r.totalConIgv = num(tot[1]);

  // Sin SUB TOTAL hay que armar el monto con los precios por equipo. Cada
  // equipo imprime su "Precio regular" y, cuando hubo rebaja, su "Precio de
  // oferta / campaña / especial": manda la rebaja, que es lo que realmente se
  // cotizó. Se recorre en orden — una rebaja pertenece al último regular visto.
  const hallados = [...t.matchAll(/Precio\s+(regular|de\s+oferta|oferta|campa[ñn]a|especial)[^\d\n]{0,12}?([\d.,]{3,15})/gi)]
    .map((m) => ({ tipo: /regular/i.test(m[1]) ? "regular" : "rebaja", valor: num(m[2]) }))
    .filter((x) => x.valor);
  const equipos = [];
  for (const e of hallados) {
    if (e.tipo === "regular" || !equipos.length) {
      equipos.push({ regular: e.tipo === "regular" ? e.valor : null, rebaja: e.tipo === "rebaja" ? e.valor : null });
    } else if (equipos.at(-1).rebaja == null) {
      equipos.at(-1).rebaja = e.valor;
    } else {
      equipos.push({ regular: null, rebaja: e.valor });
    }
  }
  // ⚠️ Los precios por equipo se guardan como LISTA, nunca como total sumado.
  // Se probó sumarlos y contrastarlos contra el SUB TOTAL impreso: de 25
  // cotizaciones que tenían ambos, 17 no cuadraban — unas por 10× de más y
  // otras exactamente 1/5 de menos. La razón es del negocio, no del parser:
  // muchas cotizaciones de Efameinsa son un MENÚ de alternativas para que el
  // cliente elija (sumarlas infla), y otras llevan cantidades mayores a 1
  // (sumar una sola unidad se queda corto). Un total inventado por suma es
  // justo el tipo de dato que nadie vuelve a auditar, así que si la cotización
  // no imprime un total, aquí no hay monto.
  r.preciosEquipos = equipos.map((e) => e.rebaja ?? e.regular).filter(Boolean);
  r.nEquipos = r.preciosEquipos.length || null;
  return r;
}

async function enLotes(items, n, fn) {
  const salida = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (i < items.length) {
      const k = i++;
      salida[k] = await fn(items[k], k);
      if (salida.length > 200 && k % 250 === 0) process.stdout.write(`\r  ${k}/${items.length}…   `);
    }
  }));
  return salida;
}

const cotizaciones = [];
for (const unidad of UNIDADES) {
  let archivos;
  try { archivos = readdirSync(`${unidad}:/`); }
  catch { console.error(`No se pudo leer ${unidad}:/ — ¿está conectada la unidad?`); continue; }

  // Word y PDF de la misma cotización comparten nombre base: se agrupan para
  // tener un registro por cotización y no uno por archivo.
  const porBase = new Map();
  for (const nombre of archivos) {
    const m = nombre.match(/^(.*)\.(doc|docx|pdf)$/i);
    if (!m) continue;
    const ruta = `${unidad}:/${nombre}`;
    try { if (!statSync(ruta).isFile()) continue; } catch { continue; }
    const base = m[1].trim();
    const g = porBase.get(base) ?? { base, unidad };
    if (/pdf/i.test(m[2])) g.pdf = ruta; else g.doc = ruta;
    porBase.set(base, g);
  }
  let grupos = [...porBase.values()];
  if (LIMITE) grupos = grupos.slice(0, LIMITE);
  console.log(`${unidad}: (${SERIE[unidad]}) — ${grupos.length} cotizaciones…`);

  const res = await enLotes(grupos, CONCURRENCIA, async (g) => {
    const nom = parsearNombre(g.base);
    const tDoc = g.doc ? await texto(g.doc) : "";
    const tPdf = g.pdf ? await texto(g.pdf) : "";
    // Se parsean AMBOS documentos y se combinan campo por campo, con el Word
    // como preferido. Antes el PDF solo se miraba si NO había Word, y eso
    // perdía datos: en Open hay cientos de cotizaciones cuyo .doc quedó como
    // plantilla vacía mientras el PDF —el que se envió al cliente— tiene todo.
    // Por eso el asesor solo salía en el 39 % de Open.
    const d = tDoc ? parsearDoc(tDoc) : {};
    const dPdf = tPdf ? parsearDoc(tPdf) : {};
    const p = tPdf ? parsearPdf(tPdf) : (tDoc ? parsearPdf(tDoc) : {});

    // Solo hay monto si la cotización IMPRIME un total: el subtotal sin IGV,
    // o el total con IGV dividido entre 1,18 (el CRM guarda importes sin IGV).
    // Si no imprime ninguno, queda null y los precios por equipo se conservan
    // aparte como referencia — nunca como un total deducido.
    const desdeTotal = p.totalConIgv ? Math.round((p.totalConIgv / 1.18) * 100) / 100 : null;
    const monto = p.subtotal ?? desdeTotal ?? null;
    const fuente = p.subtotal ? "subtotal" : desdeTotal ? "total_con_igv/1.18" : null;
    return {
      serie: SERIE[g.unidad],
      base: g.base,
      tieneDoc: Boolean(g.doc), tienePdf: Boolean(g.pdf),
      correlativo: d.correlativoDoc ?? dPdf.correlativoDoc ?? nom.correlativo,
      anio: d.anioDoc ?? dPdf.anioDoc ?? nom.anio,
      cliente: d.cliente ?? dPdf.cliente ?? nom.cliente,
      clienteArchivo: nom.cliente,
      fecha: d.fecha ?? dPdf.fecha ?? null,
      telefono: d.telefono ?? dPdf.telefono ?? null,
      correo: d.correo ?? dPdf.correo ?? null,
      atencion: d.atencion ?? dPdf.atencion ?? null,
      asesorCodigo: d.asesorCodigo ?? dPdf.asesorCodigo ?? null,
      asesorNombre: d.asesorNombre ?? dPdf.asesorNombre ?? null,
      items: (d.items?.length ? d.items : dPdf.items) ?? [],
      montoSinIgv: monto,
      fuenteMonto: fuente,
      totalConIgv: p.totalConIgv ?? null,
      // Se guardan las dos vías aunque solo una se use como monto: donde
      // coexisten permiten comprobar que sumar por equipo no infla el total.
      subtotalImpreso: p.subtotal ?? null,
      preciosEquipos: p.preciosEquipos ?? [],
      precioRegular: p.precioRegular ?? null,
      nEquipos: p.nEquipos ?? null,
      validezDias: d.validezDias ?? dPdf.validezDias ?? null,
    };
  });
  process.stdout.write("\r");
  cotizaciones.push(...res);
}

writeFileSync(SALIDA, JSON.stringify(cotizaciones, null, 1));

// ---------- Reporte de cobertura ----------
const campos = ["correlativo", "anio", "cliente", "fecha", "telefono", "correo", "atencion",
  "asesorCodigo", "asesorNombre", "items", "montoSinIgv", "validezDias"];
console.log(`\n=== COBERTURA (${cotizaciones.length} cotizaciones) ===`);
const filas = campos.map((c) => {
  const fila = { campo: c };
  for (const s of ["EFAMEINSA", "OPEN"]) {
    const g = cotizaciones.filter((x) => x.serie === s);
    if (!g.length) continue;
    const n = g.filter((x) => (Array.isArray(x[c]) ? x[c].length : x[c] != null && x[c] !== "")).length;
    fila[s] = `${n} (${Math.round((n / g.length) * 100)}%)`;
  }
  return fila;
});
console.table(filas);

for (const s of ["EFAMEINSA", "OPEN"]) {
  const g = cotizaciones.filter((x) => x.serie === s);
  if (!g.length) continue;
  const conMonto = g.filter((x) => x.montoSinIgv != null);
  const fuentes = {};
  for (const x of conMonto) fuentes[x.fuenteMonto] = (fuentes[x.fuenteMonto] ?? 0) + 1;
  const nums = g.map((x) => x.correlativo).filter(Boolean);
  const asesores = {};
  for (const x of g) if (x.asesorCodigo) asesores[x.asesorCodigo] = (asesores[x.asesorCodigo] ?? 0) + 1;
  console.log(`\n--- ${s} (${g.length}) ---`);
  console.log(`  correlativos: ${Math.min(...nums)} → ${Math.max(...nums)} · ${new Set(nums).size} únicos`);
  console.log(`  años: ${JSON.stringify(g.reduce((a, x) => { a[x.anio ?? "?"] = (a[x.anio ?? "?"] ?? 0) + 1; return a; }, {}))}`);
  console.log(`  monto: ${conMonto.length} (${Math.round((conMonto.length / g.length) * 100)}%) · fuentes: ${JSON.stringify(fuentes)}`);
  console.log(`  suma sin IGV: US$ ${Math.round(conMonto.reduce((a, x) => a + x.montoSinIgv, 0)).toLocaleString("es-PE")}`);
  console.log(`  asesores: ${JSON.stringify(asesores)}`);
  console.log(`  sin Word: ${g.filter((x) => !x.tieneDoc).length} · sin PDF: ${g.filter((x) => !x.tienePdf).length}`);
}
console.log(`\nJSON escrito en ${SALIDA}`);
