/**
 * LA GUÍA DEL ASISTENTE: de docs/asistente-guia-del-crm.md a código.
 *
 * El asistente explica cómo funciona el CRM con esta guía (reglas vigentes,
 * quién ve qué, preguntas frecuentes). Se escribe y se corrige en el .md, que
 * es legible para cualquiera; este script la copia a
 * src/lib/asistente/conocimiento.ts para que viaje dentro de la compilación
 * (leer un archivo suelto en el servidor depende de dónde quedó la carpeta).
 *
 * Uso, después de editar la guía:  node scripts/generar-guia-asistente.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const md = readFileSync("docs/asistente-guia-del-crm.md", "utf8").replace(/\r\n/g, "\n").trim();
const ts = `// GENERADO por scripts/generar-guia-asistente.mjs desde docs/asistente-guia-del-crm.md.
// No se edita a mano: se corrige la guía y se vuelve a generar.
export const CONOCIMIENTO = ${JSON.stringify(md)};
`;
writeFileSync("src/lib/asistente/conocimiento.ts", ts);
console.log(`Guía del asistente: ${md.split(/\s+/).length} palabras → src/lib/asistente/conocimiento.ts`);
