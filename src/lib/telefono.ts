// Debe reproducir exactamente normalizar_telefono() de
// supabase/migrations/0001_esquema_inicial.sql — se usa para que la búsqueda
// de duplicados en el cliente/servidor coincida con la columna generada
// `telefono_normalizado` de la base de datos.
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length > 9 && digitos.startsWith("51")) {
    return digitos.slice(2);
  }
  return digitos;
}

/**
 * LOS CELULARES QUE HAY ADENTRO DE UN CAMPO DE TELÉFONO.
 *
 * Gemelo en JS de `celulares_de()` (migración 0201). Existe porque
 * `normalizarTelefono` guarda los dígitos tal como se tipearon, y un dedazo
 * basta para que el mismo cliente no se reconozca:
 *
 *   «1 956 181 464»            → 1956181464          (un 1 de más)
 *   «987524031 / 987524031»    → 987524031987524031  (dos veces el mismo)
 *
 * Los dos son de la misma semana (PRO-09181 y PRO-09165, 07-09) y por los dos
 * se derivó a GRUPO SANTA ELENA y a NEWREST como si fueran clientes nuevos.
 *
 * Un celular peruano son 9 dígitos que empiezan en 9. Se lee de izquierda a
 * derecha y, al encontrar uno, se saltan sus 9 dígitos: mirar todas las
 * ventanas posibles inventaba números que nadie tiene —en «989001284942710197»
 * la ventana del medio da 900128494— y un número inventado puede empatar con
 * la ficha de otro cliente.
 *
 * El número extranjero escrito con su prefijo no entra: «+593 98 466 6031»
 * termina en nueve dígitos que empiezan en 9 y se hacía pasar por peruano.
 */
export function celularesDe(telefono: string | null | undefined): string[] {
  const bruto = (telefono ?? "").trim();
  const s = bruto.replace(/[^0-9]/g, "");
  if (bruto.startsWith("+") && !s.startsWith("51")) return [];
  const out: string[] = [];
  let i = 0;
  while (i <= s.length - 9) {
    const c = s.slice(i, i + 9);
    if (/^9[0-9]{8}$/.test(c)) {
      if (!out.includes(c)) out.push(c);
      i += 9;
    } else {
      i += 1;
    }
  }
  return out;
}
