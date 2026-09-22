// Cómo se nombra a quien escribe por WhatsApp (0264). Desde que WhatsApp
// tiene nombres de usuario, `telefono` puede no ser un número sino el
// identificador que manda Meta (PE.1656…): eso no se le muestra a nadie.

export function esTelefonoDeVerdad(valor: string | null | undefined): boolean {
  return !!valor && /^[0-9]{6,15}$/.test(valor);
}

/** Lo que va debajo del nombre: el número, o «@usuario» si oculta su número. */
export function etiquetaDeContactoWa(datos: { telefono: string; usuario_wa?: string | null }): string {
  if (esTelefonoDeVerdad(datos.telefono)) return datos.telefono;
  return datos.usuario_wa ? `@${datos.usuario_wa}` : "Sin número visible";
}
