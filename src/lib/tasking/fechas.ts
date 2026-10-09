// Perú no tiene horario de verano: Lima es siempre UTC-5. Eso simplifica todo el cálculo de fechas.
export const TZ = 'America/Lima';
const OFFSET_MS = -5 * 3600_000;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic'];

/** Partes de la fecha vista en Lima. */
export function partesLima(fecha: Date | string | number) {
  const d = new Date(new Date(fecha).getTime() + OFFSET_MS);
  return {
    anio: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
  };
}

const dos = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' en Lima. */
export function fechaLima(fecha: Date | string | number = Date.now()) {
  const p = partesLima(fecha);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

/** Instante a partir de fecha y hora de Lima. */
export function deLima(fecha: string, hora = '00:00') {
  return new Date(`${fecha}T${hora.length === 5 ? hora : '00:00'}:00-05:00`);
}

export function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

export function horaTexto(fecha: Date | string) {
  const p = partesLima(fecha);
  const h12 = p.hora % 12 === 0 ? 12 : p.hora % 12;
  const sufijo = p.hora < 12 ? 'a. m.' : 'p. m.';
  return p.minuto === 0 ? `${h12} ${sufijo}` : `${h12}:${dos(p.minuto)} ${sufijo}`;
}

/** «hoy 4 p. m.», «mañana», «viernes 9 oct 10:30 a. m.», «sin fecha». */
export function plazoTexto(venceEn: string | null, horaDefinida: boolean, ahora = Date.now()) {
  if (!venceEn) return 'sin fecha';
  const hoy = fechaLima(ahora);
  const f = fechaLima(venceEn);
  const p = partesLima(venceEn);
  let dia: string;
  if (f === hoy) dia = 'hoy';
  else if (f === sumarDias(hoy, 1)) dia = 'mañana';
  else if (f === sumarDias(hoy, -1)) dia = 'ayer';
  else dia = `${DIAS[p.diaSemana]} ${p.dia} ${MESES[p.mes - 1]}`;
  return horaDefinida ? `${dia} ${horaTexto(venceEn)}` : dia;
}

/** «jueves 2 oct 2026, 10:15 a. m.» */
export function fechaLarga(fecha: string | Date) {
  const p = partesLima(fecha);
  return `${DIAS[p.diaSemana]} ${p.dia} ${MESES[p.mes - 1]} ${p.anio}, ${horaTexto(fecha)}`;
}

/** Calendario de los próximos días para que la IA no se equivoque al convertir «el jueves». */
export function calendarioProximo(desde: Date, dias = 21) {
  const base = fechaLima(desde);
  const lineas: string[] = [];
  for (let i = 0; i < dias; i++) {
    const f = sumarDias(base, i);
    const p = partesLima(deLima(f, '12:00'));
    const etiqueta = i === 0 ? ' (HOY)' : i === 1 ? ' (MAÑANA)' : i === 2 ? ' (PASADO MAÑANA)' : '';
    lineas.push(`${f} = ${DIAS[p.diaSemana]}${etiqueta}`);
  }
  return lineas.join('\n');
}

/** Hora actual en ms (en una función aparte para que el render del servidor no la llame directo). */
export function ahoraMs() {
  return Date.now();
}

export { DIAS, MESES };
