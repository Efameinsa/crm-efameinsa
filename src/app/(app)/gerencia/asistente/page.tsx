import { requerirRol } from "@/lib/auth";
import { AsistenteChat } from "@/components/crm/asistente-chat";

export const dynamic = "force-dynamic";

/**
 * El asistente de gerencia. Piloto.
 *
 * Nace de algo que Santos observó y que es el mejor argumento para
 * construirlo: en las reuniones, cuando el ing. Carlos pregunta algo puntual,
 * él tiene que salir a buscarlo. De las 260 preguntas que quedaron grabadas,
 * 57 empiezan con «¿dónde…?» y 35 con «¿cuánto…?».
 *
 * Solo gerencia y admin, y solo lectura.
 */
export default async function AsistentePage() {
  const perfil = await requerirRol(["gerencia", "admin"]);
  return <AsistenteChat nombre={perfil.nombre} />;
}
