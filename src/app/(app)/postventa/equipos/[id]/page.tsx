import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, FolderOpen, ShieldCheck, ShieldOff } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirPerfil } from "@/lib/auth";
import { enlaceCarpetaFirmado } from "@/lib/archivos-servidor";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { InformeServicioNuevo } from "@/components/crm/informe-servicio-nuevo";
import { fechaCalendario, fechaHoraLima } from "@/lib/fechas";
import { estadoGarantia, etiquetaTipoServicio } from "@/lib/postventa";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * La ficha de una máquina concreta.
 *
 * Contiene lo que el manual hace escribir a mano en cada «formato de llamada»:
 * fecha de compra, fecha de entrega y guía, garantía, fecha de puesta en
 * marcha, último mantenimiento. Acá está calculado y no hay que buscarlo.
 *
 * Y los ciclos, que son el argumento de fondo. Carlos lo contó como se usa en
 * la práctica: «señor, usted tiene 10.000 ciclos, quiere decir que ha usado 9
 * horas diarias». Sin ese dato, esa conversación no se puede tener.
 */
export default async function EquipoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requerirPerfil();
  const supabase = await createClient();

  const { data } = await supabase
    .from("equipos_instalados")
    // La columna del documento se llama num_doc: pedirla como `documento`
    // hacía fallar la consulta entera y la ficha devolvía 404 para TODA
    // máquina. Encontrado el 28-08 al montar el informe acá.
    .select("*, cuentas(id, razon_social, num_doc, carpetas_servidor)")
    .eq("id", id)
    .single();
  if (!data) notFound();

  const { data: informes } = await supabase
    .from("informes_servicio")
    .select("id, correlativo, anio, tipo, modalidad, ejecutado_at, tecnico, detalle, ciclos")
    .eq("equipo_id", id)
    .order("ejecutado_at", { ascending: false })
    .limit(50);

  const cuenta = data.cuentas as unknown as {
    id: string;
    razon_social: string;
    num_doc: string | null;
    carpetas_servidor: Record<string, string> | null;
  } | null;
  // Los informes de ESTA serie en el servidor de la oficina (plan 24, V2):
  // la carpeta de informes del cliente, ya filtrada por el número de serie.
  const enlaceInformesServidor =
    cuenta?.carpetas_servidor?.informes && data.serie
      ? enlaceCarpetaFirmado(cuenta.carpetas_servidor.informes, String(data.serie))
      : null;
  const garantia = estadoGarantia(data.garantia_hasta as string | null);
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Lima" });
  const mantenimientoVencido = data.proximo_mantenimiento != null && (data.proximo_mantenimiento as string) <= hoy;

  // Un ciclo es aproximadamente una hora de uso: con eso se estima la
  // intensidad y se justifica —o se descarta— un reclamo de garantía.
  const dias =
    data.fecha_puesta_marcha || data.fecha_despacho
      ? Math.max(
          1,
          Math.round(
            (new Date().getTime() - new Date(((data.fecha_puesta_marcha ?? data.fecha_despacho) as string) + "T12:00:00").getTime()) /
              864e5,
          ),
        )
      : null;
  const ciclosPorDia = dias && data.ciclos_ultimo ? (Number(data.ciclos_ultimo) / dias).toFixed(1) : null;

  return (
    <div className="space-y-4">
      <Link
        href="/postventa/equipos"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" /> Volver a equipos
      </Link>

      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="font-mono text-xs font-bold text-muted-foreground">Serie {data.serie}</p>
        <h1 className="mt-0.5 text-lg font-bold leading-tight text-foreground">
          {(data.modelo_texto as string) ?? "Equipo sin describir"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {cuenta ? (
            <Link href={`/gerencia/clientes/${cuenta.id}`} className="text-primary hover:underline">
              {cuenta.razon_social}
            </Link>
          ) : (
            ((data.cliente_texto as string) ?? "Cliente sin identificar")
          )}
          {data.ubicacion ? ` · ${data.ubicacion}` : ""}
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
              garantia.vigente ? "bg-[#1E7F4F]/10 text-[#1E7F4F]" : "bg-secondary text-muted-foreground",
            )}
          >
            {garantia.vigente ? <ShieldCheck className="size-3.5" /> : <ShieldOff className="size-3.5" />}
            {garantia.etiqueta}
            {data.garantia_hasta ? ` · hasta ${fechaCalendario(data.garantia_hasta as string)}` : ""}
          </span>
          {garantia.porVencer && garantia.vigente && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Momento de ofrecer el mantenimiento
            </span>
          )}
          {mantenimientoVencido && (
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
              Mantenimiento vencido desde {fechaCalendario(data.proximo_mantenimiento as string)}
            </span>
          )}
        </div>

        <dl className="mt-4 grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-3">
          <Dato etiqueta="Venta">{fechaCalendario(data.fecha_venta as string)}</Dato>
          <Dato etiqueta="Despacho">
            {fechaCalendario(data.fecha_despacho as string)}
            {data.guia_remision ? ` · guía ${data.guia_remision}` : ""}
          </Dato>
          <Dato etiqueta="Puesta en marcha">{fechaCalendario(data.fecha_puesta_marcha as string)}</Dato>
          <Dato etiqueta="Ciclos al entregar">
            {data.ciclos_inicial != null ? Number(data.ciclos_inicial).toLocaleString("es-PE") : "—"}
          </Dato>
          <Dato etiqueta="Última lectura">
            {data.ciclos_ultimo != null
              ? `${Number(data.ciclos_ultimo).toLocaleString("es-PE")} ciclos${
                  data.ciclos_ultimo_at ? ` · ${fechaCalendario(data.ciclos_ultimo_at as string)}` : ""
                }`
              : "—"}
          </Dato>
          <Dato etiqueta="Uso estimado">
            {ciclosPorDia ? `${ciclosPorDia} ciclos por día · ≈ ${ciclosPorDia} h diarias` : "—"}
          </Dato>
          <Dato etiqueta="Último mantenimiento">{fechaCalendario(data.ultimo_mantenimiento as string)}</Dato>
          <Dato etiqueta="Próximo mantenimiento">{fechaCalendario(data.proximo_mantenimiento as string)}</Dato>
          {data.servicio_id ? (
            <Dato etiqueta="Pedido de origen">
              <Link href={`/postventa/pedidos/${data.servicio_id}`} className="text-primary hover:underline">
                Ver el despacho
              </Link>
            </Dato>
          ) : (
            <Dato etiqueta="Pedido de origen">—</Dato>
          )}
        </dl>
      </div>

      <SeccionPanel
        titulo="Historial del equipo"
        accion={
          <div className="flex flex-wrap items-center gap-2">
            {enlaceInformesServidor && (
              <a
                href={enlaceInformesServidor}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <FolderOpen className="size-3.5" /> Informes de esta serie en el servidor
                <ExternalLink className="size-3" />
              </a>
            )}
            <InformeServicioNuevo
              equipoId={id}
              cuentaId={cuenta?.id ?? null}
              equipoTexto={[data.modelo_texto, data.serie ? `S: ${data.serie}` : null].filter(Boolean).join(" ") || null}
              ciclosActuales={(data.ciclos_ultimo as number | null) ?? null}
            />
          </div>
        }
      >
        {!informes || informes.length === 0 ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            Todavía no hay informes cargados para esta máquina. Cada puesta en marcha, garantía o mantenimiento que se
            registre va a quedar acá, con sus fotos y su lectura de ciclos.
          </p>
        ) : (
          <div className="space-y-1.5">
            {informes.map((i) => (
              <div key={i.id} className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2.5">
                <span className="w-24 flex-none font-mono text-[11px] tabular-nums text-muted-foreground">
                  {fechaHoraLima(i.ejecutado_at as string)}
                </span>
                <div className="min-w-[200px] flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {etiquetaTipoServicio(i.tipo as string)}
                    <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                      {i.modalidad === "videollamada" ? "videollamada" : i.modalidad === "planta" ? "en planta" : "in situ"}
                    </span>
                  </p>
                  {i.detalle && <p className="line-clamp-2 text-xs text-muted-foreground">{i.detalle as string}</p>}
                  {i.tecnico && <p className="text-[11px] text-muted-foreground">Técnico: {i.tecnico as string}</p>}
                </div>
                <div className="text-right text-[11px] text-muted-foreground">
                  {i.correlativo != null && (
                    <span className="font-mono">
                      N.º {String(i.correlativo).padStart(3, "0")}-{i.anio}
                    </span>
                  )}
                  {i.ciclos != null && <span className="block">{Number(i.ciclos).toLocaleString("es-PE")} ciclos</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </SeccionPanel>
    </div>
  );
}

function Dato({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{etiqueta}</dt>
      <dd className="text-foreground">{children}</dd>
    </div>
  );
}
