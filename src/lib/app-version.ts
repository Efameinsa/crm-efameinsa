/**
 * Versiones de la app de Android (repo Efameinsa/crm-app-movil).
 *
 * La app abre el CRM dentro de un WebView, así que casi todo se actualiza solo con
 * cada despliegue. Lo que NO se actualiza solo es lo nativo (permisos, plugins, el
 * GPS): para eso hay que instalar un APK nuevo. Cuando una versión vieja ya no
 * puede trabajar bien con el CRM, se sube `VERSION_MINIMA_APP` y quien la tenga ve
 * un aviso para actualizar.
 *
 * Reglas:
 *  · `VERSION_ULTIMA_APP` es la última que se entregó al equipo.
 *  · `VERSION_MINIMA_APP` es la más vieja que todavía funciona. Subirla a una
 *    versión que no está instalada en todos los celulares bloquea a esa gente de
 *    hecho: antes de subirla, avisar y entregar el APK.
 */
export const VERSION_ULTIMA_APP = "1.0.0";
export const VERSION_MINIMA_APP = "1.0.0";

/** Compara «1.2.10» con «1.2.9» número por número; negativo si a < b. */
export function compararVersiones(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** ¿La versión instalada ya no sirve? */
export function appDesactualizada(instalada: string | null | undefined): boolean {
  return Boolean(instalada) && compararVersiones(instalada!, VERSION_MINIMA_APP) < 0;
}
