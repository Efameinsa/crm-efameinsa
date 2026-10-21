// CASOS DE CENTRAL A LAS ÁREAS (0573, Santos 21-10): «Central debería poder
// derivar casos a Finanzas, Facturación y RR. HH.». Tipos, motivos y la
// lectura de los casos. Aparte de la acción «use server», que solo puede
// exportar funciones asíncronas.

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

const SELECT =
  "id, numero, area, motivo, mensaje, urgente, vence_at, cuenta_id, servicio_id, cliente_texto, adjuntos, estado, creado_por, tomado_por, tomado_at, respuesta, respondido_at, avisos_n, created_at, updated_at, " +
  "creador:perfiles!casos_central_creado_por_fkey(nombre), tomo:perfiles!casos_central_tomado_por_fkey(nombre), respondio:perfiles!casos_central_respondido_por_fkey(nombre), " +
  "servicio:servicios_postventa(numero_pedido_erp), " +
  "pasos:casos_central_pasos(id, tipo, texto, adjuntos, created_at, autor:perfiles(nombre))";

/**
 * Los casos que ve quien mira (lo decide la RLS: Central todos, cada área los
 * suyos). `area` filtra para la bandeja de un área; los cerrados de más de
 * 15 días no se traen.
 */
export async function listarCasosCentral(filtro: { area?: AreaCaso; servicioId?: string } = {}): Promise<CasoCentral[]> {
  const supabase = await createClient();
  const desde = new Date(Date.now() - 15 * 86_400_000).toISOString();
  let q = supabase.from("casos_central").select(SELECT).or(`estado.neq.cerrado,cerrado_at.gte.${desde}`).order("created_at", { ascending: false }).limit(300);
  if (filtro.area) q = q.eq("area", filtro.area);
  if (filtro.servicioId) q = q.eq("servicio_id", filtro.servicioId);
  const { data } = await q;
  const filas = (data ?? []) as unknown as Record<string, unknown>[];

  // Los archivos se firman con la llave del servidor: la fila ya pasó la RLS.
  const rutas = filas.flatMap((f) => [
    ...((f.adjuntos as AdjuntoCaso[]) ?? []).map((a) => a.path),
    ...((f.pasos as { adjuntos: AdjuntoCaso[] }[]) ?? []).flatMap((p) => (p.adjuntos ?? []).map((a) => a.path)),
  ]);
  const url = new Map<string, string>();
  if (rutas.length) {
    const admin = createAdminClient();
    const unicas = [...new Set(rutas)];
    for (let i = 0; i < unicas.length; i += 100) {
      const { data: firmadas } = await admin.storage.from("adjuntos").createSignedUrls(unicas.slice(i, i + 100), 3600);
      for (const f of firmadas ?? []) if (f.path && f.signedUrl) url.set(f.path, f.signedUrl);
    }
  }
  const conUrl = (lista: AdjuntoCaso[] | null | undefined) => (lista ?? []).map((a) => ({ ...a, url: url.get(a.path) ?? null }));
  const ahora = Date.now();

  return filas.map((f) => {
    const nombre = (x: unknown) => (x as { nombre: string } | null)?.nombre ?? null;
    const estado = f.estado as EstadoCaso;
    const vence = f.vence_at as string | null;
    const pasos = ((f.pasos as Record<string, unknown>[]) ?? [])
      .map((p) => ({
        id: p.id as string,
        tipo: p.tipo as TipoPaso,
        texto: p.texto as string | null,
        autor: nombre(p.autor),
        created_at: p.created_at as string,
        adjuntos: conUrl(p.adjuntos as AdjuntoCaso[]),
      }))
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
    return {
      id: f.id as string,
      codigo: codigoCaso(f.numero as number),
      area: f.area as AreaCaso,
      motivo: f.motivo as string,
      mensaje: f.mensaje as string,
      urgente: Boolean(f.urgente),
      vence_at: vence,
      // Vencido = pasó el plazo y nadie lo tomó; tomado a tiempo ya tiene dueño.
      vencido: estado === "nuevo" && Boolean(vence) && new Date(vence!).getTime() < ahora,
      cuenta_id: f.cuenta_id as string | null,
      servicio_id: f.servicio_id as string | null,
      numero_pedido: (f.servicio as { numero_pedido_erp: string | null } | null)?.numero_pedido_erp ?? null,
      cliente: (f.cliente_texto as string | null) ?? "Sin cliente",
      estado,
      creado_por: f.creado_por as string,
      creado_por_nombre: nombre(f.creador) ?? "Central",
      tomado_por: f.tomado_por as string | null,
      tomado_por_nombre: nombre(f.tomo),
      tomado_at: f.tomado_at as string | null,
      respuesta: f.respuesta as string | null,
      respondido_por_nombre: nombre(f.respondio),
      respondido_at: f.respondido_at as string | null,
      respondido_semana: Boolean(f.respondido_at) && new Date(f.respondido_at as string).getTime() > ahora - 7 * 86_400_000,
      avisos_n: (f.avisos_n as number) ?? 1,
      created_at: f.created_at as string,
      updated_at: f.updated_at as string,
      adjuntos: conUrl(f.adjuntos as AdjuntoCaso[]),
      pasos,
    };
  });
}
