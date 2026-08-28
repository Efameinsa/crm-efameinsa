import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Camera, Cpu } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { fechaHoraLima } from "@/lib/fechas";
import { etiquetaTipoServicio, seriesDeTexto } from "@/lib/postventa";

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
  await requerirPerfil();
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
  const urlPorRuta = new Map((firmadas ?? []).filter((f) => f.signedUrl && f.path).map((f) => [f.path!, f.signedUrl!]));

  return (
    <div className="space-y-4">
      <Link
        href="/postventa/casos"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver a los informes
      </Link>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-[240px] flex-1">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              {etiquetaTipoServicio(data.tipo as string)} · {ETIQUETA_MODALIDAD[data.modalidad as string] ?? data.modalidad}
            </p>
            <h1 className="mt-0.5 break-words text-lg font-bold leading-tight text-foreground">
              {cuenta ? (
                <Link href={`/gerencia/clientes/${cuenta.id}`} className="hover:underline">
                  {cuenta.razon_social}
                </Link>
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
                N.º {String(data.correlativo).padStart(3, "0")}-{data.anio}
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

      {(data.detalle || data.verificacion || data.observaciones || data.accesorios || data.pendientes) && (
        <SeccionPanel titulo="El servicio">
          <div className="space-y-3 text-sm">
            <Bloque titulo="Trabajo realizado">{data.detalle as string | null}</Bloque>
            <Bloque titulo="Verificación">{data.verificacion as string | null}</Bloque>
            <Bloque titulo="Accesorios necesarios para la instalación">{data.accesorios as string | null}</Bloque>
            <Bloque titulo="Observaciones y recomendaciones">{data.observaciones as string | null}</Bloque>
            <Bloque titulo="Pendientes con el cliente">{data.pendientes as string | null}</Bloque>
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
    </div>
  );
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
