// Tipos y catálogos del buzón de sugerencias (0399). Aparte de la acción
// «use server» porque esa solo puede exportar funciones asíncronas.

export type TipoSugerencia = "mejora" | "error" | "idea" | "duda";
export type EstadoSugerencia = "nueva" | "revisando" | "hecha" | "descartada";

export const TIPOS_SUGERENCIA: { valor: TipoSugerencia; etiqueta: string; ayuda: string; emoji: string }[] = [
  { valor: "error", etiqueta: "Algo falla", ayuda: "Un botón que no responde, un dato mal, un error en pantalla", emoji: "🐞" },
  { valor: "mejora", etiqueta: "Mejorar algo", ayuda: "Funciona, pero podría ser más rápido o más claro", emoji: "🛠️" },
  { valor: "idea", etiqueta: "Idea nueva", ayuda: "Algo que hoy no existe y le ayudaría a vender o atender", emoji: "💡" },
  { valor: "duda", etiqueta: "Duda", ayuda: "No sabe cómo hacer algo en el CRM", emoji: "❓" },
];

export const ESTADOS_SUGERENCIA: { valor: EstadoSugerencia; etiqueta: string; clase: string }[] = [
  { valor: "nueva", etiqueta: "Recibida", clase: "bg-sky-500/12 text-sky-800 dark:text-sky-300" },
  { valor: "revisando", etiqueta: "En revisión", clase: "bg-amber-500/15 text-amber-800 dark:text-amber-300" },
  { valor: "hecha", etiqueta: "Hecha", clase: "bg-[#1E7F4F]/12 text-[#1E7F4F]" },
  { valor: "descartada", etiqueta: "No se hará", clase: "bg-secondary text-muted-foreground" },
];

export interface AdjuntoSugerencia {
  path: string;
  nombre: string;
  tipo: string;
  tamano: number;
}

export interface Sugerencia {
  id: string;
  autor_id: string;
  autor_nombre: string;
  autor_codigo: string | null;
  tipo: TipoSugerencia;
  pantalla: string | null;
  titulo: string;
  detalle: string;
  adjuntos: (AdjuntoSugerencia & { url: string | null })[];
  estado: EstadoSugerencia;
  respuesta: string | null;
  respondida_por_nombre: string | null;
  respondida_at: string | null;
  created_at: string;
}

/** Nombre legible de la pantalla desde donde se abrió el buzón («/whatsapp/abc» → «Conversaciones»). */
export function nombreDePantalla(ruta: string | null | undefined): string | null {
  if (!ruta) return null;
  const r = ruta.split("?")[0];
  const mapa: [RegExp, string][] = [
    [/^\/whatsapp/, "Conversaciones (WhatsApp)"],
    [/^\/comercial\/oportunidades\/[^/]+\/cotizar/, "Cotizador"],
    [/^\/comercial\/oportunidades\/[^/]+/, "Expediente del cliente"],
    [/^\/comercial\/oportunidades/, "Oportunidades"],
    [/^\/comercial\/cartera\/[^/]+/, "Ficha del cliente"],
    [/^\/comercial\/cartera/, "Clientes"],
    [/^\/comercial\/agenda/, "Agenda"],
    [/^\/comercial\/cotizaciones/, "Cotizaciones y ventas"],
    [/^\/comercial\/cierres/, "Cierres"],
    [/^\/comercial\/mi-gestion|^\/comercial\/numeros/, "Mis números"],
    [/^\/comercial$|^\/nuevo$|^\/nuevo\/hoy/, "Hoy"],
    [/^\/central/, "Central"],
    [/^\/postventa/, "Postventa"],
    [/^\/almacen/, "Almacén"],
    [/^\/finanzas/, "Finanzas"],
    [/^\/facturacion/, "Facturación"],
    [/^\/operaciones/, "Operaciones"],
    [/^\/gerencia/, "Gerencia"],
    [/^\/files/, "Files"],
  ];
  return mapa.find(([re]) => re.test(r))?.[1] ?? r;
}
