import Link from "@/components/enlace";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, Cpu, Printer } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import { etiquetaTipoServicio, seriesDeTexto } from "@/lib/postventa";
import { NombreAFicha } from "@/components/crm/nombre-a-ficha";
import { Suspense } from "react";
import { CorregirInformeServicio } from "@/components/crm/corregir-informe-servicio";

export const dynamic = "force-dynamic";

/**
 * Un informe de servicio, completo.
 *
 * Sigue la cabecera de los anexos 1 a 5 del manual —cliente, asunto, fecha de
 * visita, fecha de informe, quién lo elabora, técnico, equipo con serie— y
 * después el trabajo realizado, las observaciones y el registro fotográfico,
 * que el manual exige en los cinco formatos: «todo proceso contará con un
 * registro fotográfico que será adjuntado en el informe».
 *
 * Es el documento que se muestra cuando el cliente reclama. Por eso arriba de
 * todo van la fecha y la hora, y por eso la conformidad firmada tiene su propio
 * bloque: son las dos cosas que se miran primero en esa conversación.
 */

interface Foto {
  path: string;
  etiqueta?: string;
  nombre?: string;
}

const ETIQUETA_MODALIDAD: Record<string, string> = {
  in_situ: "En sitio",
  videollamada: "Videollamada",
  planta: "En planta",
};

const ETIQUETA_CAPACITACION: Record<string, string> = {
  uso: "Uso del equipo",
  cuidado: "Cuidado",
  mantenimiento_diario: "Mantenimiento diario",
};

export default async function InformeServicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const perfil = (await requerirPerfil()) as unknown as {
    id: string;
    rol: string;
    es_postventa?: boolean | null;
    hace_postventa?: boolean | null;
    es_operaciones?: boolean | null;
    es_almacen?: boolean | null;
  };
  const supabase = await createClient();

  const { data } = await supabase
    .from("informes_servicio")
    .select("*, cuentas(id, razon_social), equipos_instalados(id, serie), perfiles!informes_servicio_elaborado_por_fkey(nombre)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const cuenta = data.cuentas as unknown as { id: string; razon_social: string } | null;
  const equipo = data.equipos_instalados as unknown as { id: string; serie: string } | null;
  const elaborado = data.perfiles as unknown as { nombre: string } | null;
  const fotos = (data.fotos ?? []) as Foto[];
  const capacitacion = (data.capacitacion ?? {}) as Record<string, boolean>;
  const capacitados = (data.capacitados ?? []) as { apellidos_nombres?: string; dni?: string }[];

  // Si el informe no está enlazado a un equipo del parque, la serie igual suele
  // venir escrita dentro de la descripción.
  const seriesSueltas = equipo ? [] : seriesDeTexto(data.equipo_texto as string | null);

  // Las fotos viven en el bucket privado: se firman para poder mostrarlas.
  const { data: firmadas } = fotos.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(fotos.map((f) => f.path), 3600)
    : { data: null };
  // Quién puede corregirlo (0383): lo mismo que decide la base; acá solo se
  // esconde el botón a quien de todos modos recibiría un «no».
  const puedeCorregir =
    Boolean(perfil.es_postventa || perfil.hace_postventa || perfil.es_operaciones) ||
    ["gerencia", "admin", "operaciones"].includes(perfil.rol) ||
    Boolean(perfil.es_almacen && data.elaborado_por === perfil.id);
  // Como en la hoja impresa: el almacén ve qué falta, no cuánto cuesta.
  const sinCifras = Boolean(perfil.es_almacen) && !perfil.es_operaciones && !["gerencia", "admin"].includes(perfil.rol);
  const repuestos = ((data.repuestos ?? []) as { codigo: string | null; descripcion: string; cantidad: number | null; unidad?: string | null; precio: number | null; igv?: string | null; stock: string | null }[]).filter((r) => r?.descripcion);
  const secciones = ((data.secciones ?? []) as { titulo: string; texto: string }[]).filter((x) => x.titulo?.trim() || x.texto?.trim());
  // Las correcciones hechas, con quién y quién autorizó.
  const { data: versionesData } = await supabase
    .from("informes_servicio_versiones")
    .select("version, motivo, antes, despues, created_at, cambiado_por, autorizo")
    .eq("informe_id", id)
    .order("version", { ascending: false });
  const versiones = (versionesData ?? []) as { version: number; motivo: string; antes: Record<string, unknown>; despues: Record<string, unknown>; created_at: string; cambiado_por: string; autorizo: string | null }[];
  const idsPersonas = [...new Set(versiones.flatMap((v) => [v.cambiado_por, v.autorizo]).filter(Boolean) as string[])];
  const { data: personas } = idsPersonas.length ? await supabase.from("perfiles").select("id, nombre").in("id", idsPersonas) : { data: [] };
  const nombreDe = new Map((personas ?? []).map((p) => [p.id as string, p.nombre as string]));

  const urlPorRuta = new Map((firmadas ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path!, f.signedUrl!]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/postventa/atenciones?ver=historico"
          className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" /> Volver a los informes
        </Link>
        {/* El papel en el formato de Lesly, para imprimir o guardar como PDF (0242). */}
        <Link
          href={`/postventa/informes/${id}/imprimir`}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs font-medium hover:bg-accent"
        >
          <Printer className="size-3.5" /> Ver como informe para imprimir
        </Link>
        {puedeCorregir && (
          <Suspense>
            <CorregirInformeServicio
              informe={{
                id,
                numero: data.correlativo != null ? `${data.es_prueba ? "PRUEBA " : ""}${String(data.correlativo).padStart(3, "0")}-${data.anio}` : null,
                asunto: (data.asunto as string | null) ?? null,
                tecnico: (data.tecnico as string | null) ?? null,
                ejecutado_at: (data.ejecutado_at as string | null) ?? null,
                hora_inicio: (data.hora_inicio as string | null) ?? null,
                hora_fin: (data.hora_fin as string | null) ?? null,
                equipo_texto: (data.equipo_texto as string | null) ?? null,
                detalle: (data.detalle as string | null) ?? null,
                verificacion: (data.verificacion as string | null) ?? null,
                observaciones: (data.observaciones as string | null) ?? null,
                accesorios: (data.accesorios as string | null) ?? null,
                pendientes: (data.pendientes as string | null) ?? null,
                secciones,
                cliente_conforme_nombre: (data.cliente_conforme_nombre as string | null) ?? null,
                cliente_conforme_doc: (data.cliente_conforme_doc as string | null) ?? null,
              }}
            />
          </Suspense>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {etiquetaTipoServicio(data.tipo as string)} · {ETIQUETA_MODALIDAD[data.modalidad as string] ?? data.modalidad}
            </p>
            <h1 className="mt-0.5 break-words text-lg font-bold leading-tight text-foreground">
              {cuenta ? (
                <NombreAFicha cuentaId={cuenta.id}>{cuenta.razon_social}</NombreAFicha>
              ) : (
                ((data.cliente_texto as string) ?? "Cliente sin identificar")
              )}
            </h1>
            {data.equipo_texto && (
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {data.equipo_texto as string}
                {seriesSueltas.length > 0 && (
                  <span className="ml-1 font-mono font-semibold text-foreground">{seriesSueltas.join(" · ")}</span>
                )}
              </p>
            )}
            {equipo && (
              <Link
                href={`/postventa/equipos/${equipo.id}`}
                className="mt-1 inline-flex items-center gap-1 font-mono text-xs font-semibold text-primary hover:underline"
              >
                <Cpu className="size-3.5" /> {equipo.serie}
              </Link>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            {data.correlativo != null && (
              <p className="font-mono text-sm font-bold text-foreground">
                N.º {data.es_prueba ? "PRUEBA " : ""}{String(data.correlativo).padStart(3, "0")}-{data.anio}
              </p>
            )}
            <p className="font-mono tabular-nums">{fechaHoraLima(data.ejecutado_at as string)}</p>
            {data.tecnico && <p>Técnico: {data.tecnico as string}</p>}
            {elaborado && <p>Elaborado por {elaborado.nombre}</p>}
          </div>
        </div>

        {data.ciclos != null && (
          <p className="mt-3 inline-flex rounded-md border border-border bg-secondary/60 px-3 py-1.5 text-xs font-semibold text-foreground">
            {Number(data.ciclos).toLocaleString("es-PE")} ciclos al momento del servicio
          </p>
        )}
      </div>

      {(secciones.length > 0 || data.detalle || data.verificacion || data.observaciones || data.accesorios || data.pendientes) && (
        <SeccionPanel titulo="El servicio">
          <div className="space-y-3 text-sm">
            {/* El informe del almacén se escribe en secciones (0297): hasta el
                02-10 esta ficha no las mostraba y su informe se veía vacío. */}
            {secciones.map((x, i) => (
              <Bloque key={i} titulo={x.titulo || "Sin título"}>{x.texto || null}</Bloque>
            ))}
            <Bloque titulo="Trabajo realizado">{data.detalle as string | null}</Bloque>
            <Bloque titulo="Verificación">{data.verificacion as string | null}</Bloque>
            <Bloque titulo="Accesorios necesarios para la instalación">{data.accesorios as string | null}</Bloque>
            <Bloque titulo="Observaciones y recomendaciones">{data.observaciones as string | null}</Bloque>
            <Bloque titulo="Pendientes con el cliente">{data.pendientes as string | null}</Bloque>
          </div>
        </SeccionPanel>
      )}

      {/* EL CUADRO PARA COTIZAR (0242; Lesly, 02-10): lo que el almacén anotó que le falta al cliente. */}
      {repuestos.length > 0 && (
        <SeccionPanel titulo={`Para cotizar · ${repuestos.length}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-xs">
              <thead className="text-left text-[11px] text-muted-foreground">
                <tr>
                  {(sinCifras ? ["Código", "Descripción", "Cantidad", "Stock"] : ["Código", "Descripción", "Cantidad", "Precio", "IGV", "Stock"]).map((h) => (
                    <th key={h} className="border-b border-border px-2 py-1.5 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {repuestos.map((r, i) => (
                  <tr key={i} className="border-b border-border/60 align-top">
                    <td className="px-2 py-1.5 font-mono">{r.codigo || "—"}</td>
                    <td className="px-2 py-1.5">{r.descripcion}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.cantidad != null ? `${r.cantidad} ${r.unidad ?? "und"}` : "—"}</td>
                    {!sinCifras && (
                      <>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.precio != null ? `$${Number(r.precio).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}` : "—"}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{r.igv === "incluye" ? "Incluye" : "No incluye"}</td>
                      </>
                    )}
                    <td className="px-2 py-1.5 whitespace-nowrap">{r.stock || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SeccionPanel>
      )}

      {(Object.keys(capacitacion).length > 0 || capacitados.length > 0) && (
        <SeccionPanel titulo="Capacitación">
          <ul className="flex flex-wrap gap-2">
            {Object.entries(capacitacion)
              .filter(([, v]) => v)
              .map(([k]) => (
                <li
                  key={k}
                  className="rounded-full bg-[#1E7F4F]/10 px-2.5 py-0.5 text-xs font-medium text-[#1E7F4F]"
                >
                  {ETIQUETA_CAPACITACION[k] ?? k}
                </li>
              ))}
          </ul>
          {capacitados.length > 0 && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {capacitados.map((p, i) => (
                <li key={i}>
                  {p.apellidos_nombres ?? "—"}
                  {p.dni && <span className="ml-1 font-mono">DNI {p.dni}</span>}
                </li>
              ))}
            </ul>
          )}
        </SeccionPanel>
      )}

      <SeccionPanel
        titulo="Registro fotográfico"
        accion={
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Camera className="size-3.5" /> {fotos.length}
          </span>
        }
      >
        {fotos.length === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Este informe no tiene fotos cargadas. El manual las pide en los cinco formatos, y son lo que sostiene el
            informe cuando el cliente dice que el equipo se entregó golpeado.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {fotos.map((f) => {
              const url = urlPorRuta.get(f.path);
              return (
                <figure key={f.path} className="overflow-hidden rounded-md border border-border">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={f.etiqueta ?? f.nombre ?? "Foto del servicio"} className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 items-center justify-center bg-secondary text-[11px] text-muted-foreground">
                      No se pudo cargar
                    </div>
                  )}
                  {(f.etiqueta || f.nombre) && (
                    <figcaption className="break-words px-2 py-1 text-[11px] text-muted-foreground">
                      {f.etiqueta ?? f.nombre}
                    </figcaption>
                  )}
                </figure>
              );
            })}
          </div>
        )}
      </SeccionPanel>

      <SeccionPanel titulo="Conformidad del cliente">
        {data.cliente_conforme_nombre ? (
          <p className="text-sm text-foreground">
            {data.cliente_conforme_nombre as string}
            {data.cliente_conforme_doc && (
              <span className="ml-1 font-mono text-xs text-muted-foreground">
                DNI {data.cliente_conforme_doc as string}
              </span>
            )}
          </p>
        ) : (
          <p className="max-w-prose text-sm text-muted-foreground">
            Sin conformidad registrada. Es la firma que valida los trabajos: sin ella, el informe cuenta lo que se hizo
            pero no prueba que el cliente lo aceptó.
          </p>
        )}
        {data.servicio_id && (
          <Link
            href={`/postventa/pedidos/${data.servicio_id}`}
            className="mt-3 inline-flex text-xs font-medium text-primary hover:underline"
          >
            Ver el pedido del que salió este servicio
          </Link>
        )}
      </SeccionPanel>

      {versiones.length > 0 && (
        <SeccionPanel titulo={`Correcciones (${versiones.length})`}>
          <ul className="space-y-3 text-xs">
            {versiones.map((v) => (
              <li key={v.version} className="rounded-lg border border-border p-3">
                <p className="font-semibold text-foreground">
                  Versión {v.version} · {fechaHoraLima(v.created_at)} · {nombreDe.get(v.cambiado_por) ?? "—"}
                  {v.autorizo && <span className="font-normal text-muted-foreground"> · autorizó {nombreDe.get(v.autorizo) ?? "—"}</span>}
                </p>
                <p className="mt-0.5 text-muted-foreground">{v.motivo}</p>
                <ul className="mt-1.5 space-y-1">
                  {Object.keys(v.despues).map((campo) => (
                    <li key={campo} className="break-words">
                      <span className="font-semibold text-foreground">{ETIQUETA_CAMPO[campo] ?? campo}:</span>{" "}
                      <span className="text-muted-foreground line-through">{resumen(v.antes[campo])}</span>{" → "}
                      <span className="text-foreground">{resumen(v.despues[campo])}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </SeccionPanel>
      )}
    </div>
  );
}

const ETIQUETA_CAMPO: Record<string, string> = {
  asunto: "Asunto",
  tecnico: "Técnico",
  ejecutado_at: "Fecha del servicio",
  hora_inicio: "Hora de inicio",
  hora_fin: "Hora de fin",
  equipo_texto: "Equipo",
  detalle: "Trabajo realizado",
  verificacion: "Verificación",
  observaciones: "Observaciones",
  accesorios: "Accesorios",
  pendientes: "Pendientes",
  secciones: "Secciones",
  cliente_conforme_nombre: "Conformidad (nombre)",
  cliente_conforme_doc: "Conformidad (DNI)",
};

/** Un valor del historial dicho en una línea corta. */
function resumen(v: unknown): string {
  if (v == null || v === "") return "(vacío)";
  if (Array.isArray(v)) return v.map((x) => (x as { titulo?: string; texto?: string }).titulo || (x as { texto?: string }).texto || "").filter(Boolean).join(" · ").slice(0, 160) || "(vacío)";
  const t = String(v);
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
}

function Bloque({ titulo, children }: { titulo: string; children: string | null }) {
  if (!children) return null;
  return (
    <div>
      <h3 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h3>
      <p className="whitespace-pre-line break-words text-sm text-foreground">{children}</p>
    </div>
  );
}
