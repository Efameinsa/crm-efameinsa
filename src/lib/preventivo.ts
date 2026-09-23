/**
 * EL RELOJ DEL PREVENTIVO DE LAS MÁQUINAS NUEVAS (gerencia, 23-09-2026):
 * «Cada 3 meses se debe alertar para empezar el proceso de envío de propuestas
 * y concluir cierres antes de los 4 meses».
 *
 * Santos, el mismo día: aplica SOLO a las máquinas que suben al parque desde
 * ahora; las que ya estaban conservan la fecha que tenían (migración 0277).
 *
 * Vive fuera de los archivos "use server" y "use client" porque lo leen los
 * dos lados (ver reglas de la casa, docs/29 §0).
 */

/** Meses entre la entrega y el primer preventivo de una máquina nueva. */
export const MESES_PRIMER_PREVENTIVO = 4;

/**
 * Con cuántos días de anticipación se avisa: a los 3 meses, o sea un mes
 * antes del vencimiento de los 4. Es la ventana de «Preventivos por ofrecer»
 * en la agenda, el reporte diario y el macro de postventa.
 */
export const DIAS_AVISO_PREVENTIVO = 30;

/** El rótulo común de ese bloque, para que las tres pantallas digan lo mismo. */
export const TITULO_PREVENTIVOS_POR_OFRECER = `Preventivos por ofrecer (vencen en ${DIAS_AVISO_PREVENTIVO} días o ya vencidos)`;

/** La regla dicha en una línea, para la ayuda de esos bloques. */
export const REGLA_PREVENTIVO = "Se ofrece a los 3 meses y se cierra antes de los 4.";
