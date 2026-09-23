import { requerirPerfil } from "@/lib/auth";
import { ListaAperturas } from "@/components/crm/lista-aperturas";
import { AperturaLlamadaBoton } from "@/components/crm/apertura-llamada-boton";

export const dynamic = "force-dynamic";

/** Las aperturas de llamada que postventa le mandó al almacén (0281, reunión 23-09). */
export default async function AperturasPostventaPage() {
  await requerirPerfil();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">
            Aperturas al almacén
          </h1>
          <p className="text-sm text-muted-foreground">
            Videollamadas y atenciones pedidas al almacén, por el día que se le
            dio al cliente. Ya no se pregunta «¿ya llamaron al cliente?»: acá se
            ve si la tomó, su informe y lo que falta revisar.
          </p>
        </div>
        {/* Carlos, 23-09 17:24: la apertura directa, sin cotización ni cierre (0295). */}
        <AperturaLlamadaBoton
          tipo="atencion_in_situ"
          etiqueta="Apertura urgente"
          urgenteInicial
        />
      </div>
      <ListaAperturas />
    </div>
  );
}
