// Los expedientes partidos que NO se pueden unir automáticamente, en Excel
// para que Ariana, Brenda y Katerine confirmen cuáles son el mismo cliente.
//
// Salen de fusionar-expedientes-partidos.mjs: mismo nombre y mismo comercial,
// una ficha con documento y otra sin, pero sin señal suficiente para afirmar
// que son la misma empresa (nombre corto, departamentos distintos, o la ficha
// sin documento calza con dos RUC diferentes). Fusionarlas a ciegas juntaría
// clientes que no tienen nada que ver, y eso no se deshace.
//
// La hoja trae de cada lado lo que hace falta para decidir sin abrir el CRM:
// dónde está, qué teléfono tiene, cuántas gestiones lleva, cuándo fue la
// última y qué dice la última nota. La columna «¿SON EL MISMO?» va vacía a
// propósito: la llena el comercial con SÍ o NO.
//
// Uso: node --env-file=.env.local scripts/excel-expedientes-a-revisar.mjs

import { readFileSync } from "node:fs";
import { Client } from "pg";
import * as XLSX from "xlsx";

const FUENTE = process.argv[2] ?? `scripts/data/fusion-expedientes-partidos-${new Date().toISOString().slice(0, 10)}.json`;
const SALIDA = process.argv[3] ?? "C:/Users/diseno/Downloads/expedientes-a-revisar.xlsx";

const { aRevisar } = JSON.parse(readFileSync(FUENTE, "utf8"));

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

// Lo que se necesita para reconocer al cliente de un vistazo. La última nota
// es lo que más decide: dos fichas del mismo señor cuentan la misma historia.
async function retrato(cuentaId) {
  const { rows } = await bd.query(
    `select c.razon_social, c.tipo_doc, c.num_doc, c.departamento, c.provincia, c.distrito, c.direccion,
            (select string_agg(distinct t.telefono, ' / ') from contactos t where t.cuenta_id = c.id) telefonos,
            (select count(*) from oportunidades o where o.cuenta_id = c.id)::int oportunidades,
            (select count(*) from actividades a join oportunidades o on o.id = a.oportunidad_id
              where o.cuenta_id = c.id)::int gestiones,
            (select max(a.realizada_at) from actividades a join oportunidades o on o.id = a.oportunidad_id
              where o.cuenta_id = c.id) ultima_gestion,
            (select string_agg(distinct o.etapa::text, ', ') from oportunidades o where o.cuenta_id = c.id) etapas,
            (select a.nota from actividades a join oportunidades o on o.id = a.oportunidad_id
              where o.cuenta_id = c.id order by a.realizada_at desc limit 1) ultima_nota
       from cuentas c where c.id = $1`,
    [cuentaId],
  );
  return rows[0];
}

const fecha = (v) => (v ? new Date(v).toLocaleDateString("es-PE") : "");
const recortar = (t, n = 220) => {
  const limpio = String(t ?? "").replace(/\s+/g, " ").trim();
  return limpio.length > n ? `${limpio.slice(0, n)}…` : limpio;
};

const filas = [];
for (const r of aRevisar) {
  const a = await retrato(r.sindoc_id);
  const b = await retrato(r.condoc_id);
  filas.push({
    "Comercial": r.comercial ?? "",
    "Cliente": recortar(r.sindoc_nombre, 80),
    "¿SON EL MISMO?": "",
    "Por qué hay que mirarlo": r.porque,

    "A · documento": "sin documento",
    "A · dónde": [a.departamento, a.provincia, a.distrito].filter(Boolean).join(" / "),
    "A · dirección": recortar(a.direccion, 90),
    "A · teléfono": a.telefonos ?? "",
    "A · gestiones": a.gestiones,
    "A · última gestión": fecha(a.ultima_gestion),
    "A · etapas": a.etapas ?? "",
    "A · última nota": recortar(a.ultima_nota),

    "B · documento": `${b.tipo_doc} ${b.num_doc}`,
    "B · dónde": [b.departamento, b.provincia, b.distrito].filter(Boolean).join(" / "),
    "B · dirección": recortar(b.direccion, 90),
    "B · teléfono": b.telefonos ?? "",
    "B · gestiones": b.gestiones,
    "B · última gestión": fecha(b.ultima_gestion),
    "B · etapas": b.etapas ?? "",
    "B · última nota": recortar(b.ultima_nota),

    "id A": r.sindoc_id,
    "id B": r.condoc_id,
  });
}

// El comercial busca por su nombre primero, y dentro por cliente.
filas.sort((x, y) => (x.Comercial + x.Cliente).localeCompare(y.Comercial + y.Cliente, "es"));

const hoja = XLSX.utils.json_to_sheet(filas);
hoja["!cols"] = [
  { wch: 16 }, { wch: 42 }, { wch: 16 }, { wch: 46 },
  { wch: 14 }, { wch: 26 }, { wch: 30 }, { wch: 18 }, { wch: 11 }, { wch: 15 }, { wch: 22 }, { wch: 60 },
  { wch: 16 }, { wch: 26 }, { wch: 30 }, { wch: 18 }, { wch: 11 }, { wch: 15 }, { wch: 22 }, { wch: 60 },
  { wch: 38 }, { wch: 38 },
];
hoja["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 21, r: filas.length } }) };
hoja["!freeze"] = { xSplit: 2, ySplit: 1 };

const guia = XLSX.utils.aoa_to_sheet([
  ["Expedientes a revisar — clientes que quedaron en dos fichas"],
  [],
  ["Qué es esto"],
  ["Al cargar los Excel de agosto al CRM, un mismo cliente quedó a veces en DOS fichas: una con su RUC o DNI"],
  ["y otra sin documento. Pasaba cuando en el Excel solo la primera fila del cliente traía el documento y las"],
  ["siguientes venían con esa casilla vacía. Cada ficha se quedó con una parte de la gestión, y por eso el"],
  ["seguimiento «que falta» aparece cortado."],
  [],
  ["Ya se unieron solas 391 fichas donde no había ninguna duda (mismo teléfono o mismo departamento)."],
  ["Estas 111 NO se tocaron: el nombre coincide, pero no alcanza para afirmar que sean el mismo cliente."],
  [],
  ["Qué hay que hacer"],
  ["Mirar la columna A (ficha sin documento) y la columna B (ficha con documento) y decidir si son la MISMA"],
  ["persona o empresa. Escribir SÍ o NO en la columna «¿SON EL MISMO?». Lo que más ayuda a decidir es la"],
  ["última nota de cada lado: si las dos cuentan la misma historia, es el mismo cliente."],
  [],
  ["Con los SÍ se unen las dos fichas en una sola: no se pierde nada, toda la gestión de las dos queda junta"],
  ["y la ficha que queda se lleva el RUC. Los NO se dejan como están."],
  [],
  ["⚠️ Ante la duda, NO. Unir dos clientes distintos no se puede deshacer."],
]);
guia["!cols"] = [{ wch: 105 }];

const libro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(libro, guia, "Cómo se llena");
XLSX.utils.book_append_sheet(libro, hoja, "A revisar");
XLSX.writeFile(libro, SALIDA);

console.log(`${filas.length} casos escritos en ${SALIDA}`);
await bd.end();
