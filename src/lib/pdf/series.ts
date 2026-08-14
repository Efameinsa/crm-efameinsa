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

// Texto idéntico al de los modelos reales (página final).
export const PUNTOS_IMPORTANTES = [
  "Entrega en agencias en la ciudad de Lima.",
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
