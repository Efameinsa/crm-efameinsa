// ============================================================
// CRM EFAMEINSA · Fichas tecnicas por codigo — VERSION 2
// ============================================================
// Pedido de Darwin (28-08). La v1 (`V:\Fichas tecnicas por codigo.xlsx`) se
// generó el 27-08 a las 09:51 y quedó atrás: los CUATRO Excels de `V:\LESLY`
// se tocaron después de esa hora, y el libro «Modificacion de precio y
// capacidad secadora ut120 26.08.26.xlsx» estrenó una hoja entera —COCHE, 13
// códigos— que la v1 no llegó a mirar porque el script declaraba las hojas de
// ese libro una por una.
//
// LA REGLA NO CAMBIA, es la que hace auditable el reporte: SE BUSCA POR
// CODIGO Y EL CODIGO TIENE QUE SER EXACTO. Nada de parecidos de nombre, de
// modelo ni de marca. `contieneCodigo()` es la misma función de la v1, letra
// por letra.
//
// QUE CAMBIA EN LA V2
//   1. El libro de modificaciones se lee ENTERO: todas sus hojas, presentes y
//      futuras. Sus hojas no tienen cabecera y el código va en la columna A,
//      así que se declara la FORMA del libro y no la lista de hojas. Es lo
//      que evitó que se volviera a perder una hoja nueva.
//   2. Se avisa cuando un mismo código nombra a dos equipos distintos
//      (LAVA060 está dos veces en MARKETING y en EQUIPOS3, para la UCT060 M30
//      y para la UCT060 M9). La v1 se quedaba callada con la última.
//   3. Se avisa cuando el mismo equipo lleva códigos distintos en cada Excel
//      (1SECU1701 en EQUIPOS2/3 y SECU1701 en MARKETING). Son los que hacen
//      que un equipo aparezca dos veces, una con ficha y otra sin ella.
//   4. Sale una hoja CAMBIOS VS V1 con lo que se movió desde el 27-08.
//
// Uso: node scripts/buscar-fichas-por-codigo-v2.mjs

import XLSX from "xlsx";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const RAICES = ["V:\\LESLY", "V:\\PROYECTO ASIGNADO - JEAN PAUL"];
const SALIDA = path.join(process.cwd(), "scripts", "data", "fichas-por-codigo-v2.json");
const V1 = path.join(process.cwd(), "scripts", "data", "fichas-por-codigo.json");

const limpio = (t) => String(t ?? "").replace(/\s+/g, " ").trim();
const fechaLocal = (d) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// ---------- 1. Los códigos de los cuatro Excels ----------
//
// Los tres maestros de Lesly tienen cabecera y una sola hoja con códigos, así
// que se nombra la hoja. El libro de modificaciones se lleva por FORMA:
// `hojas: "*"` significa todas, las de hoy y las que agregue mañana.

const LIBROS = [
  {
    archivo: "V:\\LESLY\\CODIFICACION DE EQUIPOS  PARA MARKETING.xlsx",
    corto: "MARKETING",
    hojas: [{ nombre: "Hoja1", desde: 3, codigo: 1, equipo: 2, stock: 3, marca: 4, ubicacion: 5, precio: 6 }],
  },
  {
    archivo: "V:\\LESLY\\CODIFICACION DE EQUIPOS2.xlsx",
    corto: "EQUIPOS2",
    hojas: [{ nombre: "EQUIPOS CODIFICADOS ", desde: 3, codigo: 1, equipo: 2, stock: 3, marca: 4, ubicacion: 5, precio: 6 }],
  },
  {
    archivo: "V:\\LESLY\\CODIFICACION DE EQUIPOS3.xlsx",
    corto: "EQUIPOS3",
    hojas: [{ nombre: "EQUIPOS CODIFICADOS ", desde: 3, codigo: 1, equipo: 2, stock: 3, marca: 4, ubicacion: 5, precio: 6 }],
  },
  {
    archivo: "V:\\LESLY\\Modificacion de precio y capacidad secadora ut120 26.08.26.xlsx",
    corto: "MODIF. UT120 26-08",
    hojas: "*",
    forma: { desde: 0, codigo: 0, equipo: 1, stock: 2, marca: 3, precio: 4 },
  },
  // El libro más nuevo (31-08): las dos flotantes que faltaban en el catálogo,
  // ya con código propio. Va al final porque el orden de esta lista es el de
  // antigüedad, y el último que pisa un dato es el vigente. Misma forma que el
  // libro de modificaciones —sin cabecera, código en la columna A— y `hojas:
  // "*"` para que las hojas que Lesly agregue mañana no se pierdan.
  {
    archivo: "V:\\LESLY\\LAVADORA FX Y UY PARA AGREGAR.xlsx",
    corto: "FX Y UY 31-08",
    hojas: "*",
    forma: { desde: 0, codigo: 0, equipo: 1, stock: 2, marca: 3, precio: 4 },
  },
];

/** Un código de verdad: letras y números, sin espacios, de 3 caracteres para
 *  arriba. Descarta los «ITEM», los totales y las notas sueltas. */
const esCodigo = (t) => /^[A-Z0-9][A-Z0-9.\-]{2,}$/i.test(t) && /[A-Z]/i.test(t) && !/^ITEM$/i.test(t);

const productos = new Map(); // CÓDIGO -> ficha del producto
const hojasSinCodigo = [];
const apariciones = []; // cada fila de cada Excel, para los cruces del punto 2 y 3

for (const libro of LIBROS) {
  const wb = XLSX.readFile(libro.archivo);
  for (const nombreHoja of wb.SheetNames) {
    const cfg = libro.hojas === "*" ? { nombre: nombreHoja, ...libro.forma } : libro.hojas.find((h) => h.nombre === nombreHoja);
    if (!cfg) {
      // «FALTA PRECIOS Y FICHA» y «EQUIPOS QUE NO TENEMOS STOCK» no tienen
      // columna de código: no se pueden buscar bajo la condición del encargo.
      // Se dicen en el reporte en vez de desaparecer sin más.
      const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: null })
        .filter((f) => f.some((x) => x != null));
      hojasSinCodigo.push({ libro: libro.corto, hoja: nombreHoja, filas: Math.max(0, filas.length - 2) });
      continue;
    }
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[nombreHoja], { header: 1, defval: null }).slice(cfg.desde);
    filas.forEach((f, i) => {
      const codigo = limpio(f[cfg.codigo]).toUpperCase();
      if (!esCodigo(codigo)) return;
      const datos = {
        codigo,
        equipo: limpio(f[cfg.equipo]),
        stock: typeof f[cfg.stock] === "number" ? f[cfg.stock] : limpio(f[cfg.stock]) || null,
        marca: limpio(f[cfg.marca]) || null,
        ubicacion: cfg.ubicacion == null ? null : limpio(f[cfg.ubicacion]) || null,
        precio: typeof f[cfg.precio] === "number" ? f[cfg.precio] : null,
      };
      apariciones.push({ ...datos, libro: libro.corto, hoja: nombreHoja, fila: cfg.desde + i + 1 });
      const ya = productos.get(codigo);
      if (!ya) {
        // Los libros se recorren del más viejo al más nuevo, así que el
        // último en pisar los datos es el vigente; `libros` guarda todos y
        // `manda` dice cuál fue el último que cambió algo de verdad.
        productos.set(codigo, { ...datos, libros: [libro.corto], manda: libro.corto, mandaHoja: nombreHoja, hoja: nombreHoja });
      } else {
        if (!ya.libros.includes(libro.corto)) ya.libros.push(libro.corto);
        // Solo pisa lo que este libro dice de verdad: una celda vacía no
        // borra el dato del maestro anterior. Si nada cambia, `manda` se
        // queda donde estaba: repetir el mismo valor no es imponer nada.
        let piso = false;
        for (const k of ["equipo", "stock", "marca", "ubicacion", "precio"]) {
          if (datos[k] == null || datos[k] === "") continue;
          if (String(ya[k] ?? "") !== String(datos[k])) piso = true;
          ya[k] = datos[k];
        }
        if (piso) { ya.manda = libro.corto; ya.mandaHoja = nombreHoja; }
        ya.hoja = nombreHoja;
      }
    });
  }
}

// ---------- 1b. Los avisos de codificación ----------
//
// Tres formas de que el maestro se contradiga, y las tres hacen que un equipo
// salga mal en el reporte. Ninguna se corrige aquí: solo se avisa, porque el
// que decide el código es Lesly.
//
//   · CODIGO REPETIDO — el mismo código, dos veces DENTRO DE LA MISMA hoja,
//     para dos equipos distintos (LAVA060 está en la fila 15 y en la 16 de
//     MARKETING, la UCT060 M30 y la UCT060 M9). La v1 se quedaba con la
//     última y la otra máquina desaparecía sin dejar rastro.
//   · MISMO EQUIPO, DOS CODIGOS — la misma descripción codificada distinto en
//     cada Excel (1SECU1701 en EQUIPOS2/3, SECU1701 en MARKETING). Uno de los
//     dos casi nunca tiene ficha: parece un equipo sin ficha cuando en
//     realidad es un código mal escrito en uno de los libros.
//   · LOS EXCELS NO DICEN LO MISMO — el mismo código con distinta descripción
//     o distinto precio según el libro. Es justo lo que dejó la modificación
//     del 26-08 (la UT120 pasó de 50KG a 55KG solo en EQUIPOS2 y en el libro
//     de modificaciones). Manda el libro más nuevo, y aquí se ve cuál era.
//
// El equipo se compara por su descripción normalizada: es el único texto que
// los tres libros copian igual.

const normEquipo = (t) => limpio(t).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

const porEquipo = new Map();
for (const a of apariciones) {
  const k = normEquipo(a.equipo);
  if (!k) continue;
  if (!porEquipo.has(k)) porEquipo.set(k, []);
  porEquipo.get(k).push(a);
}

const porCodigoApar = new Map();
for (const a of apariciones) {
  if (!porCodigoApar.has(a.codigo)) porCodigoApar.set(a.codigo, []);
  porCodigoApar.get(a.codigo).push(a);
}

const codigoRepetido = []; // el mismo código dos veces en la misma hoja
for (const [codigo, suyas] of porCodigoApar) {
  const choques = [];
  for (const hoja of new Set(suyas.map((a) => `${a.libro} / ${a.hoja}`))) {
    const enHoja = suyas.filter((a) => `${a.libro} / ${a.hoja}` === hoja);
    if (new Set(enHoja.map((a) => normEquipo(a.equipo))).size > 1) choques.push(...enHoja);
  }
  if (choques.length === 0) continue;
  codigoRepetido.push({
    codigo,
    equipos: new Set(choques.map((a) => normEquipo(a.equipo))).size,
    donde: choques.map((a) => `${a.libro} / ${a.hoja} fila ${a.fila}: ${a.equipo}`),
  });
}

const equipoConVariosCodigos = []; // un equipo, varios códigos
for (const [, lista] of porEquipo) {
  const codigos = [...new Set(lista.map((a) => a.codigo))];
  if (codigos.length < 2) continue;
  equipoConVariosCodigos.push({
    equipo: lista[0].equipo,
    codigos,
    donde: codigos.map((c) => {
      const quien = lista.filter((a) => a.codigo === c);
      return `${c}  →  ${[...new Set(quien.map((a) => a.libro))].join(" + ")}`;
    }),
  });
}

const noDicenLoMismo = []; // el mismo código, distinto texto o distinto precio segun el libro
for (const [codigo, suyas] of porCodigoApar) {
  if (codigoRepetido.some((r) => r.codigo === codigo)) continue; // ese ya se avisa aparte
  const porLibro = new Map();
  for (const a of suyas) if (!porLibro.has(a.libro)) porLibro.set(a.libro, a);
  if (porLibro.size < 2) continue;
  const libros = [...porLibro.values()];
  const equipoCambia = new Set(libros.map((a) => normEquipo(a.equipo))).size > 1;
  const precioCambia = new Set(libros.map((a) => String(a.precio ?? ""))).size > 1;
  if (!equipoCambia && !precioCambia) continue;
  noDicenLoMismo.push({
    codigo,
    equipo: libros[libros.length - 1].equipo,
    queCambia: [equipoCambia ? "descripcion" : null, precioCambia ? "precio" : null].filter(Boolean).join(" + "),
    manda: libros[libros.length - 1].libro,
    donde: libros.map((a) => `${a.libro}: ${a.precio ?? "(sin precio)"}  ·  ${a.equipo}`),
  });
}

// ---------- 2. Los archivos de las dos carpetas ----------

function recorrer(dir, acumulado = []) {
  let entradas;
  try {
    entradas = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acumulado;
  }
  for (const e of entradas) {
    const completo = path.join(dir, e.name);
    if (e.isDirectory()) recorrer(completo, acumulado);
    else if (/\.(docx?|pdf)$/i.test(e.name) && !e.name.startsWith("~$")) {
      let st;
      try {
        st = fs.statSync(completo);
      } catch {
        continue;
      }
      acumulado.push({
        ruta: completo,
        nombre: e.name,
        base: e.name.replace(/\.(docx?|pdf)$/i, ""),
        carpeta: path.basename(path.dirname(completo)),
        tipo: /\.pdf$/i.test(e.name) ? "PDF" : /\.docx$/i.test(e.name) ? "DOCX" : "DOC",
        modificado: fechaLocal(st.mtime),
        kb: Math.round(st.size / 1024),
      });
    }
  }
  return acumulado;
}

const archivos = RAICES.flatMap((r) => recorrer(r));

// ---------- 3. El cruce, solo por código ----------

/**
 * El código completo, con frontera a los dos lados. IDÉNTICA A LA V1: es la
 * regla que Darwin puso cuando se creó el reporte y no se toca.
 *
 * Por delante la regla es simple: o empieza el texto, o hay algo que no es
 * letra ni número.
 *
 * Por detrás hay un caso que obligó a afinarla. Lesly a veces se come el
 * guion: «LAVUY2802LAVADORA UY240 - UNILIC TOUCH…docx» ES la ficha de
 * LAVUY2802. Pero «CO402A», «CALE251» y «SECU755» son máquinas DISTINTAS de
 * CO402, CALE25 y SECU75. Lo que los separa es la forma del resto:
 *   · un dígito, o una o dos letras sueltas  → es otro código, no vale
 *   · una palabra larga de puras letras      → falta el guion, sí vale
 */
function contieneCodigo(texto, codigo) {
  const t = texto.toUpperCase();
  const c = codigo.toUpperCase();
  let desde = 0;
  for (;;) {
    const i = t.indexOf(c, desde);
    if (i === -1) return false;
    const antes = i === 0 ? "" : t[i - 1];
    if (antes === "" || !/[A-Z0-9]/.test(antes)) {
      const resto = (t.slice(i + c.length).match(/^[A-Z0-9]+/) ?? [""])[0];
      if (resto === "" || (resto.length >= 4 && /^[A-Z]+$/.test(resto))) return true;
    }
    desde = i + 1;
  }
}

/** El texto de un .docx sin librerías: es un zip y el contenido vive en
 *  word/document.xml. Se localiza la entrada por el índice central del zip y
 *  se infla. Si algo no cuadra, devuelve null y el archivo se da por ilegible
 *  en vez de inventar un resultado. */
function textoDocx(ruta) {
  let buf;
  try {
    buf = fs.readFileSync(ruta);
  } catch {
    return null;
  }
  const marca = Buffer.from("word/document.xml");
  let i = buf.indexOf(marca);
  while (i !== -1) {
    const cab = i - 30;
    if (cab >= 0 && buf.readUInt32LE(cab) === 0x04034b50) {
      const metodo = buf.readUInt16LE(cab + 8);
      const nombreLen = buf.readUInt16LE(cab + 26);
      const extraLen = buf.readUInt16LE(cab + 28);
      if (nombreLen === marca.length) {
        const datos = cab + 30 + nombreLen + extraLen;
        try {
          const crudo = buf.subarray(datos);
          const xml = metodo === 0 ? crudo.toString("utf8") : zlib.inflateRawSync(crudo, { finishFlush: zlib.constants.Z_SYNC_FLUSH }).toString("utf8");
          return xml.replace(/<[^>]+>/g, " ");
        } catch {
          return null;
        }
      }
    }
    i = buf.indexOf(marca, i + 1);
  }
  return null;
}

/** El código que trae el nombre del archivo: lo que va antes del primer
 *  guion, punto o espacio. «SECU75E3. SECADORA UT075…» → «SECU75E3». */
const codigoDelArchivo = (base) => (base.match(/^[A-Za-z0-9]+/) ?? [""])[0].toUpperCase();

/** Distancia de edición, cortada en 1: solo interesa saber si se diferencian
 *  en UN carácter. Es lo que separa «SEC75E3» del archivo «SECU75E3» o
 *  «LAVTGIA13» de «LAVGIA13»: el Excel y el archivo no se escribieron igual. */
function difiereEnUno(a, b) {
  if (a === b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  let j = 0;
  while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return a.length - i - j <= 1 && b.length - i - j <= 1;
}

const cacheTexto = new Map();
function textoDe(archivo) {
  if (archivo.tipo !== "DOCX") return null;
  if (!cacheTexto.has(archivo.ruta)) cacheTexto.set(archivo.ruta, textoDocx(archivo.ruta));
  return cacheTexto.get(archivo.ruta);
}

const repetidos = new Set(codigoRepetido.map((x) => x.codigo));
const enConflicto = new Map(); // código -> los otros códigos del mismo equipo
for (const g of equipoConVariosCodigos) {
  for (const c of g.codigos) enConflicto.set(c, g.codigos.filter((x) => x !== c));
}

const filas = [];
for (const p of [...productos.values()].sort((a, b) => a.codigo.localeCompare(b.codigo))) {
  const porNombre = archivos.filter((a) => contieneCodigo(a.base, p.codigo));
  const porCarpeta = porNombre.length > 0 ? [] : archivos.filter((a) => contieneCodigo(a.carpeta, p.codigo));
  let porTexto = [];
  if (porNombre.length === 0 && porCarpeta.length === 0) {
    porTexto = archivos.filter((a) => {
      const t = textoDe(a);
      return t != null && contieneCodigo(t, p.codigo);
    });
  }

  const encontrados = [...porNombre, ...porCarpeta, ...porTexto];
  const donde = porNombre.length > 0 ? "Nombre del archivo"
    : porCarpeta.length > 0 ? "Nombre de la carpeta"
    : porTexto.length > 0 ? "Texto dentro del Word"
    : "";

  // Para los que no aparecen: archivos cuyo nombre CONTIENE el código pero
  // pegado a otras letras o números, o sea con OTRO código («CO402» dentro de
  // «CO402A»). No cuenta como encontrado —son máquinas distintas— pero es la
  // pista que explica por qué falta.
  // Y los que se escriben casi igual: el Excel dice SEC75E3 y el archivo dice
  // SECU75E3. Sigue sin contar como encontrado —hay que confirmarlo con Lesly,
  // no darlo por bueno— pero convierte «no existe» en «existe, mal escrito».
  let pistas = [];
  if (encontrados.length === 0) {
    const contiene = archivos.filter((a) => a.base.toUpperCase().includes(p.codigo.toUpperCase()));
    const parecidos = archivos.filter(
      (a) => !contiene.includes(a) && difiereEnUno(codigoDelArchivo(a.base), p.codigo.toUpperCase()),
    );
    pistas = [
      ...contiene.map((a) => `LLEVA EL CODIGO DENTRO DE OTRO: ${a.nombre}  →  ${a.ruta}`),
      ...parecidos.map((a) => `SE ESCRIBE CASI IGUAL (${codigoDelArchivo(a.base)}): ${a.nombre}  →  ${a.ruta}`),
    ];
  }

  filas.push({
    ...p,
    encontrado: encontrados.length > 0,
    donde,
    pistas,
    codigoRepetido: repetidos.has(p.codigo),
    otrosCodigosDelMismoEquipo: enConflicto.get(p.codigo) ?? [],
    cuantos: encontrados.length,
    words: encontrados.filter((a) => a.tipo !== "PDF").length,
    pdfs: encontrados.filter((a) => a.tipo === "PDF").length,
    archivos: encontrados.map((a) => ({
      ruta: a.ruta,
      nombre: a.nombre,
      tipo: a.tipo,
      modificado: a.modificado,
      kb: a.kb,
      raiz: a.ruta.toUpperCase().startsWith("V:\\LESLY") ? "V:\\LESLY" : "V:\\PROYECTO ASIGNADO - JEAN PAUL",
    })),
  });
}

// El aviso que no sale de los archivos sino del propio maestro: el mismo
// equipo codificado de dos formas. Casi siempre la ficha está bajo la otra
// escritura, así que se dice si la otra la tiene. Va en una segunda pasada
// porque necesita el resultado de TODOS los códigos, no solo los anteriores.
const porCodigo = new Map(filas.map((f) => [f.codigo, f]));
for (const f of filas) {
  if (f.encontrado) continue;
  for (const o of f.otrosCodigosDelMismoEquipo) {
    const otro = porCodigo.get(o);
    const dice = otro ? (otro.encontrado ? "y ESE SI TIENE FICHA" : "y ese tampoco tiene ficha") : "";
    f.pistas.unshift(`EL MISMO EQUIPO ESTA CODIFICADO TAMBIEN COMO ${o} ${dice}`.trim());
  }
}

const encontrados = filas.filter((f) => f.encontrado);

// Una fila por (código, archivo): es la vista que permite poner un enlace por
// archivo y no solo uno por producto.
const detalle = filas.flatMap((f) =>
  f.archivos.map((a) => ({
    codigo: f.codigo,
    equipo: f.equipo,
    marca: f.marca,
    donde: f.donde,
    ...a,
  })),
);

// El espejo del reporte: archivos de esas dos carpetas que no le tocan a
// ningún código del Excel.
const reclamados = new Set(detalle.map((d) => d.ruta));
const archivosSinCodigo = archivos
  .filter((a) => !reclamados.has(a.ruta))
  .map((a) => ({
    ...a,
    raiz: a.ruta.toUpperCase().startsWith("V:\\LESLY") ? "V:\\LESLY" : "V:\\PROYECTO ASIGNADO - JEAN PAUL",
  }))
  .sort((a, b) => b.modificado.localeCompare(a.modificado));

// ---------- 4. Qué se movió desde la v1 ----------
//
// Se compara contra el JSON que dejó el script de la v1, no contra el Excel
// que está en V:\ — ese fue editado a mano en Excel el 27-08 a las 16:50 y ya
// no es la salida de ningún programa.

let cambios = null;
if (fs.existsSync(V1)) {
  const v1 = JSON.parse(fs.readFileSync(V1, "utf8"));
  const antes = new Map(v1.filas.map((f) => [f.codigo, f]));
  const lineas = [];
  for (const f of filas) {
    const a = antes.get(f.codigo);
    if (!a) {
      lineas.push({ tipo: "CODIGO NUEVO", codigo: f.codigo, equipo: f.equipo, libros: f.libros.join(" + "),
        detalle: f.encontrado ? `entra CON ficha: ${f.archivos[0].nombre}` : "entra SIN ficha" });
    } else if (a.encontrado !== f.encontrado) {
      lineas.push({ tipo: f.encontrado ? "GANO FICHA" : "PERDIO FICHA", codigo: f.codigo, equipo: f.equipo,
        libros: f.libros.join(" + "), detalle: f.encontrado ? f.archivos[0].nombre : "el archivo que la tenia ya no esta" });
    } else if (a.cuantos !== f.cuantos) {
      lineas.push({ tipo: "CAMBIO Nº DE ARCHIVOS", codigo: f.codigo, equipo: f.equipo, libros: f.libros.join(" + "),
        detalle: `${a.cuantos} → ${f.cuantos}` });
    }
    if (a && a.precio !== f.precio) {
      lineas.push({ tipo: "CAMBIO DE PRECIO", codigo: f.codigo, equipo: f.equipo, libros: f.libros.join(" + "),
        detalle: `${a.precio ?? "(vacio)"} → ${f.precio ?? "(vacio)"}` });
    }
    if (a && String(a.stock ?? "") !== String(f.stock ?? "")) {
      lineas.push({ tipo: "CAMBIO DE STOCK", codigo: f.codigo, equipo: f.equipo, libros: f.libros.join(" + "),
        detalle: `${a.stock ?? "(vacio)"} → ${f.stock ?? "(vacio)"}` });
    }
  }
  const hoy = new Set(filas.map((f) => f.codigo));
  for (const [c, a] of antes) {
    if (!hoy.has(c)) lineas.push({ tipo: "CODIGO QUE YA NO ESTA", codigo: c, equipo: a.equipo, libros: (a.libros ?? []).join(" + "), detalle: "salio de los Excels" });
  }
  const orden = ["CODIGO NUEVO", "CODIGO QUE YA NO ESTA", "GANO FICHA", "PERDIO FICHA", "CAMBIO Nº DE ARCHIVOS", "CAMBIO DE PRECIO", "CAMBIO DE STOCK"];
  lineas.sort((x, y) => orden.indexOf(x.tipo) - orden.indexOf(y.tipo) || x.codigo.localeCompare(y.codigo));
  cambios = { generadoV1: v1.generado, codigosV1: v1.filas.length, encontradosV1: v1.filas.filter((f) => f.encontrado).length, lineas };
}

const salida = {
  generado: fechaLocal(new Date()),
  version: 2,
  raices: RAICES,
  totales: {
    codigos: filas.length,
    encontrados: encontrados.length,
    noEncontrados: filas.length - encontrados.length,
    porNombre: filas.filter((f) => f.donde === "Nombre del archivo").length,
    porCarpeta: filas.filter((f) => f.donde === "Nombre de la carpeta").length,
    porTexto: filas.filter((f) => f.donde === "Texto dentro del Word").length,
    archivosRevisados: archivos.length,
    words: archivos.filter((a) => a.tipo !== "PDF").length,
    pdfs: archivos.filter((a) => a.tipo === "PDF").length,
    archivosSinCodigo: archivosSinCodigo.length,
    codigoRepetido: codigoRepetido.length,
    equipoConVariosCodigos: equipoConVariosCodigos.length,
    noDicenLoMismo: noDicenLoMismo.length,
    cambios: cambios ? cambios.lineas.length : 0,
  },
  libros: LIBROS.map((l) => ({ archivo: l.archivo, corto: l.corto, hojas: l.hojas === "*" ? "todas" : l.hojas.map((h) => h.nombre).join(", ") })),
  // Cuántas filas del reporte tiene vigente cada libro. Es la forma de ver de
  // un vistazo que lo del libro de modificaciones manda sobre los maestros.
  vigentePorLibro: LIBROS.map((l) => ({ libro: l.corto, filas: filas.filter((f) => f.manda === l.corto).length })),
  hojasLeidas: [...new Set(apariciones.map((a) => `${a.libro} / ${a.hoja}`))],
  hojasSinCodigo,
  codigoRepetido,
  equipoConVariosCodigos,
  noDicenLoMismo,
  cambios,
  filas,
  detalle,
  archivosSinCodigo,
};

fs.mkdirSync(path.dirname(SALIDA), { recursive: true });
fs.writeFileSync(SALIDA, JSON.stringify(salida, null, 1));

console.log(`Codigos en los 4 Excels ..... ${salida.totales.codigos}`);
console.log(`  ENCONTRADOS ............... ${salida.totales.encontrados}`);
console.log(`     por nombre de archivo .. ${salida.totales.porNombre}`);
console.log(`     por nombre de carpeta .. ${salida.totales.porCarpeta}`);
console.log(`     por texto del Word ..... ${salida.totales.porTexto}`);
console.log(`  NO ENCONTRADOS ............ ${salida.totales.noEncontrados}`);
console.log(`Archivos revisados .......... ${salida.totales.archivosRevisados} (${salida.totales.words} Word, ${salida.totales.pdfs} PDF)`);
console.log(`  sin codigo del Excel ...... ${salida.totales.archivosSinCodigo}`);
console.log(`Avisos de codificacion`);
console.log(`  codigo repetido en la hoja  ${salida.totales.codigoRepetido}`);
console.log(`  un equipo, varios codigos . ${salida.totales.equipoConVariosCodigos}`);
console.log(`  los Excels no dicen lo mismo ${salida.totales.noDicenLoMismo}`);
console.log(`Cambios desde la v1 ......... ${salida.totales.cambios}`);
console.log(`Dato vigente segun`);
for (const v of salida.vigentePorLibro) console.log(`  ${v.libro.padEnd(20)} ${v.filas}`);
console.log(`\nHojas leidas: ${salida.hojasLeidas.join(" | ")}`);
console.log(`JSON: ${SALIDA}`);
