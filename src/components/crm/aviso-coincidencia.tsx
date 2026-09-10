import { CopyCheck, PhoneOff, UserCheck } from "lucide-react";
import { fechaLima } from "@/lib/fechas";
import type { CoincidenciaBandeja } from "@/lib/central/coincidencias-bandeja";
import { YaEstaEnElSistemaBoton } from "@/components/crm/ya-esta-en-el-sistema-boton";
import { AvisarYCerrarBoton } from "@/components/crm/avisar-y-cerrar-boton";

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
export function AvisoCoincidencia({
  leadId,
  c,
  mensaje,
  recibidoAt,
}: {
  leadId: string;
  c: CoincidenciaBandeja;
  mensaje?: string | null;
  recibidoAt?: string | null;
}) {
  const gestion = c.ultimaEtapa
    ? `${ETIQUETA_ETAPA[c.ultimaEtapa] ?? c.ultimaEtapa}${c.ultimaFecha ? ` el ${fechaLima(c.ultimaFecha)}` : ""}`
    : "sin gestión registrada";
  // El dominio identifica a la EMPRESA, no a la persona: quien escribe puede
  // ser otro del mismo cliente. Se dice, porque cambia lo que Central verifica
  // antes de derivar — y es el cruce que faltaba el 09-09, cuando un contacto
  // de @candelaperu.net se derivó como cliente nuevo a otro comercial.
  const porDominio = c.motivo === "dominio del correo";
  const duenio = c.codigoComercial
    ? `${c.codigoComercial}${c.comercialNombre ? ` · ${c.comercialNombre}` : ""}`
    : "sin comercial asignado";

  // PIDIÓ QUE NO LO CONTACTEN (0217). Va ANTES que todo lo demás y reemplaza al
  // aviso normal: derivarlo sería mandar a un comercial a llamar a alguien que
  // pidió expresamente que no lo llamen, y el CRM no puede decir eso en letra
  // chica al final de una tarjeta.
  if (c.noContactar) {
    return (
      <div className="mt-2.5 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-destructive">
        <PhoneOff className="mt-0.5 size-4 flex-none" />
        <p className="min-w-[220px] flex-1 text-xs">
          <b>Este cliente pidió que no lo contacten.</b> Coincide por {c.motivo} con <b>{c.razonSocial}</b>
          {duenio ? ` — ${duenio}` : ""}, {gestion}.
          <span className="block text-[11px] opacity-90">
            No lo derive. Si volvió a escribir por su cuenta y quiere que lo atiendan, esa marca se levanta en la
            ficha del cliente antes de derivarlo — que lo decida quien la levanta, no la bandeja.
          </span>
        </p>
      </div>
    );
  }

  if (c.clase === "duplicado") {
    return (
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
        <CopyCheck className="size-4 flex-none" />
        <p className="min-w-[220px] flex-1 text-xs">
          <b>{c.codigoComercial || c.comercialNombre ? `Ya lo está viendo ${duenio}.` : "Ya derivado."}</b>{" "}
          Coincide por {c.motivo} con <b>{c.razonSocial}</b>
          {c.codigoComercial || c.comercialNombre ? "" : ` — ${duenio}`}, {gestion}.
          {/* QUÉ HACER, NO QUÉ NO HACER (0215). Acá decía «no hace falta
              derivarlo de nuevo», que es media respuesta: Central sabía que no
              tenía que asignar, pero no cuál de los otros tres botones era el
              bueno, y ninguno lo era del todo. Santos, 10-09: «Central entra en
              crisis existencial». Ahora la salida correcta está acá adentro. */}
          <span className="block text-[11px] opacity-80">
            {porDominio
              ? "Escribió desde el correo de esa empresa. Puede ser otra persona del mismo cliente: confirme antes de cerrarlo."
              : "No lo derive de nuevo: avísele que volvió a escribir y el contacto sale como repetido."}
          </span>
        </p>
        <span className="flex flex-wrap items-center gap-1.5">
          <AvisarYCerrarBoton
            leadId={leadId}
            cuentaId={c.cuentaId}
            razonSocial={c.razonSocial}
            duenio={c.codigoComercial ?? c.comercialNombre ?? "su comercial"}
            mensaje={mensaje}
            recibidoAt={recibidoAt}
          />
          {/* Cuando no hay nada nuevo que contar —el mismo mensaje entrado dos
              veces por dos vías— cerrarlo callado sigue siendo lo correcto. */}
          <YaEstaEnElSistemaBoton leadId={leadId} cuentaId={c.cuentaId} razonSocial={c.razonSocial} />
        </span>
      </div>
    );
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-sky-300 bg-sky-50 p-2.5 text-sky-900">
      <UserCheck className="size-4 flex-none" />
      <p className="min-w-[220px] flex-1 text-xs">
        <b>Cliente conocido.</b> Coincide por {c.motivo} con <b>{c.razonSocial}</b> — {duenio}, {gestion}.
        <span className="block text-[11px] opacity-80">
          {porDominio
            ? "Escribió desde el correo de esa empresa: es el mismo cliente aunque sea otra persona. Derivarlo a su comercial de siempre — y si entró sin RUC, «Es un cliente que ya tenemos» lo deja en la ficha buena."
            : "Vuelve a escribir: derivarlo a su comercial de siempre, no a otro."}
        </span>
      </p>
    </div>
  );
}
