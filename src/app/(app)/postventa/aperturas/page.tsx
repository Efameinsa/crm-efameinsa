import { requerirPerfil } from "@/lib/auth";
import { ListaAperturas } from "@/components/crm/lista-aperturas";

export const dynamic = "force-dynamic";

/** Las aperturas de llamada que postventa le mandó al almacén (0281, reunión 23-09). */
export default async function AperturasPostventaPage() {
  await requerirPerfil();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Aperturas al almacén</h1>
        <p className="text-sm text-muted-foreground">
          Videollamadas y atenciones pedidas al almacén, por el día que se le dio al cliente. Ya no se pregunta «¿ya llamaron al cliente?»: acá se ve si la
          tomó, su informe y lo que falta revisar.
        </p>
      </div>
      <ListaAperturas />
    </div>
  );
}
