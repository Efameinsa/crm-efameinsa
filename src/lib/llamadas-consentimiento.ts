/**
 * El texto que acepta quien graba llamadas con el botón «Llamar», y su versión.
 *
 * Santos (19-10-2026): las llamadas que los comerciales hacen con el celular de la
 * empresa y con el botón del CRM se graban y se guardan en el servidor de la oficina,
 * con su transcripción y un resumen. La persona ACEPTA antes de que empiece, y queda
 * escrito qué texto vio (misma tabla que el GPS: `consentimientos_rastreo`, otra
 * versión): informar qué se registra, para qué y quién lo ve es lo que pide la Ley
 * 29733 de protección de datos personales. Si el texto cambia, se sube la versión y
 * la app vuelve a pedir la aceptación.
 */

/** Súbelo cuando cambie el texto: la app vuelve a pedir la aceptación. Empieza por «llamadas-» para no confundirse con la del GPS. */
export const VERSION_CONSENTIMIENTO_LLAMADAS = "llamadas-2026-10-19";

export const TEXTO_CONSENTIMIENTO_LLAMADAS = {
  titulo: "Grabación de las llamadas hechas con el CRM",
  puntos: [
    "Qué se graba: el audio de las llamadas que usted hace con el botón «Llamar» del CRM (las dos voces). Las llamadas que hace por otro lado no se graban.",
    "Qué se guarda: el audio, su transcripción escrita y un resumen hecho con inteligencia artificial, junto con el cliente, la hora y la duración. Todo queda en el servidor de la oficina, ordenado por cliente y por día.",
    "Para qué: dar seguimiento a la gestión comercial, resolver dudas sobre lo que se prometió y capacitar al equipo.",
    "Quién lo ve: usted ve sus llamadas; gerencia y administración ven todas. No se comparte con terceros.",
    "Al empezar cada llamada, avise al cliente: «Esta llamada puede ser grabada para fines de calidad y seguimiento».",
    "Se conservan 12 meses; después se borran.",
  ],
  pie: "Esto se hace conforme a la Ley 29733 de protección de datos personales. Al aceptar, usted declara que lo sabe y lo autoriza.",
} as const;
