// Identidad documental de cada razón social, transcrita de las cotizaciones
// reales en Descargas/PROYECTO CRM EFAMEINSA/modelos de cotizacion.
// El criterio de QUÉ serie usar por cliente sigue pendiente de gerencia
// (docs/03 R9) — aquí solo vive CÓMO se ve cada una.

export interface IdentidadSerie {
  nombreLegal: string;
  subtitulo: string;
  /** Color del membrete y acentos del documento. */
  acento: string;
  usaLogo: boolean; // EFAMEINSA usa el isotipo; OPEN es wordmark tipográfico
  pie: string[];
  cuentasBancarias: {
    titular: string;
    ruc: string;
    cuentas: { banco: string; moneda: string; corriente: string; cci: string }[];
  } | null;
}

export const IDENTIDAD_SERIE: Record<"EFAMEINSA" | "OPEN", IdentidadSerie> = {
  EFAMEINSA: {
    nombreLegal: "Corporación Efameinsa e Ingeniería S.A.",
    subtitulo:
      "Calderas Generadoras de Vapor, Máquinas de lavanderías y Equipos Industriales.",
    acento: "#7E1210",
    usaLogo: true,
    pie: [
      "www.efameinsa.com",
      "Av. Los Cisnes Mz. H-2 Lt. 18 Urb. Club de Huachipa",
      "Teléfono: (511) 371-0006  Telefax: (511) 371-0502",
    ],
    cuentasBancarias: null,
  },
  OPEN: {
    nombreLegal: "OPEN INVESTMENTS S.A.C",
    subtitulo: "Laundry & Equipment",
    acento: "#C0392B",
    usaLogo: false,
    pie: ["Av. Los Cisnes Mz. H-2 Lt. 18, Urb. Club de Huachipa"],
    // ⚠️ Transcritas del modelo Presu_100-26 (Hospedaje La Princesa) — pedir a
    // Santos que confirme los dígitos antes de enviar la primera cotización real.
    cuentasBancarias: {
      titular: "OPEN INVESTMENTS S.A.C",
      ruc: "20604375038",
      cuentas: [
        { banco: "BCP", moneda: "SOLES", corriente: "194-2586820-0-93", cci: "002-194002586820093-99" },
        { banco: "BCP", moneda: "DOLARES", corriente: "194-9287658-1-34", cci: "002-194009287658134-96" },
        { banco: "SCOTIABANK", moneda: "SOLES", corriente: "000-2240321", cci: "009-070-000002240321-46" },
        { banco: "SCOTIABANK", moneda: "DOLARES", corriente: "000-5133131", cci: "009-070-000005133131-42" },
      ],
    },
  },
};

/**
 * Dominio de correo de cada razón social. La firma del comercial cambia con la
 * serie: Katerine firma comercial5@efameinsa.com en una y
 * comercial5@openinvestments.com.pe en la otra (verificado con las firmas
 * reales que enviaron el 24-08). El usuario del correo es el mismo, cambia el
 * dominio — así no hay que guardar dos correos por persona.
 */
const DOMINIO_SERIE: Record<"EFAMEINSA" | "OPEN", string> = {
  EFAMEINSA: "efameinsa.com",
  OPEN: "openinvestments.com.pe",
};

/**
 * Correo del comercial en la razón social con la que está cotizando.
 *
 * ⚠️ EL DE OPEN NO SE DEDUCE SIEMPRE. La regla de cambiar el dominio se
 * estableció mirando la firma de Katerine (C5), donde efectivamente cambia a
 * openinvestments.com.pe. La primera firma que Ariana (C4) envió, el 24-08,
 * conservaba @efameinsa.com — pero el 26-08 reportó que ese dato estaba mal:
 * su correo real de OPEN es comercial4@openinvestments.com.pe y sí está
 * activo. Por eso el correo de OPEN se guarda por persona
 * (`perfiles.email_open`, migración 0070) en vez de asumir una regla única, y
 * solo se deduce cuando no está cargado — así nadie se queda sin correo.
 */
export function correoEnSerie(
  correo: string | null,
  serie: "EFAMEINSA" | "OPEN",
  correoOpen?: string | null,
): string | null {
  if (serie === "OPEN" && correoOpen) return correoOpen;
  if (!correo) return null;
  const usuario = correo.split("@")[0];
  return usuario ? `${usuario}@${DOMINIO_SERIE[serie]}` : correo;
}

/**
 * Las tres formas de entrega que la empresa maneja, para elegir por cotización.
 *
 * El primer punto de "Importante" decía "Entrega en agencias en la ciudad de
 * Lima" —lo que traían los modelos viejos en Word— y Brenda lo hizo corregir el
 * 24-08: la entrega es EN PLANTA, y prometer una agencia en Lima es un
 * compromiso de flete que la empresa no estaba asumiendo. Ese mismo día otra
 * comercial pidió poder decir justamente eso, o "en almacenes del cliente".
 *
 * No se contradicen: lo que estaba mal era que el texto fuera FIJO y prometiera
 * algo que no siempre se cumple. Elegido por cotización, dice lo que de verdad
 * se acordó con ese cliente.
 *
 * ⚠️ La tercera opción compromete flete hasta el cliente. Está acá porque se
 * pidió, pero conviene que gerencia decida si cualquiera puede ofrecerla.
 */
export const LUGARES_ENTREGA = [
  "Entrega en nuestras instalaciones.",
  "Entrega en agencia de transporte en la ciudad de Lima.",
  "Entrega en los almacenes del cliente.",
] as const;

/** La conservadora: es la que sale si nadie elige otra cosa. */
export const ENTREGA_POR_DEFECTO = LUGARES_ENTREGA[0];

/**
 * La garantía que se ofrece cuando no hay nada acordado todavía.
 *
 * Vive acá, con el resto de los textos por defecto del documento, porque la
 * usan LOS DOS papeles: la cotización que ve el cliente y el informe de cierre
 * que va a Central. Que dijeran cosas distintas es exactamente lo que pasaba
 * hasta el 28-08 — el cierre prometía «36 meses de garantía» (quemado en la
 * lista «Incluye») contra los 24 de la cotización, del manual de postventa y
 * del cálculo de `garantia_hasta` del parque instalado (migración 0087).
 *
 * Si gerencia confirma que la garantía comercial es otra, se cambia acá y
 * cambia en los dos documentos a la vez.
 */
export const GARANTIA_POR_DEFECTO = "24 meses";

/** Las garantías que se acuerdan de verdad, para dejarlas en un clic. NO es una
 *  lista cerrada: el campo sigue siendo de texto libre porque lo que se pacta a
 *  veces no es un plazo redondo ("12 meses de fábrica, 6 en la resistencia"). */
export const GARANTIAS_FRECUENTES = ["12 meses", "24 meses", "36 meses", "Garantía de fábrica"];

// Texto idéntico al de los modelos reales (página final). El punto 1 lo pone
// la cotización (ver `entregaLugar` en cotizacion-pdf.tsx).
export const PUNTOS_IMPORTANTES = [
  "Incluye juego de manuales de operación, servicio técnico y mantenimiento.",
  "La garantía cubre cualquier defecto de fábrica, no por causas externas al equipo y/o por falta de mantenimiento por servicio técnico autorizado.",
  "Asesoría para instalación (punto de agua, energía eléctrica, descarga y/o lo requerido para su operación).",
  "Los equipos ofertados están diseñados y fabricados bajo normas de calidad ISO.",
];

export const NOTAS = [
  "Efameinsa ofrece un convenio de mantenimiento preventivo que les permita tener un normal funcionamiento de los equipos durante el periodo de garantía y posterior a ello.",
  "La garantía ofrecida está vigente siempre que el Cliente cumpla con los estándares de instalación y mantenimiento periódico de acuerdo al manual del fabricante y/o de Efameinsa por servicio técnico autorizado.",
];

export const IGV = 0.18;
