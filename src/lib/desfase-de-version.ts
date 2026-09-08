/**
 * ¿ESTE ERROR ES LA VERSIÓN VIEJA, O ES UN ERROR DE VERDAD?
 *
 * Cuando se despliega, Vercel reemplaza los archivos de la aplicación. Quien
 * tenía el CRM abierto sigue con la versión vieja cargada, y en el siguiente
 * clic pide algo que ya no existe. Son dos familias de fallo y las dos
 * significan lo mismo: hay que recargar, no hay nada roto.
 *
 *  1. UN ARCHIVO QUE NO ESTÁ — un chunk de JavaScript de la versión anterior.
 *  2. UNA ACCIÓN QUE NO ESTÁ — guardar una gestión, cambiar una etapa: cada
 *     una viaja con un identificador que el servidor debe reconocer, y los de
 *     la versión vieja dejan de existir. Next contesta «Failed to find Server
 *     Action … from an older or newer deployment».
 *
 * Hasta el 08-09 solo se reconocía la primera, y por eso una gestión guardada
 * sin internet se reintentaba cada treinta segundos contra una acción que ya
 * no existía, para siempre.
 *
 * La cuenta de Vercel es gratuita y «Skew Protection» —que mantiene vivos los
 * archivos de la versión anterior— es de plan Pro, así que el CRM tiene que
 * darse cuenta solo. Esto es lo que le permite distinguirlo.
 */
export function esDesfaseDeVersion(e: unknown): boolean {
  const err = e as { name?: string; message?: string } | null;
  const texto = `${err?.name ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (!texto.trim()) return false;
  return (
    texto.includes("chunkloaderror") ||
    texto.includes("loading chunk") ||
    texto.includes("loading css chunk") ||
    texto.includes("failed to fetch dynamically imported module") ||
    texto.includes("importing a module script failed") ||
    texto.includes("error loading dynamically imported module") ||
    texto.includes("failed to find server action") ||
    texto.includes("older or newer deployment")
  );
}
