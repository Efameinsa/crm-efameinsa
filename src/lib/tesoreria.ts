/**
 * Tesorería y Finanzas: a dónde va lo que llega a Central y no es una venta.
 *
 * Vive en su propio archivo y no junto a la acción porque un módulo marcado
 * `"use server"` solo puede exportar funciones asíncronas — el build lo rechaza
 * de plano—, y el número lo necesitan los dos lados: el servidor para armar el
 * mensaje y la pantalla para decirle a Central a quién le va a escribir.
 *
 * Y se llama `tesoreria` y no `finanzas` porque `lib/finanzas.ts` ya existe y
 * es otra cosa: el tablero de finanzas y marketing de gerencia (migración
 * 0042). Dos cosas distintas con el mismo nombre es cómo se pisa un archivo.
 *
 * El número lo pasó Santos el 31-08-2026, después de que gerencia definiera el
 * circuito: «asigno a Finanzas y le llega el mensaje a su WhatsApp».
 */

/** Como se muestra en pantalla. */
export const TELEFONO_FINANZAS = "+51 981 490 197";

/** Como lo pide WhatsApp: solo dígitos, con código de país y sin el signo. */
export const NUMERO_WHATSAPP_FINANZAS = "51981490197";

/** A quién se le escribe, para que el mensaje no arranque en frío. */
export const CONTACTO_FINANZAS = "John";

/**
 * El correo de Finanzas, además del WhatsApp.
 *
 * Carlos, 05-09: «yo elegí WhatsApp por ser un canal rápido — muy bien. Yo
 * creo que debería ser también a la vez por correo (…) el correo sí sería
 * importante en todo caso». Santos pasó la dirección en esa misma
 * conversación. Van los dos: el WhatsApp para que se enteren ahora, el correo
 * para que quede.
 */
export const CORREO_FINANZAS = "Contabilidad1@efameinsa.com";
