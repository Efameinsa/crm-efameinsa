/**
 * La aritmética de un calendario, sin dueño.
 *
 * Vivía dentro de `agenda-mensual.tsx` —la agenda del comercial— y el
 * calendario de postventa necesitaba exactamente lo mismo. Copiarla habría sido
 * el error de siempre: dos grillas que se van separando hasta que una empieza
 * la semana en domingo. Se mueve acá y las dos pantallas la llaman.
 *
 * Todo se calcula en UTC a propósito. Son fechas de calendario («2026-08-28»),
 * no instantes: sumarles horas locales las corre un día en Lima, que está en
 * UTC-5 y arruina justo el borde del mes.
 */

export const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export const DIAS_CORTOS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

/** Mueve un mes «2026-08» tantos meses adelante o atrás. */
export function sumarMes(mes: string, delta: number): string {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10).slice(0, 7);
}

/** Grilla lunes-a-domingo que cubre el mes completo (5 o 6 semanas). */
export function diasDelMes(mes: string): { iso: string; dia: number; otroMes: boolean }[] {
  const [y, m] = mes.split("-").map(Number);
  const primero = new Date(Date.UTC(y, m - 1, 1));
  const offset = (primero.getUTCDay() + 6) % 7; // lunes = 0
  const inicio = new Date(primero);
  inicio.setUTCDate(1 - offset);
  const dias = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(inicio);
    d.setUTCDate(inicio.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    dias.push({ iso, dia: d.getUTCDate(), otroMes: !iso.startsWith(mes) });
  }
  // recortar la última semana si es toda de otro mes
  return dias.length && dias[35].otroMes && dias.slice(35).every((x) => x.otroMes) ? dias.slice(0, 35) : dias;
}

/** Suma (o resta) días a una fecha de calendario. */
export function sumarDias(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** El lunes de la semana en la que cae esa fecha. */
export function lunesDe(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return sumarDias(iso, -((d.getUTCDay() + 6) % 7));
}

/**
 * Los días de la semana que arranca ese lunes.
 *
 * Seis por defecto, hasta el sábado: en Efameinsa se trabaja el sábado —el
 * horario de salida de los sábados está en el informe diario de gerencia— y un
 * calendario que corta el viernes esconde medio día de atenciones. El domingo
 * se pide expresamente cuando hace falta.
 */
export function diasDeSemana(lunes: string, cuantos = 6): string[] {
  return Array.from({ length: cuantos }, (_, i) => sumarDias(lunes, i));
}

/** «Semana del 24 al 29 de agosto», para el encabezado. */
export function rotuloSemana(lunes: string, cuantos = 6): string {
  const fin = sumarDias(lunes, cuantos - 1);
  const [, mesA, diaA] = lunes.split("-").map(Number);
  const [anioB, mesB, diaB] = fin.split("-").map(Number);
  const mismoMes = mesA === mesB;
  return mismoMes
    ? `Semana del ${diaA} al ${diaB} de ${MESES[mesB - 1]}`
    : `Semana del ${diaA} de ${MESES[mesA - 1]} al ${diaB} de ${MESES[mesB - 1]} de ${anioB}`;
}

/** «28 de agosto», para el encabezado del día. */
export function rotuloDia(iso: string): string {
  const [, mes, dia] = iso.split("-").map(Number);
  return `${dia} de ${MESES[mes - 1]}`;
}

/** «agosto 2026», para el encabezado del mes. */
export function rotuloMes(mes: string): string {
  const [anio, m] = mes.split("-").map(Number);
  return `${MESES[m - 1]} ${anio}`;
}
