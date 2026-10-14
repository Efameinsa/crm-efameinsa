/**
 * LO QUE SABE EL ASISTENTE: de docs/ a código.
 *
 * Cinco documentos, legibles para cualquiera, que se escriben y se corrigen en
 * docs/; este script los copia a src/lib/asistente/conocimiento.ts para que
 * viajen dentro de la compilación (leer un archivo suelto en el servidor
 * depende de dónde quedó la carpeta):
 *
 *   · asistente-guia-del-crm.md       cómo funciona hoy: reglas, quién ve qué
 *   · asistente-bitacora-general.md   la historia: reuniones, decisiones, casos
 *                                     y pendientes. Para TODO el personal.
 *   · asistente-bitacora-ampliada.md  estrategia, publicidad, metas, desempeño y
 *                                     montos: gerencia, admin, Central y operaciones.
 *   · asistente-bitacora-reservada.md temas de personal y control: solo gerencia/admin.
 *   · asistente-bitacora-finanzas.md  dinero, crédito, letras, guías, facturación:
 *                                     Finanzas y Contabilidad.
 * Cada bitácora le llega al asistente SOLO para el nivel que le corresponde
 * (permisos.ts → nivelDeContexto, instrucciones.ts → bitacorasDe).
 *
 * Uso, después de editar cualquiera:  node scripts/generar-guia-asistente.mjs
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const leer = (f) => (existsSync(f) ? readFileSync(f, "utf8").replace(/\r\n/g, "\n").trim() : "");
const guia = leer("docs/asistente-guia-del-crm.md");
const general = leer("docs/asistente-bitacora-general.md");
const ampliada = leer("docs/asistente-bitacora-ampliada.md");
const reservada = leer("docs/asistente-bitacora-reservada.md");
const finanzas = leer("docs/asistente-bitacora-finanzas.md");

const ts = `// GENERADO por scripts/generar-guia-asistente.mjs desde docs/asistente-*.md.
// No se edita a mano: se corrigen los documentos y se vuelve a generar.
export const CONOCIMIENTO = ${JSON.stringify(guia)};

export const BITACORA_GENERAL = ${JSON.stringify(general)};

/** Gerencia, admin, Central y operaciones. */
export const BITACORA_AMPLIADA = ${JSON.stringify(ampliada)};

/** Solo gerencia y admin. */
export const BITACORA_RESERVADA = ${JSON.stringify(reservada)};

/** Finanzas y Contabilidad. */
export const BITACORA_FINANZAS = ${JSON.stringify(finanzas)};
`;
writeFileSync("src/lib/asistente/conocimiento.ts", ts);
const p = (t) => t.split(/\s+/).filter(Boolean).length;
console.log(`Guía ${p(guia)} · bitácora general ${p(general)} · ampliada ${p(ampliada)} · reservada ${p(reservada)} · finanzas ${p(finanzas)} palabras → src/lib/asistente/conocimiento.ts`);
