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

// BUSCAR UN CHAT COMO EN WHATSAPP WEB (23-09, pedido de comercial): se escribe
// el número como venga —«987 654 321», «+51 987654321», los últimos dígitos—
// o parte del nombre, y aparece la conversación.

function sinTildes(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Los dígitos de lo que se escribió, o null si no es una búsqueda por número. */
export function digitosDeBusqueda(texto: string): string | null {
  const limpio = texto.trim();
  if (!/^[+\d\s().-]+$/.test(limpio)) return null;
  const digitos = limpio.replace(/\D/g, "");
  return digitos.length > 0 ? digitos : null;
}

/** ¿La conversación responde a lo que se escribió en el buscador? */
export function coincideBusquedaWa(
  datos: { telefono: string; usuario_wa?: string | null; nombre_wa?: string | null },
  texto: string,
): boolean {
  if (!texto.trim()) return true;
  const digitos = digitosDeBusqueda(texto);
  if (digitos) return esTelefonoDeVerdad(datos.telefono) && datos.telefono.includes(digitos);
  const buscado = sinTildes(texto.trim().replace(/^@/, ""));
  return [datos.nombre_wa, datos.usuario_wa].some((v) => !!v && sinTildes(v).includes(buscado));
}
