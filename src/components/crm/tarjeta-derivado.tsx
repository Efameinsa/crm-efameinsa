import Link from "next/link";
import { ChevronRight, FileDown, MessageSquareText, Phone, Siren } from "lucide-react";
import { fechaHoraLima } from "@/lib/fechas";
import {
  demora,
  haceCuanto,
  ETIQUETA_CANAL,
  ETIQUETA_ETAPA,
  ETIQUETA_MOTIVO,
  type DerivadoFila,
} from "@/lib/derivados-central";
import { ETIQUETA_ACTIVIDAD } from "@/components/crm/etiquetas-actividad";
import { RedirigirLeadBoton } from "@/components/crm/redirigir-lead-boton";
import { UrgenciaBoton } from "@/components/crm/urgencia-boton";
import { cn } from "@/lib/utils";

/**
 * Una derivación, en la lista de Central.
 *
 * POR QUÉ NO ES UNA TABLA. Era una de diez columnas con letra de 11 px dentro
 * del panel con barra lateral: el mensaje del cliente y la nota del comercial
 * quedaban en tiras de dos palabras por línea y había que leer con scroll
 * horizontal («las letras están colapsadas», 27-08). Diez columnas es una
 * matriz que solo sirve para comparar cifra contra cifra; acá cada fila es un
 * caso y lo que se busca es reconocerlo de un vistazo, así que la fila se
 * ordena por jerarquía —quién es, qué pidió, en qué quedó— y el resto se fue a
 * la ficha, a un clic.
 */

const CLASE_ALERTA: Record<string, { barra: string; texto: string; clase: string }> = {
  demora: {
    barra: "bg-destructive",
    texto: "Nadie lo ha tocado",
    clase: "bg-destructive/10 text-destructive",
  },
  frio: {
    barra: "bg-amber-500",
    texto: "Sin novedad hace días",
    clase: "bg-amber-500/15 text-amber-800",
  },
};

const CLASE_FOCO: Record<string, string> = {
  sin_atender: "bg-amber-400",
  en_gestion: "bg-primary/50",
  cotizado: "bg-primary",
  cerrado: "bg-[#1E7F4F]",
};

export function TarjetaDerivado({
  fila,
  comerciales,
  supervisores,
}: {
  fila: DerivadoFila;
  comerciales: { id: string; nombre: string; codigo_comercial: string | null }[];
  supervisores?: { id: string; nombre: string }[];
}) {
  const etapa = fila.oportunidad ? ETIQUETA_ETAPA[fila.oportunidad.etapa] : null;
  const alerta = fila.alerta ? CLASE_ALERTA[fila.alerta] : null;
  const com = fila.comercial;
  const contacto = fila.nombreContacto ?? fila.codigo ?? "el contacto";

  return (
    <article className="relative flex gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40">
      <span className={cn("w-1 flex-none rounded-full", alerta?.barra ?? CLASE_FOCO[fila.foco])} aria-hidden />

      <div className="grid min-w-0 flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_15rem]">
        {/* QUIÉN ES Y QUÉ PIDIÓ */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <h3 className="text-sm font-semibold text-foreground">{fila.nombreContacto ?? "Sin nombre"}</h3>
            {fila.razonSocial && fila.razonSocial !== fila.nombreContacto && (
              <span className="text-xs text-muted-foreground">{fila.razonSocial}</span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="font-mono">{fila.codigo}</span>
            {fila.telefono && (
              <span className="inline-flex items-center gap-1">
                <Phone className="size-3" />
                {fila.telefono}
              </span>
            )}
            <span>{ETIQUETA_CANAL[fila.canal] ?? fila.canal}</span>
          </p>
          {fila.mensaje && (
            <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-foreground/80">
              <span className="text-muted-foreground">Pide: </span>
              {fila.mensaje}
            </p>
          )}
        </div>

        {/* A QUIÉN SE LE DIO Y EN QUÉ QUEDÓ */}
        <div className="min-w-0 md:border-l md:border-border md:pl-3">
          <p className="text-xs text-muted-foreground">
            Derivado a{" "}
            <b className="text-foreground">
              {com?.codigo_comercial ? `${com.codigo_comercial} · ` : ""}
              {com?.nombre ?? "—"}
            </b>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {fila.asignadoAt ? `${fechaHoraLima(fila.asignadoAt)} · ${haceCuanto(fila.asignadoAt)}` : "—"}
          </p>
          {fila.motivo && (
            <p className="text-xs text-muted-foreground">{ETIQUETA_MOTIVO[fila.motivo] ?? fila.motivo}</p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-semibold",
                etapa?.clase ?? "bg-amber-500/15 text-amber-800",
              )}
            >
              {etapa?.texto ?? "Sin abrir todavía"}
            </span>
            {alerta && (
              <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", alerta.clase)}>{alerta.texto}</span>
            )}
          </div>

          {/* La prueba de que el comercial trabajó el contacto: la gestión. */}
          <p className="mt-1.5 flex items-start gap-1 text-xs text-muted-foreground">
            <MessageSquareText className="mt-0.5 size-3 flex-none" />
            {fila.ultimaGestion ? (
              <span className="min-w-0">
                {fila.gestiones} gestión{fila.gestiones === 1 ? "" : "es"} · última{" "}
                {ETIQUETA_ACTIVIDAD[fila.ultimaGestion.tipo] ?? fila.ultimaGestion.tipo} {haceCuanto(fila.ultimaGestion.fecha)}
              </span>
            ) : (
              <span>Sin ninguna gestión registrada</span>
            )}
          </p>
          {fila.primeraGestion && (
            <p className="text-xs text-muted-foreground">
              Primer contacto a las {demora(fila.asignadoAt, fila.primeraGestion.fecha)} de derivarlo
            </p>
          )}

          {fila.cotizaciones.length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1.5">
              {fila.cotizaciones.map((c) => (
                <Link
                  key={c.id}
                  href={`/api/cotizaciones/${c.id}/pdf`}
                  target="_blank"
                  className="relative z-10 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-primary hover:bg-accent hover:underline"
                >
                  <FileDown className="size-3" />
                  <span className="font-mono">{c.codigo ?? "Borrador"}</span>
                  {c.total != null && (
                    <span className="text-muted-foreground">
                      {c.moneda} {Number(c.total).toLocaleString("es-PE")}
                    </span>
                  )}
                </Link>
              ))}
            </p>
          )}

          {fila.urgencias && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-destructive">
              <Siren className="size-3" />
              Urgencia enviada{fila.urgencias.total > 1 ? ` ×${fila.urgencias.total}` : ""} ·{" "}
              {haceCuanto(fila.urgencias.ultima)}
            </p>
          )}
        </div>
      </div>

      {/* Las dos acciones de Central sobre lo ya derivado: corregir a quién
          fue, y avisar con urgencia que el cliente está esperando. Van sobre
          la fila (z-10) porque el resto de la tarjeta es un enlace a la ficha. */}
      <div className="relative z-10 flex flex-none flex-col items-end justify-between gap-1">
        <div className="flex items-center gap-0.5">
          <RedirigirLeadBoton
            leadId={fila.id}
            contacto={contacto}
            comercialActual={fila.asignadoA}
            comerciales={comerciales}
            supervisores={supervisores}
          />
          {fila.asignadoA && (
            <UrgenciaBoton
              leadId={fila.id}
              contacto={contacto}
              comercial={
                com ? `${com.codigo_comercial ?? ""}${com.codigo_comercial ? " · " : ""}${com.nombre}` : "el comercial"
              }
              totalUrgencias={fila.urgencias?.total ?? 0}
            />
          )}
        </div>
        <span className="hidden items-center gap-0.5 text-xs font-medium text-primary md:inline-flex">
          Ver gestión
          <ChevronRight className="size-3.5" />
        </span>
      </div>

      {/* El enlace va al final del DOM y cubre la tarjeta: toda ella navega,
          salvo lo que se pinta encima (acciones y PDFs, con z-10). */}
      <Link
        href={`/central/derivados/${fila.id}`}
        className="absolute inset-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
        aria-label={`Ver la gestión de ${contacto}`}
      />
    </article>
  );
}
