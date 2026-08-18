// B11 pieza 4: importa las 1,560 filas de scripts/data/ventas-historicas-COTIZ.json
// (hoja "VENTA" de los Excel históricos por comercial) como oportunidades en
// etapa 'venta' + fila en `ventas` cuando el monto es conocido.
//
// DECISIONES CONFIRMADAS POR DARWIN (2026-08-18), no inventar nada distinto:
//  1. Serie EFAMEINSA/OPEN: no se puede determinar históricamente -> se deja
//     en null (migración 0019 volvió la columna opcional solo para esto).
//  2. De 102 filas con RUC/DNI válido, 68 no calzan con ninguna cuenta ya
//     cargada -> se crea cuenta nueva con ese documento real (enlace confiable,
//     no es una suposición).
//  3. El 92% sin documento (1,458 filas) SÍ se importa igual (decisión
//     explícita: "sería malo no cargarlas, ya luego con más paciencia
//     buscamos más info"), pero NO se cruza por nombre contra las 14,270
//     cuentas ya cargadas -> eso arriesgaría enlazar una venta al cliente
//     equivocado. En vez de eso:
//       - si tiene teléfono, se intenta cruzar por telefono_normalizado
//         contra contactos ya existentes (señal confiable, no el nombre).
//       - si no hay cruce, se crea una cuenta NUEVA marcada tipo_doc='SIN_DOC'
//         con nota "falta RUC/DNI" para que el equipo la complete después.
//       - el dedup de estas cuentas nuevas es SOLO dentro de esta misma
//         corrida (por razón social normalizada) para no crear 30 cuentas
//         del mismo hotel si compró 30 veces; no es dedup contra la base.
//
// Filas sin monto (711 de 1560): igual se crea la oportunidad en etapa
// 'venta' (viene de la hoja de ventas, es una venta real), pero NO se
// inserta en `ventas` (esa tabla exige monto_total not null y alimenta
// dashboards financieros — un $0 falso sería peor que omitirla). Se deja
// una actividad marcando "sin monto registrado" para que el equipo lo
// complete.
//
// Moneda: el campo `monto` del JSON ya viene normalizado a USD (verificado:
// fila con "T.C 3.79... S/. 13,340.80" en la descripción trae monto=3520,
// que es exactamente 13340.80 / 3.79).
//
// Uso:
//   node --env-file=.env.local scripts/importar-ventas-historicas.mjs [--aplicar]
//
// Sin --aplicar: solo imprime estadísticas, no escribe nada.

import { Client } from "pg";
import ventas from "./data/ventas-historicas-COTIZ.json" with { type: "json" };

const APLICAR = process.argv.includes("--aplicar");

if (!process.env.DATABASE_URL) {
  console.error("Falta DATABASE_URL en .env.local");
  process.exit(1);
}

function soloDigitos(v) {
  return String(v ?? "").replace(/\D/g, "");
}
function inferirTipoDoc(digitos) {
  if (digitos.length === 11) return "RUC";
  if (digitos.length === 8) return "DNI";
  return null;
}
function excelFechaAISO(serial) {
  if (typeof serial !== "number" || serial <= 0) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}
function normalizarTelefono(t) {
  if (!t) return null;
  const digitos = String(t).replace(/\D/g, "");
  if (digitos.length > 9 && digitos.startsWith("51")) return digitos.slice(2);
  return digitos || null;
}
function normalizarRazonSocial(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

// El campo monto llega casi siempre como número (ya en USD, verificado contra
// la descripción de una fila con T.C. explícito), pero 19 de 849 filas traen
// texto sucio: prefijo de moneda ("S/.", "US$", "USD", "$"), separador de
// miles europeo, saltos de línea, o el número de presupuesto colado en la
// celda de monto ("560-21" — eso no es un monto, se descarta a null).
function parseMonto(raw) {
  if (raw == null) return { monto: null, moneda: null };
  if (typeof raw === "number") return { monto: raw, moneda: "USD" };
  let s = String(raw).trim();
  if (!s) return { monto: null, moneda: null };
  if (/^\d+-\d+$/.test(s)) return { monto: null, moneda: null }; // código de ppto, no es monto
  let moneda = "USD";
  if (/^S\/\.?\s*/i.test(s)) {
    moneda = "PEN";
    s = s.replace(/^S\/\.?\s*/i, "");
  } else if (/^(US\$|USD|\$)\s*/i.test(s)) {
    s = s.replace(/^(US\$|USD|\$)\s*/i, "");
  }
  s = s.trim();
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    if (decimals === 2) s = s.replace(/,(?=[^,]*$)/, ".").replace(/,/g, "");
    else s = s.replace(/,/g, "");
  } else if (lastDot > -1) {
    const dots = (s.match(/\./g) || []).length;
    if (dots > 1) s = s.replace(/\.(?=.*\.)/g, "");
  }
  const n = parseFloat(s);
  if (!isFinite(n) || n <= 0) return { monto: null, moneda: null };
  return { monto: Math.round(n * 100) / 100, moneda };
}

function prepararFila(f) {
  const digitos = soloDigitos(f.numDoc);
  const tipoDoc = f.tipoDoc ?? inferirTipoDoc(digitos);
  // F_ESTADO es la fecha en que se marcó la venta; F_ACCION es la PRÓXIMA acción
  // (puede ser futura). La primera corrida usó F_ACCION y desplazó 259 ventas
  // de mes (una quedó en el futuro) — corregido 2026-08-18.
  const fechaVenta = excelFechaAISO(f.fEstado) ?? excelFechaAISO(f.fAccion);
  const { monto, moneda } = parseMonto(f.monto);
  return {
    ...f,
    numDoc: tipoDoc ? digitos : null,
    tipoDoc,
    fechaVenta,
    monto,
    moneda,
    telNormalizado: normalizarTelefono(f.telCel) ?? normalizarTelefono(f.telFijo),
    razonNormalizada: normalizarRazonSocial(f.razon),
  };
}

async function main() {
  const filas = ventas.map(prepararFila);

  const conDoc = filas.filter((f) => f.numDoc);
  const sinDocConTel = filas.filter((f) => !f.numDoc && f.telNormalizado);
  const sinDocSinTel = filas.filter((f) => !f.numDoc && !f.telNormalizado);
  const conMonto = filas.filter((f) => f.monto);
  const sinFecha = filas.filter((f) => !f.fechaVenta);

  console.log(`Total filas: ${filas.length}`);
  console.log(`  con RUC/DNI: ${conDoc.length}`);
  console.log(`  sin doc, con teléfono: ${sinDocConTel.length}`);
  console.log(`  sin doc, sin teléfono: ${sinDocSinTel.length}`);
  console.log(`  con monto (se insertará en ventas): ${conMonto.length}`);
  console.log(`  sin monto (solo oportunidad, se flagea): ${filas.length - conMonto.length}`);
  console.log(`  sin fecha alguna (fAccion/fEstado): ${sinFecha.length}`);

  const cliente = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await cliente.connect();

  try {
    const { rows: comercialesDb } = await cliente.query(
      "select id, codigo_comercial from perfiles where rol = 'comercial'",
    );
    const idPorComercial = new Map(comercialesDb.map((c) => [c.codigo_comercial, c.id]));
    const carpetasSinPerfil = [...new Set(filas.map((f) => f.comercialCarpeta))].filter((c) => !idPorComercial.has(c));
    if (carpetasSinPerfil.length) {
      console.log(`\n⚠️  Carpetas de comercial sin perfil en la base (esas filas se saltan): ${carpetasSinPerfil.join(", ")}`);
    }

    if (!APLICAR) {
      console.log("\n=== SIMULACIÓN (sin --aplicar, no se escribe nada) ===");
      console.log("Corre de nuevo con --aplicar para escribir cuentas + oportunidades + ventas.");
      return;
    }

    console.log("\n=== ESCRIBIENDO EN LA BASE (transacción única — si algo falla, no queda nada a medias) ===");
    await cliente.query("begin");

    const cacheRazonSocial = new Map(); // solo dentro de esta corrida
    let cuentasNuevas = 0, cuentasPorDoc = 0, cuentasPorTelefono = 0, cuentasPorNombreDup = 0;
    let oportunidadesCreadas = 0, ventasCreadas = 0, filasSaltadas = 0;

    async function obtenerOcrearCuentaPorDoc(f, comercialId) {
      const { rows } = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde, notas)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (num_doc) where num_doc is not null and tipo_doc <> 'SIN_DOC' do nothing
         returning id`,
        [f.tipoDoc, f.numDoc, f.razon || "(sin razón social)", comercialId, f.fechaVenta,
         `[Histórico venta ${f.comercialCarpeta}] ${f.descripcion ?? ""}`.trim()],
      );
      if (rows.length) { cuentasNuevas++; return rows[0].id; }
      const existente = await cliente.query("select id from cuentas where num_doc = $1", [f.numDoc]);
      return existente.rows[0].id;
    }

    async function buscarCuentaPorTelefono(tel) {
      const { rows } = await cliente.query(
        "select cuenta_id from contactos where telefono_normalizado = $1 limit 1",
        [tel],
      );
      return rows[0]?.cuenta_id ?? null;
    }

    async function crearCuentaSinDoc(f, comercialId) {
      const { rows } = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, comercial_id, cartera_desde, notas)
         values ('SIN_DOC', null, $1, $2, $3, $4)
         returning id`,
        [f.razon || "(sin razón social)", comercialId, f.fechaVenta,
         `[Histórico venta ${f.comercialCarpeta}] Falta RUC/DNI — completar cuando se identifique. ${f.descripcion ?? ""}`.trim()],
      );
      cuentasNuevas++;
      return rows[0].id;
    }

    async function resolverCuenta(f, comercialId) {
      if (f.numDoc) {
        cuentasPorDoc++;
        return obtenerOcrearCuentaPorDoc(f, comercialId);
      }
      if (f.telNormalizado) {
        const cuentaId = await buscarCuentaPorTelefono(f.telNormalizado);
        if (cuentaId) { cuentasPorTelefono++; return cuentaId; }
      }
      if (cacheRazonSocial.has(f.razonNormalizada)) {
        cuentasPorNombreDup++;
        return cacheRazonSocial.get(f.razonNormalizada);
      }
      const cuentaId = await crearCuentaSinDoc(f, comercialId);
      cacheRazonSocial.set(f.razonNormalizada, cuentaId);
      return cuentaId;
    }

    let i = 0;
    for (const f of filas) {
      i++;
      if (i % 200 === 0) console.log(`  ${i}/${filas.length}...`);

      const comercialId = idPorComercial.get(f.comercialCarpeta);
      if (!comercialId) { filasSaltadas++; continue; }

      const cuentaId = await resolverCuenta(f, comercialId);

      const notaDescripcion = f.descripcion
        ? `[Histórico venta ${f.comercialCarpeta}${f.fechaVenta ? ", " + f.fechaVenta : ""}] ${f.descripcion}`
        : `[Histórico venta ${f.comercialCarpeta}${f.fechaVenta ? ", " + f.fechaVenta : ""}]`;
      const notaFinal = f.monto ? notaDescripcion : `${notaDescripcion} ⚠ Sin monto registrado en el histórico — completar manualmente.`;

      const moneda = f.moneda ?? "USD";
      const { rows: opRows } = await cliente.query(
        `insert into oportunidades (cuenta_id, comercial_id, etapa, monto_estimado, moneda, cerrada_at, created_at, origen)
         values ($1, $2, 'venta', $3, $4, $5, coalesce($5, now()), 'historico_excel')
         returning id`,
        [cuentaId, comercialId, f.monto ?? null, moneda, f.fechaVenta],
      );
      const oportunidadId = opRows[0].id;
      oportunidadesCreadas++;

      await cliente.query(
        `insert into actividades (oportunidad_id, tipo, nota, realizada_por, realizada_at)
         values ($1, 'nota', $2, $3, coalesce($4, now()))`,
        [oportunidadId, notaFinal, comercialId, f.fechaVenta],
      );

      if (f.monto) {
        await cliente.query(
          `insert into ventas (oportunidad_id, cotizacion_id, serie, fecha_venta, monto_total, moneda, registrada_por, notas, origen)
           values ($1, null, null, coalesce($2, current_date), $3, $4, $5, 'Importado de histórico — sin cotización asociada.', 'historico_excel')`,
          [oportunidadId, f.fechaVenta, f.monto, moneda, comercialId],
        );
        ventasCreadas++;
      }
    }

    console.log(`\nCuentas nuevas creadas: ${cuentasNuevas}`);
    console.log(`  resueltas por documento (match o nueva): ${cuentasPorDoc}`);
    console.log(`  resueltas por teléfono existente: ${cuentasPorTelefono}`);
    console.log(`  reusadas por nombre duplicado en esta corrida: ${cuentasPorNombreDup}`);
    console.log(`Oportunidades creadas (etapa venta): ${oportunidadesCreadas}`);
    console.log(`Filas de ventas insertadas (con monto): ${ventasCreadas}`);
    console.log(`Filas saltadas (sin perfil de comercial): ${filasSaltadas}`);

    await cliente.query("commit");
    console.log("\n✓ Transacción confirmada.");
  } catch (e) {
    await cliente.query("rollback").catch(() => {});
    console.error("\n✗ Error — se hizo rollback, la base queda intacta.");
    throw e;
  } finally {
    await cliente.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
