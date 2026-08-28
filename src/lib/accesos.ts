/**
 * Los accesos al CRM, leídos como los lee una persona.
 *
 * La tabla `accesos` guarda desde el día uno lo que pidió gerencia (regla 4):
 * quién entró, desde qué IP y con qué navegador. El problema es que eso está
 * escrito para máquinas —«Mozilla/5.0 (Windows NT 10.0; Win64; x64)
 * AppleWebKit/537.36 … Chrome/151.0.0.0»— y lo que Carlos pidió el 28-08 es
 * poder hacer seguimiento: «quiero una vista de qué computadores está viendo
 * actualmente… desde qué computadora está conectada cada usuario, de qué hora
 * y en qué zona».
 *
 * Acá se traduce. Nada de esto adivina: si el dato no está, lo dice.
 */

export interface Equipo {
  /** «Windows», «Mac», «iPhone», «Android»… o «Sin identificar». */
  sistema: string;
  navegador: string;
  /** Para saber si entró desde la computadora del trabajo o desde el celular. */
  tipo: "escritorio" | "celular" | "tablet" | "desconocido";
  /** Una línea: «Windows · Chrome». */
  resumen: string;
}

export function describirEquipo(userAgent: string | null | undefined): Equipo {
  const ua = userAgent ?? "";
  if (!ua.trim()) {
    return { sistema: "Sin identificar", navegador: "—", tipo: "desconocido", resumen: "Equipo sin identificar" };
  }

  // El orden importa: un iPad dice «Macintosh» más abajo, y Edge dice «Chrome».
  const sistema = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Android/i.test(ua)
        ? "Android"
        : /Windows NT/i.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(ua)
            ? "Mac"
            : /Linux/i.test(ua)
              ? "Linux"
              : "Sin identificar";

  const navegador = /Edg\//i.test(ua)
    ? "Edge"
    : /OPR\/|Opera/i.test(ua)
      ? "Opera"
      : /Chrome\//i.test(ua)
        ? "Chrome"
        : /Firefox\//i.test(ua)
          ? "Firefox"
          : /Safari\//i.test(ua)
            ? "Safari"
            : "Otro navegador";

  const tipo: Equipo["tipo"] =
    sistema === "iPhone" || sistema === "Android" ? "celular" : sistema === "iPad" ? "tablet" : sistema === "Sin identificar" ? "desconocido" : "escritorio";

  return { sistema, navegador, tipo, resumen: `${sistema} · ${navegador}` };
}

/**
 * Dos accesos son del MISMO equipo si coinciden el sistema, el navegador y la
 * IP. No es una huella infalible —dos laptops iguales en la misma oficina se
 * ven igual— y por eso acá no se toma ninguna decisión de bloqueo: sirve para
 * mirar y preguntar, que es lo que gerencia pidió por ahora.
 */
export function huellaEquipo(userAgent: string | null | undefined, ip: string | null | undefined): string {
  const e = describirEquipo(userAgent);
  return `${e.sistema}|${e.navegador}|${ip ?? "sin-ip"}`;
}

/**
 * La zona: dentro o fuera de la oficina.
 *
 * No se geolocaliza la IP —eso significaría mandarle a un tercero, todos los
 * días, la lista de dónde se conecta cada empleado— y además no haría falta:
 * lo que Carlos quiere saber es si alguien está entrando desde fuera. La IP de
 * la oficina se reconoce sola, porque es desde donde entra casi todo el mundo.
 */
export function ipsDeLaOficina(accesos: { ip: string | null; user_id: string }[]): Set<string> {
  const usuariosPorIp = new Map<string, Set<string>>();
  for (const a of accesos) {
    if (!a.ip) continue;
    if (!usuariosPorIp.has(a.ip)) usuariosPorIp.set(a.ip, new Set());
    usuariosPorIp.get(a.ip)!.add(a.user_id);
  }
  // Una IP por la que entran tres personas distintas o más es una red
  // compartida: la oficina. La casa de alguien no cumple eso.
  return new Set([...usuariosPorIp.entries()].filter(([, u]) => u.size >= 3).map(([ip]) => ip));
}

export function zonaDeAcceso(ip: string | null | undefined, oficina: Set<string>): {
  etiqueta: string;
  fuera: boolean;
} {
  if (!ip) return { etiqueta: "Sin IP registrada", fuera: false };
  if (oficina.has(ip)) return { etiqueta: "Oficina", fuera: false };
  // Rangos privados: alguien entrando por la red interna o por una VPN.
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(ip)) return { etiqueta: "Red interna", fuera: false };
  return { etiqueta: "Fuera de la oficina", fuera: true };
}

/** «hace 3 min», «hace 2 h», «hace 4 días» — para leer de un vistazo. */
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.round((ahora - new Date(iso).getTime()) / 60000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.round(horas / 24);
  return dias === 1 ? "ayer" : `hace ${dias} días`;
}
