/**
 * EL ZUMBIDO DEL «APURAR» (Santos, 23-10): «cuando esté el botón de apurar,
 * ¿puede generarse un ligero zumbido en la web, simulando al zumbido de
 * Messenger de hace años? Pero limitado solo un máximo de dos veces».
 *
 * A quien apuran desde el mapa le tiembla la pantalla medio segundo y suena el
 * «bzzz» (`sonarZumbido`). Solo el 1.º y el 2.º apuro de un mismo recorrido a
 * una misma área llevan zumbido; del 3.º en adelante queda la sirena de siempre
 * (y gerencia ya se enteró). El servidor marca el aviso con este prefijo en el
 * título; la campana lo reconoce. Sin cambio en la base.
 */
export const MARCA_ZUMBIDO = "📳 ";
export const MAXIMO_ZUMBIDOS = 2;

export function conZumbido(titulo: string, avisoNumero: number): string {
  return avisoNumero <= MAXIMO_ZUMBIDOS ? `${MARCA_ZUMBIDO}${titulo}` : titulo;
}

export function pideZumbido(n: { titulo?: string | null }): boolean {
  return (n.titulo ?? "").startsWith(MARCA_ZUMBIDO);
}

/** La sacudida de la pantalla (corta y suave). Quien pidió menos movimiento no la ve; el sonido sí suena. */
export function sacudirPantalla(): void {
  if (typeof document === "undefined") return;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const raiz = document.documentElement;
  raiz.classList.remove("crm-zumbido");
  void raiz.offsetWidth; // reinicia la animación si llegan dos seguidos
  raiz.classList.add("crm-zumbido");
  window.setTimeout(() => raiz.classList.remove("crm-zumbido"), 700);
}
