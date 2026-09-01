// ============================================================
// CRM EFAMEINSA · Aplicar lo que Lesly decidió en docs/servicios-sin-cliente.xlsx
// ============================================================
// Es la segunda mitad de `reporte-servicios-sin-cliente.mjs`. Aquel arma el
// Excel con los pedidos de postventa que no tienen cliente y hasta tres fichas
// candidatas por pedido; Lesly (operaciones) escribe en «Elegir ficha (RUC)»
// cuál es la buena, el archivo vuelve, y este script enlaza cada pedido
// (`servicios_postventa.cuenta_id`) a esa ficha.
//
// LO QUE ACEPTA EN «Elegir ficha (RUC)»:
//   · un RUC o DNI (8 u 11 dígitos): tiene que existir en `cuentas.num_doc` y
//     ser de UNA sola ficha. Si dos fichas comparten el número —pasa, hay
//     clientes partidos con el mismo RUC— se rechaza y se le pide que señale
//     el candidato con «#1», «#2» o «#3».
//   · «#1», «#2», «#3»: la ficha de esa columna de candidatos, por su id
//     (columna «#n id»). Es la salida para las fichas históricas sin RUC.
//   · el id (uuid) de una ficha, por si la copia de la pantalla del CRM.
//   · «ninguna» / «ninguno» / «no» / «-»: se deja suelto a propósito.
//   · vacío: todavía no decidido; se salta y se cuenta.
//
// LO QUE NO HACE: no fusiona fichas (la hoja «Fichas partidas» es para otra
// decisión y otro script), no crea clientes, no cambia dueños de cartera, y
// no mueve un pedido que YA tiene cliente: si entre el reporte y la vuelta
// del archivo alguien lo enlazó a mano, se respeta lo que hay y se avisa.
//
// Por defecto corre en modo PLAN: dice qué haría, fila por fila, y no escribe
// nada. Con `--ejecutar` aplica los cambios en una sola transacción.
//
// Uso:
//   node --env-file=.env.local scripts/aplicar-servicios-sin-cliente.mjs
//   node --env-file=.env.local scripts/aplicar-servicios-sin-cliente.mjs --ejecutar
//   node --env-file=.env.local scripts/aplicar-servicios-sin-cliente.mjs --archivo=otra/ruta.xlsx
import { existsSync } from "node:fs";
import XLSX from "xlsx";
import { Client } from "pg";

const EJECUTAR = process.argv.includes("--ejecutar");
const ARCHIVO = process.argv.find((a) => a.startsWith("--archivo="))?.slice("--archivo=".length) || "docs/servicios-sin-cliente.xlsx";
const HOJA = "Pedidos sin cliente";
const COL_ID = "id del pedido";
const COL_CLIENTE = "Cliente como está en el Excel";
const COL_ELECCION = "Elegir ficha (RUC)";
const COL_NOTA = "Nota de Lesly";
const CANDIDATOS = 3;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DESCARTES = new Set(["ninguna", "ninguno", "no", "-", "n/a", "na"]);

if (!existsSync(ARCHIVO)) {
  console.error(`✗ No existe ${ARCHIVO}. Primero hay que generarlo con scripts/reporte-servicios-sin-cliente.mjs y que Lesly lo llene.`);
  process.exit(1);
}
const libro = XLSX.readFile(ARCHIVO);
const hoja = libro.Sheets[HOJA];
if (!hoja) {
  console.error(`✗ ${ARCHIVO} no tiene la hoja «${HOJA}». ¿Es el archivo correcto?`);
  process.exit(1);
}
// raw:false para que el RUC llegue como texto y no como 2.0556440981e10.
const filas = XLSX.utils.sheet_to_json(hoja, { defval: null, raw: false });

// Lo que escribió Lesly, normalizado: sin espacios, sin el «RUC:» que a veces
// se cuela, y en minúsculas para las palabras de descarte.
function leerEleccion(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return { tipo: "vacio" };
  const bajo = texto.toLowerCase();
  if (DESCARTES.has(bajo)) return { tipo: "descarte" };
  const cand = bajo.match(/^#?\s*([1-9])$/);
  if (cand) return { tipo: "candidato", n: Number(cand[1]) };
  if (UUID.test(texto)) return { tipo: "id", id: texto.toLowerCase() };
  const digitos = texto.replace(/^ruc\s*[:.]?\s*/i, "").replace(/[\s.-]/g, "");
  if (/^\d{8}$|^\d{11}$/.test(digitos)) return { tipo: "ruc", ruc: digitos };
  return { tipo: "raro", texto };
}

const bd = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await bd.connect();

const decisiones = [];   // { fila, servicio_id, cuenta_id, cuenta, motivo }
const problemas = [];    // { fila, cliente, eleccion, problema }
let vacias = 0;
let descartadas = 0;

for (let i = 0; i < filas.length; i++) {
  const fila = filas[i];
  const numero = i + 2; // fila del Excel (la 1 es el encabezado)
  const servicioId = String(fila[COL_ID] ?? "").trim().toLowerCase();
  const cliente = fila[COL_CLIENTE] ?? "";
  const eleccion = leerEleccion(fila[COL_ELECCION]);

  if (!UUID.test(servicioId)) {
    if (eleccion.tipo !== "vacio") problemas.push({ fila: numero, cliente, eleccion: fila[COL_ELECCION], problema: `la columna «${COL_ID}» no trae un id válido` });
    continue;
  }
  if (eleccion.tipo === "vacio") { vacias++; continue; }
  if (eleccion.tipo === "descarte") { descartadas++; continue; }
  if (eleccion.tipo === "raro") {
    problemas.push({ fila: numero, cliente, eleccion: eleccion.texto, problema: "no se entiende: se espera un RUC/DNI, #1/#2/#3, un id de ficha o «ninguna»" });
    continue;
  }

  // Resolver la ficha.
  let cuentas = [];
  let motivo = "";
  if (eleccion.tipo === "ruc") {
    ({ rows: cuentas } = await bd.query(`select id, razon_social, num_doc from cuentas where num_doc = $1 order by created_at`, [eleccion.ruc]));
    motivo = `RUC ${eleccion.ruc}`;
    if (!cuentas.length) {
      problemas.push({ fila: numero, cliente, eleccion: eleccion.ruc, problema: "ninguna ficha tiene ese RUC/DNI (¿hay que crear el cliente o ponerle el RUC a su ficha?)" });
      continue;
    }
    if (cuentas.length > 1) {
      problemas.push({
        fila: numero, cliente, eleccion: eleccion.ruc,
        problema: `${cuentas.length} fichas comparten ese RUC (${cuentas.map((c) => c.razon_social).join(" / ")}): señalar el candidato con #1, #2 o #3, o el id de la ficha`,
      });
      continue;
    }
  } else if (eleccion.tipo === "candidato") {
    if (eleccion.n > CANDIDATOS) {
      problemas.push({ fila: numero, cliente, eleccion: `#${eleccion.n}`, problema: `solo hay ${CANDIDATOS} candidatos por fila` });
      continue;
    }
    const id = String(fila[`#${eleccion.n} id`] ?? "").trim().toLowerCase();
    if (!UUID.test(id)) {
      problemas.push({ fila: numero, cliente, eleccion: `#${eleccion.n}`, problema: `esa fila no tiene candidato #${eleccion.n}` });
      continue;
    }
    ({ rows: cuentas } = await bd.query(`select id, razon_social, num_doc from cuentas where id = $1`, [id]));
    motivo = `candidato #${eleccion.n}`;
  } else {
    ({ rows: cuentas } = await bd.query(`select id, razon_social, num_doc from cuentas where id = $1`, [eleccion.id]));
    motivo = "id de ficha";
  }
  if (cuentas.length !== 1) {
    problemas.push({ fila: numero, cliente, eleccion: fila[COL_ELECCION], problema: "esa ficha ya no existe en la base (¿se fusionó o se borró?)" });
    continue;
  }
  const cuenta = cuentas[0];

  // Y el pedido, que tiene que seguir suelto.
  const { rows: servicios } = await bd.query(
    `select s.id, s.cliente_texto, s.cuenta_id, c.razon_social cuenta_actual
       from servicios_postventa s left join cuentas c on c.id = s.cuenta_id
      where s.id = $1`,
    [servicioId],
  );
  if (!servicios.length) {
    problemas.push({ fila: numero, cliente, eleccion: fila[COL_ELECCION], problema: "el pedido ya no existe en la base" });
    continue;
  }
  const servicio = servicios[0];
  if (servicio.cuenta_id) {
    if (servicio.cuenta_id === cuenta.id) {
      problemas.push({ fila: numero, cliente, eleccion: fila[COL_ELECCION], problema: `ya estaba enlazado a esa misma ficha (${cuenta.razon_social}); no hay nada que hacer` });
    } else {
      problemas.push({ fila: numero, cliente, eleccion: fila[COL_ELECCION], problema: `alguien ya lo enlazó a OTRA ficha (${servicio.cuenta_actual}); se respeta, revisar a mano` });
    }
    continue;
  }
  decisiones.push({ fila: numero, servicio_id: servicio.id, cliente: servicio.cliente_texto, cuenta_id: cuenta.id, cuenta: `${cuenta.razon_social}${cuenta.num_doc ? ` (${cuenta.num_doc})` : " (sin RUC)"}`, motivo, nota: fila[COL_NOTA] ?? "" });
}

// ---- El plan --------------------------------------------------------------
console.log(`\n${ARCHIVO} · hoja «${HOJA}» · ${filas.length} pedidos`);
console.log(`  sin decidir (vacías): ${vacias}`);
console.log(`  descartadas a propósito («ninguna»): ${descartadas}`);
console.log(`  con problema: ${problemas.length}`);
console.log(`  para enlazar: ${decisiones.length}`);

if (problemas.length) {
  console.log("\nPROBLEMAS (no se tocan; corregir en el Excel y volver a correr):");
  for (const p of problemas) console.log(`  fila ${p.fila} · ${p.cliente} · escribió «${p.eleccion ?? ""}» → ${p.problema}`);
}

if (decisiones.length) {
  console.log(`\n${EJECUTAR ? "ENLAZANDO" : "PLAN"} (${decisiones.length}):`);
  for (const d of decisiones) console.log(`  fila ${d.fila} · ${d.cliente} → ${d.cuenta} [${d.motivo}]${d.nota ? ` · nota: ${d.nota}` : ""}`);
}

if (!EJECUTAR) {
  console.log(decisiones.length
    ? "\nModo plan: no se escribió nada. Para aplicar: --ejecutar"
    : "\nNo hay nada para aplicar.");
  await bd.end();
  process.exit(0);
}

// ---- Aplicar, todo o nada -----------------------------------------------
if (!decisiones.length) {
  await bd.end();
  process.exit(0);
}
try {
  await bd.query("begin");
  let enlazados = 0;
  for (const d of decisiones) {
    // `and cuenta_id is null` por si algo cambió entre el plan y ahora.
    const r = await bd.query(`update servicios_postventa set cuenta_id = $1 where id = $2 and cuenta_id is null`, [d.cuenta_id, d.servicio_id]);
    if (r.rowCount !== 1) throw new Error(`el pedido de la fila ${d.fila} (${d.cliente}) cambió mientras se aplicaba; no se escribió nada`);
    enlazados += r.rowCount;
  }
  await bd.query("commit");
  console.log(`\n✓ ${enlazados} pedidos enlazados a su cliente.`);
  const { rows: [{ n }] } = await bd.query(`select count(*)::int n from servicios_postventa where cuenta_id is null`);
  console.log(`  Siguen sueltos: ${n}. Para verlos de nuevo con candidatos: scripts/reporte-servicios-sin-cliente.mjs`);
} catch (e) {
  await bd.query("rollback");
  console.error(`\n✗ ${e.message}`);
  process.exitCode = 1;
} finally {
  await bd.end();
}
