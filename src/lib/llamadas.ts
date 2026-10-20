/**
 * LLAMADAS GRABADAS DESDE EL CRM: nombres, carpetas y números (Santos, 19-10-2026).
 *
 * Santos aprobó que el comercial llame desde la ficha, que la llamada se grabe
 * y que el audio y su transcripción queden EN LA VM, ordenados «por cliente y
 * por día», con nombres que se entiendan sin abrir nada: fecha, hora, quién
 * llamó, a quién, a qué número y cuánto duró.
 *
 * Este módulo no toca disco ni base: solo decide cómo se llama cada cosa y en
 * qué carpeta va, para que la API, el servicio de transcripción y las pantallas
 * hablen de lo mismo. Plan completo: Downloads/Plan-llamadas-grabadas-CRM.md.
 *
 *   por-dia/2026/10/2026-10-19/2026-10-19_15h42_C5-Santos_LAVANDERIA-EL-SOL-SAC_987654321_3m25s.ogg
 *   por-cliente/LAVANDERIA-EL-SOL-SAC_20601234567/ (los mismos archivos, enlace duro)
 *
 * TODA hora es la de Lima: la base guarda UTC, pero nadie busca «las 20:42».
 */

const ZONA = "America/Lima";

/** Cuántos dígitos del final bastan para decir «es el mismo número». */
const DIGITOS_PARA_COMPARAR = 9;

/**
 * Deja un número como `+51987654321`.
 *
 * Los celulares peruanos son 9 dígitos que empiezan con 9; los fijos de Lima
 * traen el 01. Un número de otro país (+1…, +34…) se respeta tal cual. Lo que
 * tiene menos de 6 dígitos no es un teléfono (una extensión, un código corto) y
 * da null: no se liga a ninguna ficha.
 */
export function normalizarNumero(crudo: string | null | undefined): string | null {
  if (!crudo) return null;
  const traePlus = crudo.trim().startsWith("+");
  let d = crudo.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 6) return null;
  if (traePlus || d.length > 11) return `+${d}`;
  if (d.startsWith("51") && d.length >= 10) return `+${d}`;
  if (d.length === 9 && d.startsWith("9")) return `+51${d}`;
  // Fijo con código de ciudad (01 = Lima): se conserva sin el cero inicial.
  if (d.startsWith("0")) return `+51${d.slice(1)}`;
  return `+51${d}`;
}

/** Los últimos 9 dígitos: lo que se compara contra `contactos.telefono`, que viene escrito de mil formas. */
export function digitosParaComparar(numero: string | null | undefined): string | null {
  const d = (numero ?? "").replace(/\D/g, "");
  if (d.length < 6) return null;
  return d.slice(-DIGITOS_PARA_COMPARAR);
}

/** «987 654 321» para mostrar. Un número de otro país se deja con su +. */
export function numeroParaMostrar(numero: string | null | undefined): string {
  const n = normalizarNumero(numero ?? "");
  if (!n) return numero?.trim() || "—";
  if (n.startsWith("+51") && n.length === 12) return `${n.slice(3, 6)} ${n.slice(6, 9)} ${n.slice(9)}`;
  return n;
}

export interface FechaLima {
  /** 2026-10-19 */
  fecha: string;
  /** 15h42 (nombre de archivo) */
  hora: string;
  /** 15:42 (pantalla) */
  horaPantalla: string;
  anio: string;
  mes: string;
  /** lunes */
  diaSemana: string;
}

/** Una marca de tiempo, vista en Lima. */
export function fechaLima(instante: string | Date): FechaLima {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(typeof instante === "string" ? new Date(instante) : instante);
  const p = (tipo: string) => f.find((x) => x.type === tipo)?.value ?? "";
  // Algunas versiones de Intl devuelven «24» a medianoche con hour12:false.
  const hh = p("hour") === "24" ? "00" : p("hour");
  const dia = new Intl.DateTimeFormat("es-PE", { timeZone: ZONA, weekday: "long" }).format(
    typeof instante === "string" ? new Date(instante) : instante,
  );
  return {
    fecha: `${p("year")}-${p("month")}-${p("day")}`,
    hora: `${hh}h${p("minute")}`,
    horaPantalla: `${hh}:${p("minute")}`,
    anio: p("year"),
    mes: p("month"),
    diaSemana: dia,
  };
}

/** 205 → «3m25s»; 45 → «45s»; 3600 → «60m00s». Nunca vacío: 0 es «0s». */
export function duracionParaNombre(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
}

/** 205 → «3 min 25 s» para leer en pantalla y en la cabecera de la transcripción. */
export function duracionLegible(segundos: number): string {
  const s = Math.max(0, Math.round(segundos));
  if (s < 60) return `${s} s`;
  return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

/**
 * Un texto como pieza de nombre de archivo: MAYÚSCULAS, sin tildes ni eñes, solo
 * letras, números y guiones. Sirve igual en Windows, en el servidor Linux, por
 * correo y en una carpeta compartida (misma razón que `lib/nombre-archivo.ts`).
 */
export function pieza(texto: string | null | undefined, maximo = 60): string {
  const limpio = (texto ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return limpio.length > maximo ? limpio.slice(0, maximo).replace(/-+$/g, "") : limpio;
}

export interface DatosNombre {
  iniciada_at: string | Date;
  /** «C5» */
  codigoComercial?: string | null;
  /** «Santos» */
  nombreComercial?: string | null;
  /** Razón social de la ficha; sin ficha se escribe SIN-FICHA. */
  cliente?: string | null;
  numero: string | null;
  duracion_s: number;
}

/**
 * El nombre SIN extensión, igual para el audio y para la transcripción:
 * `2026-10-19_15h42_C5-Santos_LAVANDERIA-EL-SOL-SAC_987654321_3m25s`.
 * Del comercial se deja el código y el primer nombre; del número, sus dígitos.
 */
export function nombreBase(d: DatosNombre): string {
  const f = fechaLima(d.iniciada_at);
  const primerNombre = (d.nombreComercial ?? "").trim().split(/\s+/)[0] ?? "";
  const quien = [pieza(d.codigoComercial, 8), primerNombre ? capitalizada(pieza(primerNombre, 20)) : ""].filter(Boolean).join("-") || "SIN-COMERCIAL";
  const cliente = pieza(d.cliente) || "SIN-FICHA";
  const num = normalizarNumero(d.numero)?.replace(/\D/g, "").replace(/^51(?=9\d{8}$)/, "") ?? "SIN-NUMERO";
  return [f.fecha, f.hora, quien, cliente, num, duracionParaNombre(d.duracion_s)].join("_");
}

function capitalizada(t: string): string {
  return t.charAt(0) + t.slice(1).toLowerCase();
}

/** `por-dia/2026/10/2026-10-19` (relativa a la raíz de las llamadas). */
export function carpetaPorDia(iniciada_at: string | Date): string {
  const f = fechaLima(iniciada_at);
  return `por-dia/${f.anio}/${f.mes}/${f.fecha}`;
}

/** `por-cliente/LAVANDERIA-EL-SOL-SAC_20601234567`; sin ficha, `por-cliente/SIN-FICHA`. */
export function carpetaPorCliente(cliente: string | null | undefined, documento?: string | null): string {
  const nombre = pieza(cliente);
  if (!nombre) return "por-cliente/SIN-FICHA";
  const doc = (documento ?? "").replace(/\D/g, "");
  return `por-cliente/${nombre}${doc ? `_${doc}` : ""}`;
}

export interface CabeceraTranscripcion {
  cliente?: string | null;
  documento?: string | null;
  contacto?: string | null;
  cargo?: string | null;
  comercial?: string | null;
  codigoComercial?: string | null;
  iniciada_at: string | Date;
  duracion_s: number;
  numero: string | null;
  resumen?: string | null;
  proximaAccion?: string | null;
}

/**
 * Lo que va arriba del `.txt` de la transcripción, para que quien lo abra solo
 * sepa de qué llamada es sin mirar la carpeta ni el CRM.
 */
export function cabeceraDeTranscripcion(c: CabeceraTranscripcion): string {
  const f = fechaLima(c.iniciada_at);
  const lineas = [
    `Cliente: ${c.cliente?.trim() || "SIN FICHA"}${c.documento ? ` (RUC/DNI ${c.documento})` : ""}`,
    c.contacto ? `Contacto: ${c.contacto}${c.cargo ? ` — ${c.cargo}` : ""}` : null,
    `Comercial: ${[c.codigoComercial, c.comercial].filter(Boolean).join(" ") || "—"}`,
    `Fecha: ${f.diaSemana} ${f.fecha.split("-").reverse().join("-")}, ${f.horaPantalla} (Lima) · Duración: ${duracionLegible(c.duracion_s)}`,
    `Número: ${numeroParaMostrar(c.numero)}`,
  ].filter((l): l is string => l !== null);
  if (c.resumen) {
    lineas.push("", "--- RESUMEN ---", c.resumen.trim());
    if (c.proximaAccion) lineas.push(`Próxima acción: ${c.proximaAccion.trim()}`);
  }
  lineas.push("", "--- TRANSCRIPCIÓN ---");
  return lineas.join("\n");
}

/** Segundos → «[03:25]» para marcar cada frase de la transcripción. */
export function marcaDeTiempo(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos));
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  return `[${mm}:${String(s % 60).padStart(2, "0")}]`;
}
