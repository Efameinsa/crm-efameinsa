import { MessageSquareText } from "lucide-react";

// Lo que pidió el prospecto, tal como entró.
//
// El dato SIEMPRE se guardó en `leads.mensaje` —lo captura el formulario de
// Central y lo traen los leads de Google Ads— pero no se mostraba en ninguna
// pantalla. Central derivaba a ciegas y el comercial recibía un nombre y un
// teléfono. Brenda lo pidió el 24-08, primer día de uso real: «necesito ver el
// detalle de la solicitud de cada prospecto nuevo que se va a derivar, ya que
// cada nuevo prospecto tiene diferente interés de compra».
//
// Los leads de Google Ads no traen texto libre: el formulario de Ads solo pide
// nombre, teléfono y ciudad. Lo que sí traen es la CAMPAÑA, y ahí está la
// intención («Equipos de Lavandería Industrial» vs «Comercial»). Por eso el
// mensaje llega como pares "Clave: valor" separados por · y se despliega en
// etiquetas legibles en vez de una línea cruda.

/** "Phone Number Verified: FALSE · City: Huánuco · Campaña: X" → pares. */
function separarEnDatos(mensaje: string): { clave: string; valor: string }[] | null {
  const trozos = mensaje.split("·").map((t) => t.trim()).filter(Boolean);
  if (trozos.length < 2) return null;
  const pares = trozos.map((t) => {
    const i = t.indexOf(":");
    return i === -1 ? null : { clave: t.slice(0, i).trim(), valor: t.slice(i + 1).trim() };
  });
  return pares.every(Boolean) ? (pares as { clave: string; valor: string }[]) : null;
}

const ETIQUETA: Record<string, string> = {
  "Phone Number Verified": "Teléfono verificado",
  City: "Ciudad",
  Campaña: "Campaña",
  Formulario: "Formulario",
  "Origen Central": "Origen",
  Estado: "Estado",
};

/** Datos de plomería que no le dicen nada a quien va a llamar al cliente. */
const OCULTOS = new Set(["Formulario", "Phone Number Verified"]);

export function SolicitudLead({
  mensaje,
  campania,
  compacto = false,
}: {
  mensaje: string | null;
  campania?: string | null;
  compacto?: boolean;
}) {
  const texto = mensaje?.trim();
  if (!texto && !campania) {
    return (
      <p className={compacto ? "text-xs text-muted-foreground" : "mt-2 text-xs text-muted-foreground"}>
        Sin detalle de la solicitud. Al llamar, preguntar qué equipo necesita y para qué uso.
      </p>
    );
  }

  const datos = texto ? separarEnDatos(texto) : null;
  const visibles = datos?.filter((d) => !OCULTOS.has(d.clave)) ?? [];

  return (
    <div className={compacto ? "" : "mt-2.5 rounded-md border border-border bg-secondary/40 p-2.5"}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        <MessageSquareText className="size-3.5" />
        Qué solicita
      </p>
      {datos ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {visibles.map((d, i) => (
            <span key={i} className="text-xs text-foreground">
              <span className="text-muted-foreground">{ETIQUETA[d.clave] ?? d.clave}: </span>
              <b>{d.valor}</b>
            </span>
          ))}
          {visibles.length === 0 && (
            <span className="text-xs text-muted-foreground">Solo datos de origen, sin detalle del pedido.</span>
          )}
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-foreground">{texto}</p>
      )}
      {campania && !datos?.some((d) => d.clave === "Campaña") && (
        <p className="mt-1 text-xs text-muted-foreground">
          Campaña: <b className="text-foreground">{campania}</b>
        </p>
      )}
    </div>
  );
}
