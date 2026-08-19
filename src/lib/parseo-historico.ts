// Parsers de los archivos Excel históricos de Central y de las cotizaciones
// de comerciales. Extraídos el 2026-08-19 de scripts/importar-ventas-historicas.mjs
// (parseMonto, codigoCentral) y scripts/importar-central-historico.mjs (hora,
// codigoPro, excelFechaAISO) — copia byte-a-byte de la lógica ya corrida y
// verificada contra datos reales (1.560 ventas / 44.538 filas de Central).
// Los scripts .mjs de importación NO importan de aquí (ya se ejecutaron y no
// deben volver a tocarse); este módulo es la referencia probada por si se
// necesita una corrección histórica futura, y el objetivo de las pruebas
// unitarias — dos bugs reales de este proyecto vivieron en estas funciones:
// el monto "2.238.87"/"US$ 1,905.93" mal parseado (import parcial, rollback
// manual) y la hora "4.63"→"04:63" reventando un timestamptz.

/** Excel serial (días desde 1899-12-30) → "YYYY-MM-DD". */
export function excelFechaAISO(serial: unknown): string | null {
  if (typeof serial !== "number" || serial <= 0) return null;
  const d = new Date(Math.round((serial - 25569) * 86400 * 1000));
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/**
 * "10:13 am" / "2:22 pm" → "10:13" / "14:22"; también acepta el serial Excel
 * (fracción de día). Celdas sucias tipo "4.63" (decimal suelto, no hora)
 * producían "04:63" y reventaban el timestamptz de la base — se descartan
 * (null) en vez de forzar una hora inválida.
 */
export function horaDesdeCelda(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number" && v > 0 && v < 1) {
    const min = Math.round(v * 24 * 60) % 1440; // 0.99999 redondeaba a 24:00
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = String(v).trim().toLowerCase().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3]?.startsWith("p") && h < 12) h += 12;
  if (m[3]?.startsWith("a") && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Monto en texto de las hojas de comerciales → { monto, moneda }. Detecta
 * S/ / US$ / $ / USD, separador decimal ambiguo (coma o punto según cuál
 * viene último), y descarta basura tipo "560-21" (número de presupuesto
 * colado en la celda de monto).
 */
export function parseMonto(raw: unknown): { monto: number | null; moneda: "USD" | "PEN" | null } {
  if (raw == null) return { monto: null, moneda: null };
  if (typeof raw === "number") return { monto: raw, moneda: "USD" };
  let s = String(raw).trim();
  if (!s || /^\d+-\d+$/.test(s)) return { monto: null, moneda: null };
  let moneda: "USD" | "PEN" = "USD";
  if (/^S\/\.?\s*/i.test(s)) {
    moneda = "PEN";
    s = s.replace(/^S\/\.?\s*/i, "");
  } else if (/^(US\$|USD|\$)\s*/i.test(s)) {
    s = s.replace(/^(US\$|USD|\$)\s*/i, "");
  }
  s = s.trim();
  const lc = s.lastIndexOf(",");
  const ld = s.lastIndexOf(".");
  if (lc > -1 && ld > -1) {
    s = lc > ld ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lc > -1) {
    s = s.length - lc - 1 === 2 ? s.replace(/,(?=[^,]*$)/, ".").replace(/,/g, "") : s.replace(/,/g, "");
  } else if (ld > -1 && (s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\.(?=.*\.)/g, "");
  }
  const n = parseFloat(s);
  return !isFinite(n) || n <= 0 ? { monto: null, moneda: null } : { monto: Math.round(n * 100) / 100, moneda };
}

/** 'PRO 11591' / 'PRO726' / 'PR0026' (O confundida con 0) → 'PRO11591' / 'PRO726' / 'PRO26'. Campo COD_MKT de las hojas de comerciales. */
export function codigoCentralDesdeCodMkt(s: unknown): string | null {
  const m = String(s ?? "").toUpperCase().replace(/O/g, "0").match(/PR0*\s*(\d+)/);
  return m ? "PRO" + String(parseInt(m[1], 10)) : null;
}

/** Código PRO propio del maestro de Central (formato ligeramente distinto al de arriba: solo la O antes de un dígito se corrige, y admite guion). */
export function codigoProDeCentral(s: unknown): string | null {
  const m = String(s ?? "").toUpperCase().replace(/O(?=\d)/g, "0").match(/PR?0?O?\s*-?\s*(\d{2,6})/);
  return m ? "PRO" + String(parseInt(m[1], 10)) : null;
}
