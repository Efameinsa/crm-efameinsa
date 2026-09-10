// ============================================================
// CRM EFAMEINSA · El maestro ya no manda sobre el catálogo
// ============================================================
// Santos, 10-09-2026: «ya dejemos de trabajar con el maestro; de ahora en
// adelante Lesly es la que va a gestionar, no necesitas tomar la referencia del
// maestro, es la nueva regla».
//
// Deroga la regla del 25-08 («en el sistema solo pueden estar los productos que
// se encuentran en el Excel del maestro de Lesly») y la del 27-08 («todo lo
// demás será retirado»). El catálogo vivo es el del CRM: lo que Lesly carga,
// corrige, activa o retira desde su pantalla, con la ficha que sale del Word.
//
// POR QUÉ ESTO ES UN PORTÓN Y NO UN COMENTARIO. Estos scripts no leen: escriben
// el catálogo entero de una pasada, y el que alinea con el maestro RETIRA todo
// lo que el Excel no lista. El 28-08 se llevó puestas la SECU75E, la SECU75E2 y
// la SECU75E3 —las tres con ficha, precio y fotos— porque el maestro las
// codifica sin la U. Correr cualquiera de ellos hoy le deshace a Lesly el
// trabajo del día sin preguntar y sin dejar rastro visible en pantalla.
//
// Si alguna vez gerencia decide volver a cargar desde un Excel, el camino está:
// se corre con `--igual-correrlo` y queda dicho en el registro por qué.

const PERMISO = "--igual-correrlo";

if (!process.argv.includes(PERMISO)) {
  const quien = (process.argv[1] ?? "este script").split(/[\/]/).pop();
  console.error(
    [
      "",
      `✋ ${quien} carga el catálogo desde el maestro, y el maestro YA NO MANDA.`,
      "",
      "   Regla nueva (Santos, 10-09-2026): el catálogo lo gestiona Lesly desde",
      "   su pantalla de operaciones. Lo que hay en el CRM es lo bueno; el Excel",
      "   es, como mucho, un papel de consulta.",
      "",
      "   Este script RETIRA o PISA equipos que Lesly cargó a mano —el 28-08 sacó",
      "   del catálogo la SECU75E, la SECU75E2 y la SECU75E3, con ficha y todo—,",
      "   así que no corre solo por costumbre.",
      "",
      `   Si gerencia lo pide expresamente: node ${process.argv[1]} ${PERMISO}`,
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.warn(`⚠ Corriendo ${process.argv[1]?.split(/[\/]/).pop()} contra la regla del 10-09: el maestro ya no manda. Que quede dicho por qué.`);
