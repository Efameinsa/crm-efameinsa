// ============================================================
// Qué es un equipo y en qué segmento entra, leyendo cómo se llama
// ============================================================
// Salió de la carga del catálogo (`scripts/fichas-v-12-cargar.mjs`, 28-08), que
// tenía que clasificar los códigos nuevos que Lesly iba agregando. Vive acá
// porque ahora también la usa la pantalla donde Lesly arrastra un Word: si las
// dos clasificaran distinto, el mismo equipo entraría en una categoría cargado
// desde el script y en otra cargado desde la pantalla, y el filtro del catálogo
// mostraría dos familias donde hay una.
//
// Las claves son las de `src/lib/tipos-equipo.ts`: la hoja de edición se acomoda
// al tipo —una plancha no muestra «panel computarizado»— y tienen que coincidir.

/**
 * @param texto  cómo se llama el equipo: la descripción del maestro, o el
 *               nombre del Word cuando no hay maestro todavía
 */
export function clasificar(texto) {
  const t = String(texto ?? "").toUpperCase();
  const categoria = /COCHE|CARRO/.test(t)
    ? "coche"
    : /LAVADORA\s*SECADORA|TORRE/.test(t)
      ? "lavadora-secadora"
      : /LAVADORA/.test(t)
        ? "lavadora"
        : /SECADORA/.test(t)
          ? "secadora"
          : /RODILLO|CALANDRIA|PRENSA|MESA|CALDERIN|PLANCHAD/.test(t)
            ? "planchador"
            : "otro";
  // El segmento decide el piso de precio (migración 0074): semi-industrial son
  // los equipos de mostrador —calderines, mesas, torres LG—; el resto es
  // industrial.
  const segmento = /CALDERIN|MINI|SEMI\s*INDUSTRIAL|APILABLE/.test(t) ? "semi_industrial" : "industrial";
  return { categoria, segmento };
}
