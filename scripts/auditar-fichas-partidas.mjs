// ============================================================
// CRM EFAMEINSA · Clientes partidos: una ficha con documento y otras sin él
// ============================================================
// El 27-08 se revisaron cuatro clientes a pedido de los comerciales —FISA, San
// Andrés, Zercom y San Agustín— y los cuatro estaban partidos, siempre con el
// mismo patrón: UNA ficha con RUC y una o más con el mismo nombre y sin
// documento. En San Agustín eso hizo que Katerine no viera su venta de US$
// 21.000: estaba en una ficha y el seguimiento de la semana en otra.
//
// `fusionar-cuentas-mismo-nombre.mjs` no cubre este caso: mira solo entre las
// cuentas SIN documento, para unirlas entre ellas. Acá se busca lo otro.
//
// ESTE SCRIPT NO FUSIONA NADA. Lista y clasifica, porque nombre idéntico no
// prueba que sean la misma empresa y estas fusiones mueven ventas.
//
//   · LISTAS      — la ficha sin documento no arrastra nada (0 oportunidades,
//                   0 ventas, 0 presupuestos, 0 gestiones). Fusionarla no puede
//                   perder información: es una ficha vacía duplicada.
//   · CON HISTORIA— las dos tienen trabajo encima. Son las que más valen —es el
//                   caso de San Agustín— y las que hay que mirar de a una.
//   · GRUPO       — hay dos o más documentos DISTINTOS bajo el mismo nombre. Eso
//                   no es un duplicado: puede ser el caso Moncal, dos RUC vivos
//                   de la misma casa. Van a grupo económico, no a fusión.
//
// Filtros de seguridad, los mismos que el script hermano: fuera los nombres
// comodín («SIN NOMBRE» está en 104 cuentas y son 104 clientes distintos) y
// fuera los nombres demasiado cortos para fiarse solo del texto.
//
// Uso: node --env-file=.env.local scripts/auditar-fichas-partidas.mjs

import { writeFileSync } from "node:fs";
import { Client } from "pg";
import XLSX from "xlsx";
import { esComodin } from "./lib-fusionar-cuentas.mjs";

// Adónde va el Excel. En Descargas y no en el repo: son 665 clientes y el
// archivo se abre para mirarlo, no para versionarlo.
const EXCEL = "C:/Users/diseno/Downloads/fichas-partidas-crm-27-08.xlsx";

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const normalizar = (t) =>
  (t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "").trim();

const { rows: cuentas } = await bd.query(`
  select c.id, c.razon_social, c.num_doc, c.departamento, p.codigo_comercial duenio,
         (select count(*) from oportunidades o where o.cuenta_id=c.id)::int ops,
         (select count(*) from ventas v join oportunidades o on o.id=v.oportunidad_id where o.cuenta_id=c.id)::int ventas,
         (select coalesce(sum(v.monto_total),0) from ventas v join oportunidades o on o.id=v.oportunidad_id
           where o.cuenta_id=c.id)::numeric vendido,
         (select count(*) from actividades a join oportunidades o on o.id=a.oportunidad_id where o.cuenta_id=c.id)::int gestiones,
         (select count(*) from cotizaciones_historicas ch where ch.cuenta_id=c.id)::int presupuestos,
         (select count(*) from contactos ct where ct.cuenta_id=c.id)::int contactos
    from cuentas c left join perfiles p on p.id=c.comercial_id`);

const grupos = new Map();
for (const c of cuentas) {
  if (esComodin(c.razon_social)) continue;
  const clave = normalizar(c.razon_social);
  if (clave.length < 12) continue;
  if (!grupos.has(clave)) grupos.set(clave, []);
  grupos.get(clave).push(c);
}

const listas = [], conHistoria = [], gruposEconomicos = [], reparto = [];
for (const [, fichas] of grupos) {
  if (fichas.length < 2) continue;
  const conDoc = fichas.filter((f) => f.num_doc);
  const sinDoc = fichas.filter((f) => !f.num_doc);

  const docsDistintos = new Set(conDoc.map((f) => f.num_doc));
  if (docsDistintos.size > 1) { gruposEconomicos.push(fichas); continue; }
  if (conDoc.length === 0 || sinDoc.length === 0) continue;  // lo cubre el otro script

  // EL CORTE QUE DE VERDAD IMPORTA: si las fichas son de comerciales distintos,
  // fusionarlas no es limpiar datos — es decidir de quién es el cliente y de
  // quién son sus ventas. NEWREST tiene US$ 20.299 en la ficha de C1 y US$
  // 3.599 en la de C5. Eso lo decide gerencia, no un script.
  const dueños = new Set(fichas.map((f) => f.duenio).filter(Boolean));
  if (dueños.size > 1) { reparto.push(fichas); continue; }

  const arrastra = (f) => f.ops + f.ventas + f.gestiones + f.presupuestos;
  (sinDoc.every((f) => arrastra(f) === 0) ? listas : conHistoria).push(fichas);
}

const pinta = (fichas) => fichas.map((f) =>
  `      ${f.num_doc ? `RUC ${f.num_doc}` : "sin documento"} · ${f.duenio ?? "sin dueño"} · ` +
  `${f.ops} op · ${f.ventas} venta(s) US$ ${Number(f.vendido).toLocaleString("es-PE")} · ` +
  `${f.gestiones} gestiones · ${f.presupuestos} ppto · ${f.contactos} contactos`).join("\n");

let informe = "";
const seccion = (titulo, lista) => {
  informe += `\n${"=".repeat(78)}\n${titulo} — ${lista.length} clientes\n${"=".repeat(78)}\n`;
  for (const fichas of lista.sort((a, b) =>
    b.reduce((s, f) => s + Number(f.vendido), 0) - a.reduce((s, f) => s + Number(f.vendido), 0))) {
    informe += `\n  ${fichas[0].razon_social}   [${fichas.length} fichas]\n${pinta(fichas)}\n`;
  }
};

seccion("DE COMERCIALES DISTINTOS — lo decide gerencia, no un script", reparto);
seccion("CON HISTORIA EN LAS DOS, MISMO DUEÑO — mirar de a una (caso San Agustín)", conHistoria);
seccion("LISTAS PARA FUSIONAR — la ficha sin documento está vacía", listas);
seccion("¿GRUPO ECONÓMICO? — dos documentos distintos (caso Moncal)", gruposEconomicos);

writeFileSync("docs/fichas-partidas-27-08.txt", informe, "utf8");

// ── El mismo censo en Excel, para poder filtrar y ordenar ──────────────────
// Una fila por FICHA, no por cliente, con un número de grupo que las junta:
// así se puede ordenar por plata o por comercial sin perder de vista cuáles
// van con cuáles. La columna «decisión» queda vacía a propósito, para que la
// llenen Carlos o el comercial y me la devuelvan.
const libro = XLSX.utils.book_new();
const hoja = (nombre, lista, nota) => {
  const filas = [];
  lista.forEach((fichas, i) => {
    const total = fichas.reduce((s, f) => s + Number(f.vendido), 0);
    fichas.forEach((f, j) => filas.push({
      grupo: i + 1,
      cliente: j === 0 ? fichas[0].razon_social : "",
      ficha: f.razon_social,
      documento: f.num_doc ?? "(sin documento)",
      comercial: f.duenio ?? "sin dueño",
      departamento: f.departamento ?? "",
      oportunidades: f.ops,
      ventas: f.ventas,
      vendido_usd: Number(f.vendido),
      gestiones: f.gestiones,
      presupuestos: f.presupuestos,
      contactos: f.contactos,
      total_del_grupo_usd: j === 0 ? total : "",
      decision: "",
      id: f.id,
    }));
    filas.push({});
  });
  const h = XLSX.utils.json_to_sheet(filas.length ? filas : [{ aviso: nota }]);
  h["!cols"] = [{ wch: 6 }, { wch: 44 }, { wch: 44 }, { wch: 15 }, { wch: 10 }, { wch: 14 },
                { wch: 13 }, { wch: 7 }, { wch: 13 }, { wch: 10 }, { wch: 13 }, { wch: 10 },
                { wch: 18 }, { wch: 22 }, { wch: 38 }];
  h["!autofilter"] = { ref: h["!ref"] };
  XLSX.utils.book_append_sheet(libro, h, nombre);
};

const resumen = [
  { grupo: "De comerciales DISTINTOS", clientes: reparto.length, ventas_usd: plataDe(reparto),
    que_hacer: "Lo decide gerencia: fusionar define de quién es el cliente y de quién son sus ventas" },
  { grupo: "Mismo dueño, con historia", clientes: conHistoria.length, ventas_usd: plataDe(conHistoria),
    que_hacer: "Fusionar (caso San Agustín). Sin conflicto de cartera" },
  { grupo: "Listas, la vacía no arrastra nada", clientes: listas.length, ventas_usd: plataDe(listas),
    que_hacer: "Fusionar sin riesgo: la ficha sin documento está vacía" },
  { grupo: "Dos documentos distintos", clientes: gruposEconomicos.length, ventas_usd: plataDe(gruposEconomicos),
    que_hacer: "Grupo económico, NO fusión (caso Moncal): dos RUC vivos de la misma casa" },
];
const hr = XLSX.utils.json_to_sheet(resumen);
hr["!cols"] = [{ wch: 36 }, { wch: 10 }, { wch: 14 }, { wch: 90 }];
XLSX.utils.book_append_sheet(libro, hr, "RESUMEN");

hoja("1 comerciales distintos", reparto);
hoja("2 mismo dueño", conHistoria);
hoja("3 listas", listas);
hoja("4 dos RUC", gruposEconomicos);
XLSX.writeFile(libro, EXCEL);
function plataDe(l) { return l.reduce((s, f) => s + f.reduce((t, x) => t + Number(x.vendido), 0), 0); }

const plata = (l) => l.reduce((s, fichas) => s + fichas.reduce((t, f) => t + Number(f.vendido), 0), 0);
console.log(`\n${"─".repeat(70)}`);
console.log("  CLIENTES PARTIDOS EN EL CRM");
console.log(`${"─".repeat(70)}`);
console.log(`  De comerciales DISTINTOS (gerencia) : ${String(reparto.length).padStart(4)}   US$ ${plata(reparto).toLocaleString("es-PE")} en juego`);
console.log(`  Mismo dueño, con historia (mirar)   : ${String(conHistoria.length).padStart(4)}   US$ ${plata(conHistoria).toLocaleString("es-PE")}`);
console.log(`  Listas para fusionar (sin riesgo)   : ${String(listas.length).padStart(4)}   US$ ${plata(listas).toLocaleString("es-PE")}`);
console.log(`  Posibles grupos económicos          : ${String(gruposEconomicos.length).padStart(4)}   US$ ${plata(gruposEconomicos).toLocaleString("es-PE")}`);
console.log(`${"─".repeat(70)}`);
console.log("  Detalle completo en docs/fichas-partidas-27-08.txt\n");

console.log("Los 6 que tocan a DOS comerciales con más plata en juego:\n");
for (const fichas of reparto.slice(0, 6)) {
  console.log(`  ${fichas[0].razon_social}  [${fichas.length} fichas]`);
  console.log(pinta(fichas) + "\n");
}
await bd.end();
