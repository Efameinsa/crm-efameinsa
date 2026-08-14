// Extrae taxonomías de los Excel reales para armar los seeds.
// Uso (Node portable, rutas SIEMPRE estilo Windows C:/..., nunca /c/...):
//   npm i xlsx
//   node scripts/extraer-catalogos.mjs
// Imprime: hoja DATOS completa (para revisar taxonomías) y los INSERT de rubros.

import * as XLSX from 'xlsx';

const CARPETA = 'C:/Users/diseno/Downloads/PROYECTO CRM EFAMEINSA';
const ARCHIVO_VENDEDOR = `${CARPETA}/CRM COMERCIAL5 2026-Katerine Tello.xlsx`;

const wb = XLSX.readFile(ARCHIVO_VENDEDOR);

// 1) Hoja DATOS: taxonomía oficial (estados, acciones, intención, rubros) con definiciones.
const datos = wb.Sheets['DATOS'];
if (datos) {
  console.log('=== HOJA DATOS (revisar manualmente para catálogos) ===');
  console.log(JSON.stringify(XLSX.utils.sheet_to_json(datos, { header: 1, defval: null }), null, 1));
}

// 2) Rubros reales usados en PROSP. → INSERTs listos para seed.sql
const prosp = wb.Sheets['PROSP.'];
if (prosp) {
  const filas = XLSX.utils.sheet_to_json(prosp, { defval: null });
  const rubros = [...new Set(filas.map(f => (f.RUBRO ?? '').toString().trim()).filter(Boolean))].sort();
  console.log('\n=== INSERTS DE RUBROS (pegar en supabase/seed.sql) ===');
  console.log('insert into catalogo_rubros (nombre) values');
  console.log(rubros.map(r => `  ('${r.replace(/'/g, "''")}')`).join(',\n') + '\non conflict (nombre) do nothing;');
}

// 3) Últimos correlativos reales (para fijar la tabla `correlativos`)
//    Revisar SEGUIMIENTO DE PROSPECTOS-2026.xls: hoja Seguimiento (CODIGO PRO####)
//    y hojas 'L. PRESUPUESTO EFAMEINSA' / 'L. PRESUPUESTO OPEN' (Presu_###).
console.log('\n⚠️  Falta: extraer últimos PRO y Presu_ de SEGUIMIENTO DE PROSPECTOS-2026.xls (formato .xls también lo lee xlsx).');
