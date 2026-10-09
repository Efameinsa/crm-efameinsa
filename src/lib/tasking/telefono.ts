/** Deja solo dígitos con código de país. Un celular peruano de 9 dígitos recibe el 51 adelante. */
export function normalizarWhatsapp(entrada: string | null | undefined) {
  const d = String(entrada ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 9 && d.startsWith('9')) return `51${d}`;
  return d;
}
