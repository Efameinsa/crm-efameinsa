// Reporte de lo que falta en V:\LESLY, para entregarle a Lesly (logística).
// Lee el cruce ya hecho (scripts/data/cruce-codificacion-equipos-*.json,
// generado por cruzar-codificacion-equipos.mjs) y arma un Excel con:
//   - Pendientes: código que no tiene catálogo y/o especificación técnica.
//   - Códigos duplicados: el mismo CÓDIGO usado para dos equipos distintos
//     en el Excel maestro (rompe la idea de que el código identifica un
//     único producto — hay que pedir que se separen).
//
// Uso: node scripts/reporte-pendientes-lesly.mjs [ruta-al-cruce.json] [salida.xlsx]

import XLSX from "xlsx";
import { readFileSync } from "node:fs";

const ENTRADA = process.argv[2] ?? "scripts/data/cruce-definitivo-2026-08-22.json";
const SALIDA = process.argv[3] ?? "V:/SANTOS/Pendientes catalogo y especificaciones - para Lesly.xlsx";

const bruto = JSON.parse(readFileSync(ENTRADA, "utf-8"));
const datos = bruto.productos;
const { malNombrados = [], intercambios = [], discrepanciasDeModelo = [] } = bruto;
const soloNombre = (r) => r.split(/[\\/]/).pop();

function tieneSpec(d) {
  return Boolean(d.especificacion) || Boolean(d.especificacionAprox?.length);
}
function tieneCat(d) {
  return Boolean(d.catalogos?.length);
}
function revisarTipo(d, tipo) {
  return d.revisar?.find((r) => r.tipo === tipo) ?? null;
}

// "Pendientes" = no hay NADA, ni siquiera un candidato para revisar — esto
// es lo que realmente hay que pedirle a Lesly/al proveedor.
const pendientes = datos
  .filter((d) => (!tieneSpec(d) && !revisarTipo(d, "especificacion")) || (!tieneCat(d) && !revisarTipo(d, "catalogo")))
  .map((d) => ({
    "CÓDIGO": d.codigo,
    "MARCA": d.marca,
    "EQUIPO": d.equipo,
    "FALTA":
      !tieneSpec(d) && !revisarTipo(d, "especificacion") && !tieneCat(d) && !revisarTipo(d, "catalogo")
        ? "Catálogo y especificación técnica"
        : !tieneSpec(d) && !revisarTipo(d, "especificacion")
          ? "Especificación técnica"
          : "Catálogo",
  }))
  .sort((a, b) => (a["FALTA"] === b["FALTA"] ? a["CÓDIGO"].localeCompare(b["CÓDIGO"]) : a["FALTA"].localeCompare(b["FALTA"])));

// "Por confirmar" = SÍ hay candidato(s) (encontrados en el barrido de todo
// V:\), pero más de uno o sin coincidencia exacta de nombre — no se eligió
// solo, hay que abrirlos y confirmar cuál es.
const porConfirmar = datos
  .filter((d) => d.revisar?.length)
  .flatMap((d) =>
    d.revisar.map((r) => ({
      "CÓDIGO": d.codigo,
      "MARCA": d.marca,
      "EQUIPO": d.equipo,
      "TIPO": r.tipo === "especificacion" ? "Especificación técnica" : "Catálogo",
      "CANDIDATOS": r.candidatos.join("\n"),
    })),
  );

const conteo = {};
for (const d of datos) conteo[d.codigo] = (conteo[d.codigo] ?? []).concat(d);
const duplicados = Object.entries(conteo)
  .filter(([, filas]) => filas.length > 1)
  .flatMap(([codigo, filas]) =>
    filas.map((d, i) => ({
      "CÓDIGO": codigo,
      "VARIANTE": i + 1,
      "MARCA": d.marca,
      "EQUIPO": d.equipo,
    })),
  );

const wb = XLSX.utils.book_new();

const hoja1 = XLSX.utils.json_to_sheet(pendientes);
hoja1["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 90 }, { wch: 32 }];
XLSX.utils.book_append_sheet(wb, hoja1, "Pendientes");

const hoja2 = XLSX.utils.json_to_sheet(porConfirmar);
hoja2["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 70 }, { wch: 18 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, hoja2, "Por confirmar");

const hoja3 = XLSX.utils.json_to_sheet(duplicados);
hoja3["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 90 }];
XLSX.utils.book_append_sheet(wb, hoja3, "Codigos duplicados");

// Estas tres hojas solo se pueden armar leyendo DENTRO de cada ficha: un
// cruce por nombre de archivo no las ve. Son errores a corregir en origen.
const filasMalNombradas = malNombrados.map((m) => ({
  "ARCHIVO": soloNombre(m.ruta),
  "GUARDADO COMO": m.codigoEnElArchivo,
  "PERO SU CONTENIDO ES DE": m.codigoReal,
  "EQUIPO SEGÚN EL MAESTRO": m.equipo,
  "EVIDENCIA EN EL CONTENIDO": m.evidencia.join(", "),
  "DETALLE": m.motivo,
  "CARPETA": m.ruta,
}));
const hoja4 = XLSX.utils.json_to_sheet(filasMalNombradas);
hoja4["!cols"] = [{ wch: 60 }, { wch: 15 }, { wch: 22 }, { wch: 60 }, { wch: 60 }, { wch: 70 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, hoja4, "Fichas mal nombradas");

const filasIntercambios = intercambios.flatMap(([a, b]) =>
  [a, b].map((x) => ({
    "PAR": `${a.codigoReal} ↔ ${b.codigoReal}`,
    "ARCHIVO": soloNombre(x.ruta),
    "GUARDADO COMO": x.codigoEnElArchivo,
    "DEBERÍA SER": x.codigoReal,
    "EVIDENCIA": x.evidencia.join(", "),
  })),
);
const hoja5 = XLSX.utils.json_to_sheet(filasIntercambios);
hoja5["!cols"] = [{ wch: 20 }, { wch: 60 }, { wch: 15 }, { wch: 15 }, { wch: 70 }];
XLSX.utils.book_append_sheet(wb, hoja5, "Codigos intercambiados");

const filasDiscrepancia = discrepanciasDeModelo.map((d) => ({
  "CÓDIGO": d.codigo,
  "ARCHIVO": soloNombre(d.ruta),
  "MODELO SEGÚN EL EXCEL": d.modeloSegunMaestro,
  "EQUIPO SEGÚN EL EXCEL": d.equipoSegunMaestro,
  "LA FICHA PARECE SER DE": d.pareceSer,
  "EQUIPO DE ESE OTRO CÓDIGO": d.equipoQueParece,
}));
const hoja6 = XLSX.utils.json_to_sheet(filasDiscrepancia);
hoja6["!cols"] = [{ wch: 12 }, { wch: 60 }, { wch: 22 }, { wch: 60 }, { wch: 22 }, { wch: 60 }];
XLSX.utils.book_append_sheet(wb, hoja6, "Discrepancia Excel-ficha");

XLSX.writeFile(wb, SALIDA);

console.log(`Pendientes (nada encontrado): ${pendientes.length} códigos (de ${datos.length} filas / ${Object.keys(conteo).length} códigos únicos)`);
console.log(`  - sin catálogo Y sin especificación: ${pendientes.filter((p) => p["FALTA"].includes("y")).length}`);
console.log(`  - solo falta especificación técnica: ${pendientes.filter((p) => p["FALTA"] === "Especificación técnica").length}`);
console.log(`  - solo falta catálogo: ${pendientes.filter((p) => p["FALTA"] === "Catálogo").length}`);
console.log(`Por confirmar (hay candidatos, revisar cuál corresponde): ${new Set(porConfirmar.map((p) => p["CÓDIGO"])).size} códigos`);
console.log(`Códigos duplicados (mismo código, dos equipos distintos): ${duplicados.length / 2}`);
console.log(`Fichas mal nombradas: ${malNombrados.length} · intercambios: ${intercambios.length} · discrepancias Excel↔ficha: ${discrepanciasDeModelo.length}`);
console.log(`\nEscrito: ${SALIDA}`);
