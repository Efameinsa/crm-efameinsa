// CASOS DE CENTRAL A LAS ÁREAS (0573, Santos 21-10): «Central debería poder
// derivar casos a Finanzas, Facturación y RR. HH.». Tipos
// y motivos (la lectura está en casos-central-lista.ts, solo del servidor).

export type AreaCaso = "finanzas" | "facturacion" | "rrhh";
export type EstadoCaso = "nuevo" | "tomado" | "esperando_central" | "respondido" | "cerrado";
export type TipoPaso = "derivado" | "tomado" | "pide_dato" | "contesta" | "respondido" | "cerrado" | "insiste" | "vencido";

export interface AdjuntoCaso {
  path: string;
  nombre: string;
  tipo: string;
  tamano: number;
}

/**
 * Las áreas y sus motivos. RR. HH. queda prevista (Yasmin,
 * recursoshumanos@efameinsa.com) pero sin cuenta en el CRM todavía: el
 * diálogo la muestra apagada y la base no deja derivarle.
 */
export const AREAS_CASO: { valor: AreaCaso; etiqueta: string; ayuda: string; disponible: boolean; motivos: string[] }[] = [
  {
    valor: "finanzas",
    etiqueta: "Finanzas",
    ayuda: "pagos, abonos, devoluciones",
    disponible: true,
    motivos: ["Confirmar abono", "Pedido por despachar sin pago", "Devolución al cliente", "Cargo bancario / interplaza", "Crédito o letras", "Otro"],
  },
  {
    valor: "facturacion",
    etiqueta: "Facturación",
    ayuda: "facturas, notas de crédito",
    disponible: true,
    motivos: ["Emitir factura ya", "Corregir factura", "Nota de crédito", "Reenviar factura al cliente", "Guía de remisión", "Otro"],
  },
  {
    valor: "rrhh",
    etiqueta: "RR. HH.",
    ayuda: "todavía no tiene cuenta en el CRM",
    disponible: false,
    motivos: [],
  },
];

export const ETIQUETA_AREA: Record<AreaCaso, string> = { finanzas: "Finanzas", facturacion: "Facturación", rrhh: "RR. HH." };

export const ESTADO_CASO: Record<EstadoCaso, { etiqueta: string; clase: string; franja: string }> = {
  nuevo: { etiqueta: "Nuevo · sin tomar", clase: "bg-secondary text-foreground", franja: "bg-border" },
  tomado: { etiqueta: "En manos del área", clase: "bg-sky-500/12 text-sky-800 dark:text-sky-300", franja: "bg-sky-600" },
  esperando_central: { etiqueta: "Esperando a Central", clase: "bg-amber-500/15 text-amber-900 dark:text-amber-200", franja: "bg-amber-500" },
  respondido: { etiqueta: "Respondido", clase: "bg-[#1E7F4F]/10 text-[#1E7F4F]", franja: "bg-[#1E7F4F]" },
  cerrado: { etiqueta: "Cerrado", clase: "bg-secondary text-muted-foreground", franja: "bg-border" },
};

export const TEXTO_PASO: Record<TipoPaso, string> = {
  derivado: "derivó el caso",
  tomado: "tomó el caso",
  pide_dato: "pidió un dato a Central",
  contesta: "contestó",
  respondido: "respondió",
  cerrado: "cerró el caso",
  insiste: "volvió a avisar",
  vencido: "Venció el plazo",
};

export const codigoCaso = (numero: number) => `CC-${String(numero).padStart(4, "0")}`;

export interface PasoCaso {
  id: string;
  tipo: TipoPaso;
  texto: string | null;
  autor: string | null;
  created_at: string;
  adjuntos: (AdjuntoCaso & { url: string | null })[];
}

export interface CasoCentral {
  id: string;
  codigo: string;
  area: AreaCaso;
  motivo: string;
  mensaje: string;
  urgente: boolean;
  vence_at: string | null;
  vencido: boolean;
  cuenta_id: string | null;
  servicio_id: string | null;
  numero_pedido: string | null;
  cliente: string;
  estado: EstadoCaso;
  creado_por: string;
  creado_por_nombre: string;
  tomado_por: string | null;
  tomado_por_nombre: string | null;
  tomado_at: string | null;
  respuesta: string | null;
  respondido_por_nombre: string | null;
  respondido_at: string | null;
  /** Respondido en los últimos 7 días (para el cajón). */
  respondido_semana: boolean;
  avisos_n: number;
  created_at: string;
  updated_at: string;
  adjuntos: (AdjuntoCaso & { url: string | null })[];
  pasos: PasoCaso[];
}

/** Lo que exige atención primero: vencidos, urgentes, lo que espera al lado que mira, y al final lo cerrado. */
export function ordenCaso(c: CasoCentral, lado: "central" | "area"): number {
  if (c.estado === "cerrado") return 9;
  if (c.vencido) return 0;
  if (lado === "central") {
    if (c.estado === "esperando_central") return 1;
    if (c.estado === "respondido") return 4;
    return c.urgente ? 2 : 3;
  }
  if (c.estado === "nuevo") return c.urgente ? 1 : 2;
  if (c.estado === "tomado") return c.urgente ? 2 : 3;
  if (c.estado === "esperando_central") return 5;
  return 6;
}
