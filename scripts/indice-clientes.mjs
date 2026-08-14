// Carga el índice MÍNIMO de clientes de un comercial (RUC/DNI + razón social +
// datos de ubicación) desde su Excel real, para poder detectar duplicados desde
// el día 1. NO es la migración histórica completa (esa va al final del proyecto:
// aquí no se cargan contactos, actividades ni cotizaciones, solo la cuenta).
//
// Uso:
//   node --env-file=.env.local scripts/indice-clientes.mjs \
//     --archivo "C:/Users/diseno/Downloads/PROYECTO CRM EFAMEINSA/CRM COMERCIAL5 2026-Katerine Tello.xlsx" \
//     --hoja "PROSP." \
//     --comercial C5
//
// Es re-ejecutable: las cuentas con RUC/DNI válido usan ON CONFLICT DO NOTHING
// (no duplica). Las que no tienen documento válido SÍ se duplicarían si se
// corre dos veces — está pensado para correr una sola vez por comercial.

import { Client } from "pg";
import XLSX from "xlsx";

function leerArgumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 ? process.argv[i + 1] : porDefecto;
}

const ARCHIVO = leerArgumento("archivo");
const HOJA = leerArgumento("hoja", "PROSP.");
const CODIGO_COMERCIAL = leerArgumento("comercial");

if (!ARCHIVO || !CODIGO_COMERCIAL) {
  console.error(
    "Uso: node --env-file=.env.local scripts/indice-clientes.mjs --archivo <ruta.xlsx> --comercial <C5> [--hoja PROSP.]",
  );
  process.exit(1);
}
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
  return "SIN_DOC";
}

function fila(f) {
  const digitos = soloDigitos(f.DNI_RUC);
  const tipoDoc = inferirTipoDoc(digitos);
  return {
    razon_social: String(f["NOMBRE_RAZON SOCIAL"] ?? "").trim(),
    tipo_doc: tipoDoc,
    num_doc: tipoDoc === "SIN_DOC" ? null : digitos,
    departamento: f.DEPART ? String(f.DEPART).trim() : null,
    provincia: f.PROVIN ? String(f.PROVIN).trim() : null,
    distrito: f.DISTR ? String(f.DISTR).trim() : null,
    direccion: f.DIRECC ? String(f.DIRECC).trim() : null,
  };
}

async function main() {
  const wb = XLSX.readFile(ARCHIVO);
  const hoja = wb.Sheets[HOJA];
  if (!hoja) {
    console.error(`No existe la hoja "${HOJA}" en ${ARCHIVO}. Hojas disponibles: ${wb.SheetNames.join(", ")}`);
    process.exit(1);
  }

  const filas = XLSX.utils
    .sheet_to_json(hoja, { defval: null })
    // Solo filas "cabecera" de cada prospecto (las de seguimiento repiten el
    // nombre pero no traen ITEM ni el resto de datos de la entidad).
    .filter((f) => f.ITEM != null)
    .map(fila)
    .filter((c) => c.razon_social);

  console.log(`Filas a importar: ${filas.length} (de la hoja "${HOJA}")`);

  const cliente = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await cliente.connect();

  try {
    const { rows } = await cliente.query(
      "select id from perfiles where codigo_comercial = $1 and rol = 'comercial'",
      [CODIGO_COMERCIAL],
    );
    if (rows.length === 0) {
      console.error(
        `No existe un perfil con codigo_comercial='${CODIGO_COMERCIAL}'. Créenlo primero (ver scripts/crear-usuarios-prueba.mjs).`,
      );
      process.exit(1);
    }
    const comercialId = rows[0].id;

    let insertadas = 0;
    let omitidas = 0;

    for (const c of filas) {
      const resultado = await cliente.query(
        `insert into cuentas (tipo_doc, num_doc, razon_social, departamento, provincia, distrito, direccion, comercial_id, cartera_desde)
         values ($1, $2, $3, $4, $5, $6, $7, $8, now())
         on conflict (num_doc) where (num_doc is not null and tipo_doc <> 'SIN_DOC') do nothing
         returning id`,
        [c.tipo_doc, c.num_doc, c.razon_social, c.departamento, c.provincia, c.distrito, c.direccion, comercialId],
      );
      if (resultado.rowCount > 0) insertadas++;
      else omitidas++;
    }

    console.log(`\n✓ Índice cargado para ${CODIGO_COMERCIAL}: ${insertadas} cuentas nuevas, ${omitidas} ya existían (mismo RUC/DNI).`);
  } finally {
    await cliente.end();
  }
}

main().catch((err) => {
  console.error("\n✗ Error cargando índice de clientes:\n", err.message);
  process.exit(1);
});
