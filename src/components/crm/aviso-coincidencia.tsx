import { CopyCheck, UserCheck } from "lucide-react";
import { fechaLima } from "@/lib/fechas";
import type { CoincidenciaBandeja } from "@/lib/central/coincidencias-bandeja";
import { YaEstaEnElSistemaBoton } from "@/components/crm/ya-esta-en-el-sistema-boton";

// Cómo se dice cada etapa fuera del CRM. Central no habla en etapas: necesita
// saber si eso ya se atendió y en qué quedó.
const ETIQUETA_ETAPA: Record<string, string> = {
  asignada: "recibido por el comercial",
  filtrada: "filtrado",
  cotizada: "cotizado",
  seguimiento: "en seguimiento",
  potencial: "en negociación",
  venta: "vendido",
  rechazada: "cerrado como rechazado",
  derivada: "pasado a otro comercial",
};

/**
 * El aviso que le faltaba a la bandeja: este contacto ya está en el sistema.
 *
 * Son dos situaciones distintas y la diferencia cambia lo que hay que hacer,
 * así que se dicen distinto en vez de dejarlo a criterio:
 *
 *   · REPETIDO — la cuenta se trabajó los mismos días en que entró esto. Es el
 *     mismo hecho anotado dos veces (la llamada que Central registró, y aparte
 *     el formulario de la publicidad). No hay nada que derivar.
 *   · CLIENTE CONOCIDO — ya existe, pero de antes. Este SÍ hay que derivarlo, y
 *     además se dice a quién: al comercial que ya lo atiende, no a la rueda.
 *
 * El aviso informa, no decide: siempre muestra la razón social de la cuenta y
 * por qué dato coincidió, porque un teléfono repetido puede ser un negocio, una
 * familia o un número mal tipeado en el Excel.
 */
export function AvisoCoincidencia({ leadId, c }: { leadId: string; c: CoincidenciaBandeja }) {
  const gestion = c.ultimaEtapa
    ? `${ETIQUETA_ETAPA[c.ultimaEtapa] ?? c.ultimaEtapa}${c.ultimaFecha ? ` el ${fechaLima(c.ultimaFecha)}` : ""}`
    : "sin gestión registrada";
  const duenio = c.codigoComercial
    ? `${c.codigoComercial}${c.comercialNombre ? ` · ${c.comercialNombre}` : ""}`
    : "sin comercial asignado";

  if (c.clase === "duplicado") {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
        <CopyCheck className="size-4 flex-none" />
        <p className="min-w-[220px] flex-1 text-xs">
          <b>Ya derivado.</b> Coincide por {c.motivo} con <b>{c.razonSocial}</b> — {duenio}, {gestion}.
          <span className="block text-[11px] opacity-80">
            Entró dos veces por vías distintas. No hace falta derivarlo de nuevo.
          </span>
        </p>
        <YaEstaEnElSistemaBoton leadId={leadId} cuentaId={c.cuentaId} razonSocial={c.razonSocial} />
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-sky-300 bg-sky-50 p-2.5 text-sky-900">
      <UserCheck className="size-4 flex-none" />
      <p className="min-w-[220px] flex-1 text-xs">
        <b>Cliente conocido.</b> Coincide por {c.motivo} con <b>{c.razonSocial}</b> — {duenio}, {gestion}.
        <span className="block text-[11px] opacity-80">
          Vuelve a escribir: derivarlo a su comercial de siempre, no a otro.
        </span>
      </p>
    </div>
  );
}
