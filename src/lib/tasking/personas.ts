import { normalizarWhatsapp } from './telefono';

/** Limpia lo que llega del formulario de equipo. */
export function filaPersona(b: Record<string, unknown>) {
  const fila: Record<string, unknown> = {};
  if (b.nombre !== undefined) fila.nombre = String(b.nombre).trim().slice(0, 80);
  if (b.apodos !== undefined) fila.apodos = String(b.apodos).trim().slice(0, 200);
  if (b.cargo !== undefined) fila.cargo = String(b.cargo).trim().slice(0, 80);
  if (b.correo !== undefined) fila.correo = String(b.correo).trim().toLowerCase() || null;
  if (b.whatsapp !== undefined) fila.whatsapp = normalizarWhatsapp(String(b.whatsapp));
  if (b.es_gerencia !== undefined) fila.es_gerencia = !!b.es_gerencia;
  if (b.activo !== undefined) fila.activo = !!b.activo;
  return fila;
}
