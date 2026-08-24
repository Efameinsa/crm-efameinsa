// Formateo de fechas para toda la app.
//
// EL PROBLEMA QUE RESUELVE: los Server Components se renderizan en el servidor
// (Vercel corre en UTC), así que `new Date(x).toLocaleString("es-PE")` sin
// zona explícita usa la del SERVIDOR, no la del usuario. Un lead recibido a
// las 11:48 de Lima se mostraba como "4:48 p. m." — cinco horas adelantado.
//
// LA SUTILEZA: hay dos tipos de columna y NO se tratan igual.
//   · timestamptz (recibido_at, created_at, ultima_venta_at…) = un INSTANTE.
//     Hay que convertirlo a la hora de Lima para que signifique algo.
//   · date (fecha_venta, proxima_accion_at, gasto_campania.fecha) = un DÍA de
//     calendario, sin hora. Convertir zona horaria acá lo CORRE un día:
//     "2026-08-16" se interpreta como medianoche UTC, que en Lima es el 15 a
//     las 19:00. Por eso se formatea el texto directo, sin pasar por zonas.

const ZONA = "America/Lima";

/** Para columnas `timestamptz`: instante real, convertido a hora de Lima. */
export function fechaHoraLima(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-PE", {
    timeZone: ZONA,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Para columnas `timestamptz` cuando solo interesa el día (en hora de Lima). */
export function fechaLima(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", { timeZone: ZONA });
}

/** Para columnas `date` ("2026-08-16"): día de calendario, sin conversión. */
export function fechaCalendario(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const m = String(fecha).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(fecha);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Para columnas `timestamptz` en formato corto: "16 ago 2026" (hora de Lima). */
export function fechaLimaCorta(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-PE", {
    timeZone: ZONA,
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Para lo agendado sobre columnas `date` + `time`: "vie 29/08" o
 * "vie 29/08 · 10:00". Sin conversión de zona (ver la nota de arriba).
 */
export function fechaAgendada(fecha: string | null | undefined, hora?: string | null): string {
  if (!fecha) return "sin fecha";
  const m = String(fecha).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(fecha);
  const dia = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).toLocaleDateString("es-PE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  return hora ? `${dia} · ${String(hora).slice(0, 5)}` : dia;
}

/** Para columnas `date` en formato largo: "16 de agosto de 2026". */
export function fechaCalendarioLarga(fecha: string | null | undefined): string {
  if (!fecha) return "—";
  const m = String(fecha).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(fecha);
  // Se construye con hora de mediodía para que ningún ajuste de zona lo corra.
  return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00`).toLocaleDateString("es-PE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
