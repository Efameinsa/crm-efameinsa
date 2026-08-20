// Genera el Excel que el ing. Carlos pidió en la reunión del 20-08: la lista
// de nombres que aparecen firmando las cotizaciones, para que él escriba al
// lado a qué código de comercial (C1..C10) corresponde cada uno.
//
// Por qué hace falta: los documentos vienen firmados con el NOMBRE de la
// persona, y el CRM trabaja por código porque las carteras se traspasan entre
// comerciales ("lo que trabajaba José se lo pasamos a Katerine"). El código se
// deduce del correo de la firma (comercialN@…) cuando está, pero 426
// cotizaciones no lo traen.
//
// OJO — el nombre y el código NO siempre coinciden: copian la plantilla de un
// compañero y cambian el nombre pero no el correo (o al revés). Por eso la
// columna "código detectado" muestra TODOS los que aparecieron junto a ese
// nombre y con qué frecuencia, en vez de uno solo que daría falsa confianza.
//
// Uso: node scripts/lista-asesores-cotizaciones.mjs

import { readFileSync } from "node:fs";
import XLSX from "xlsx";

const ORIGEN = "scripts/data/cotizaciones-historicas.json";
const SALIDA = "docs/asesores-a-identificar.xlsx";

const cot = JSON.parse(readFileSync(ORIGEN, "utf8"));
const clave = (n) => n.trim().toUpperCase().replace(/\s+/g, " ").replace(/\.$/, "");

const porNombre = new Map();
for (const c of cot) {
  const n = (c.asesorNombre ?? "").trim();
  if (!n) continue;
  const k = clave(n);
  if (!porNombre.has(k)) porNombre.set(k, { nombre: n, n: 0, cods: new Map(), series: new Set(), anios: new Set() });
  const e = porNombre.get(k);
  e.n++;
  if (c.asesorCodigo) e.cods.set(c.asesorCodigo, (e.cods.get(c.asesorCodigo) ?? 0) + 1);
  e.series.add(c.serie);
  if (c.anio) e.anios.add(c.anio);
}

const filas = [...porNombre.values()]
  .sort((a, b) => b.n - a.n)
  .map((e) => {
    const cods = [...e.cods.entries()].sort((a, b) => b[1] - a[1]);
    return {
      "Nombre en la firma": e.nombre,
      "Cotizaciones": e.n,
      "Código en el correo": cods.length ? cods.map(([c, n]) => `${c} (${n})`).join(", ") : "— sin correo —",
      "Años": [...e.anios].sort().join(", "),
      "Empresa": [...e.series].sort().join(" / "),
      "¿QUÉ CÓDIGO ES? (llenar)": "",
      "Observación de gerencia": "",
    };
  });

// Las que no tienen ni nombre ni código: no hay nada que preguntar, se listan
// aparte para que se sepa cuántas quedan sin dueño y desde cuándo.
const huerfanas = cot.filter((c) => !c.asesorNombre && !c.asesorCodigo);
const porAnio = new Map();
for (const c of huerfanas) {
  const k = `${c.anio ?? "sin año"} · ${c.serie}`;
  porAnio.set(k, (porAnio.get(k) ?? 0) + 1);
}
const filasHuerfanas = [...porAnio.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => {
    const [anio, serie] = k.split(" · ");
    return { "Año": anio, "Empresa": serie, "Cotizaciones sin firma legible": n };
  });

const wb = XLSX.utils.book_new();

const hoja = XLSX.utils.json_to_sheet(filas);
hoja["!cols"] = [{ wch: 34 }, { wch: 12 }, { wch: 26 }, { wch: 22 }, { wch: 18 }, { wch: 24 }, { wch: 30 }];
XLSX.utils.book_append_sheet(wb, hoja, "Asesores");

const hoja2 = XLSX.utils.json_to_sheet(filasHuerfanas);
hoja2["!cols"] = [{ wch: 12 }, { wch: 14 }, { wch: 28 }];
XLSX.utils.book_append_sheet(wb, hoja2, "Sin firma legible");

// Hoja de instrucciones: el archivo va a viajar por WhatsApp y tiene que
// explicarse solo, sin que Darwin esté al lado.
const notas = [
  ["LISTA DE ASESORES A IDENTIFICAR — CRM Efameinsa"],
  [""],
  ["Para qué es esto"],
  ["Se cargaron al CRM 5.870 cotizaciones de los archivos de la empresa (2022-2026, Efameinsa y Open)."],
  ["Los documentos vienen firmados con el NOMBRE de la persona, pero el CRM trabaja por código (C1, C2, …)"],
  ["porque las carteras se traspasan entre comerciales."],
  [""],
  ["Qué se necesita de gerencia"],
  ["En la hoja «Asesores», en la columna «¿QUÉ CÓDIGO ES? (llenar)», escribir el código que corresponde"],
  ["a cada nombre. Con eso las cotizaciones quedan atribuidas a su comercial y los reportes salen completos."],
  [""],
  ["Importante al revisar"],
  ["· La columna «Código en el correo» es lo que el CRM dedujo del correo de la firma (comercialN@…),"],
  ["  con la cantidad de veces que apareció. NO siempre es correcto: cuando alguien copia la plantilla de"],
  ["  un compañero, queda el nombre de uno y el correo del otro. Por eso se muestran todos los que salieron."],
  ["· Si una persona trabajó con más de un código a lo largo del tiempo, indicarlo en «Observación»"],
  ["  (por ejemplo: «C8 hasta junio 2026, luego C1»)."],
  ["· El código C10 aparece en 7 cotizaciones de 2025 y hoy no existe como comercial en el sistema."],
  [""],
  [`Generado el ${new Date().toLocaleDateString("es-PE")} · Santos Lenin Vilcachagua Ayala`],
];
const hoja3 = XLSX.utils.aoa_to_sheet(notas);
hoja3["!cols"] = [{ wch: 110 }];
XLSX.utils.book_append_sheet(wb, hoja3, "Instrucciones");

XLSX.writeFile(wb, SALIDA);

console.log(`✓ ${SALIDA}`);
console.log(`  ${filas.length} nombres distintos en las firmas`);
console.log(`  ${cot.filter((c) => c.asesorNombre && !c.asesorCodigo).length} cotizaciones con nombre pero sin código en el correo`);
console.log(`  ${huerfanas.length} cotizaciones sin firma legible (hoja aparte)`);
console.log(`  cubre ${cot.length} cotizaciones en total`);
