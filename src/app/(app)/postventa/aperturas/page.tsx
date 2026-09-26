import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { ListaAperturas, type PestanaAperturas } from "@/components/crm/lista-aperturas";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/** Las dos pestañas (25-09): lo que se deriva para llamar, y lo urgente que sale del almacén. */
function Pestanas({ base, activa }: { base: string; activa: PestanaAperturas }) {
  const clase = (on: boolean) =>
    cn("rounded-md px-3 py-1.5 text-sm font-medium transition-colors", on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground");
  return (
    <nav className="inline-flex gap-1 rounded-lg border border-border bg-card p-1" aria-label="Qué ver">
      <Link href={base} className={clase(activa === "llamadas")} aria-current={activa === "llamadas" ? "page" : undefined}>
        Derivación de llamadas
      </Link>
      <Link href={`${base}?ver=urgentes`} className={clase(activa === "urgentes")} aria-current={activa === "urgentes" ? "page" : undefined}>
        Aperturas urgentes
      </Link>
    </nav>
  );
}

/**
 * LO QUE POSTVENTA LE DERIVA AL ALMACÉN (0281; nombre y pestañas del 25-09).
 *
 * Lesly y Ruby: «aperturas» se leía como despacho —«yo apertura también lo
 * entiendo como despacho»—, y esto son derivaciones de llamadas para soporte
 * técnico. Se llama así ahora, y lo urgente (la apertura directa, sin pedido,
 * con código de gerencia) va en su propia pestaña.
 */
export default async function AperturasPostventaPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requerirPerfil();
  const pestana: PestanaAperturas = (await searchParams).ver === "urgentes" ? "urgentes" : "llamadas";
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            {pestana === "urgentes" ? "Aperturas urgentes" : "Derivación de llamadas"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {pestana === "urgentes"
              ? "Lo que tiene que salir del almacén de inmediato, sin pedido ni cierre: se manda con el código de gerencia y el almacén la toma primero."
              : "Videollamadas y atenciones técnicas derivadas al almacén, por el día que se le dio al cliente. Acá se ve si la tomó, su informe y lo que falta revisar."}
          </p>
        </div>
        {/* Carlos, 23-09 17:24: la apertura directa, sin cotización ni cierre (0295). */}
        {pestana === "urgentes" && <AperturaLlamadaBoton tipo="atencion_in_situ" etiqueta="Apertura urgente" urgenteInicial />}
      </div>
      <Pestanas base="/postventa/aperturas" activa={pestana} />
      <ListaAperturas pestana={pestana} />
    </div>
  );
}
