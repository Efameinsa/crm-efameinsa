"use client";

// EL ANUNCIO QUE VIO EL CLIENTE (22-09-2026).
//
// Katerine, en la reunión, con el chat abierto: «en esa conversación de la
// campaña no sale de qué campaña viene… le pregunté al señor cómo había
// llegado y me dijo: vi una publicidad de LG. Eso no me cuadró con lo que vi
// ahí, que dice "instalación"». Lo que el CRM mostraba como campaña era el
// TITULAR del anuncio («Instalación y garantía»), que no dice qué equipo se
// anunció. Carlos: «es el nombre de la campaña que le está ajustado… hay que
// corregirlo… lo que hay que mandarle es para que sepa la campaña, la imagen».
//
// Meta manda el anuncio entero en el primer mensaje (titular, texto e imagen)
// y el CRM ya lo guardaba sin mostrarlo. Acá se muestra tal cual: el comercial
// ve lo mismo que vio el cliente antes de escribir.

import { useState } from "react";
import { Megaphone, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AnuncioVisto {
  titular: string | null;
  cuerpo: string | null;
  imagen: string | null;
  enlace: string | null;
  anuncioId: string | null;
}

export function AnuncioDelLead({
  anuncio,
  codigoCampania,
  nombreCampania,
  compacto = false,
}: {
  anuncio: AnuncioVisto | null;
  codigoCampania?: string | null;
  nombreCampania?: string | null;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(!compacto);
  if (!anuncio) return null;

  const campania = [nombreCampania, codigoCampania && `código ${codigoCampania}`].filter(Boolean).join(" · ");

  return (
    <div className="rounded-md border border-border bg-secondary/40 p-2.5">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <Megaphone className="size-3.5" />
        El anuncio que vio el cliente
        <ChevronDown className={cn("ml-auto size-3.5 transition-transform", abierto && "rotate-180")} />
      </button>

      {campania && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Campaña: <b className="text-foreground">{campania}</b>
        </p>
      )}

      {abierto && (
        <div className="mt-2 flex gap-2.5">
          {anuncio.imagen && (
            // eslint-disable-next-line @next/next/no-img-element -- la imagen la sirve el CDN de Meta con URL firmada; no pasa por el optimizador
            <img
              src={anuncio.imagen}
              alt={anuncio.titular ?? "Anuncio"}
              className="size-20 flex-none rounded-md border border-border object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            {anuncio.titular && <p className="text-xs font-semibold text-foreground">{anuncio.titular}</p>}
            {anuncio.cuerpo && <p className="mt-0.5 whitespace-pre-wrap text-[11px] leading-snug text-muted-foreground">{anuncio.cuerpo}</p>}
            {anuncio.anuncioId && (
              <p className="mt-1 text-[10.5px] text-muted-foreground">
                Anuncio {anuncio.anuncioId}
                {anuncio.enlace && (
                  <>
                    {" · "}
                    <a href={anuncio.enlace} target="_blank" rel="noreferrer" className="underline hover:text-foreground">
                      verlo en Meta
                    </a>
                  </>
                )}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
