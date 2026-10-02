/**
 * El texto que acepta quien lleva el celular de campo, y su versión.
 *
 * REGLA DE GERENCIA (Santos, 01-10-2026): el GPS de la app va activo **las 24
 * horas, todos los días**. Es el celular de la EMPRESA —se lo pueden llevar a
 * otros lados y por seguridad es lo que corresponde—, y el vendedor sabe que lo
 * lleva a su gestión, que es de todas las horas porque atiende a clientes
 * corporativos en cenas, viajes y a cualquier hora. Por eso NO hay horario.
 *
 * Aun así la persona ACEPTA antes de que empiece, y queda escrito qué texto vio
 * (`consentimientos_rastreo`): informarle qué se registra, para qué y quién lo ve
 * es lo que pide la Ley 29733 de protección de datos personales, y es lo que
 * demuestra que el vendedor lo sabía. Si este texto cambia, se sube
 * VERSION_CONSENTIMIENTO y la app vuelve a pedir la aceptación.
 */

/** Súbelo cuando cambie el texto: la app vuelve a pedir la aceptación. */
export const VERSION_CONSENTIMIENTO = "2026-10-01-24h";

export const TEXTO_CONSENTIMIENTO = {
  titulo: "Registro de la ubicación de este celular",
  puntos: [
    "Qué se registra: la ubicación de este celular de la empresa (con el GPS), la hora, la velocidad y el nivel de batería.",
    "Cuándo: las 24 horas, todos los días, mientras tenga la sesión iniciada. El celular es de la empresa y su gestión atiende a clientes a cualquier hora.",
    "Para qué: coordinar las visitas y el trabajo de campo, y la seguridad del equipo y del celular.",
    "Quién lo ve: gerencia y administración del CRM. No se comparte con terceros.",
    "Si se queda sin señal, el celular guarda los puntos y los envía al volver la cobertura.",
  ],
  pie: "Esto se hace conforme a la Ley 29733 de protección de datos personales. Al aceptar, usted declara que lo sabe y lo autoriza.",
} as const;
