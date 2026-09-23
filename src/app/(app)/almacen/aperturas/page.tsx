import { requerirPerfil } from "@/lib/auth";
import { ListaAperturas } from "@/components/crm/lista-aperturas";

export const dynamic = "force-dynamic";

/** Las aperturas de llamada que llegan de postventa (0281): «que me lleguen las aperturas» (Lesly, 16-09). */
export default async function AperturasAlmacenPage() {
  await requerirPerfil();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Aperturas de postventa</h1>
        <p className="text-sm text-muted-foreground">
          Lo que postventa pide: videollamadas y atenciones, por día. Tómela para que sepan que está en sus manos y, al terminar, suba el informe con lo que le falta
          al cliente.
        </p>
      </div>
      <ListaAperturas vistaAlmacen />
    </div>
  );
}
