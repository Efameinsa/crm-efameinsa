import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { ListaAperturas, type PestanaAperturas } from "@/components/crm/lista-aperturas";
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

/** Lo que postventa le deriva al almacén (0281): «que me lleguen las aperturas» (Lesly, 16-09); nombre y pestañas del 25-09. */
export default async function AperturasAlmacenPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  await requerirPerfil();
  const pestana: PestanaAperturas = (await searchParams).ver === "urgentes" ? "urgentes" : "llamadas";
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">{pestana === "urgentes" ? "Aperturas urgentes" : "Llamadas derivadas por postventa"}</h1>
        <p className="text-sm text-muted-foreground">
          {pestana === "urgentes"
            ? "Lo que postventa necesita sacar del almacén de inmediato, sin pedido. Tómela primero."
            : "Videollamadas y atenciones técnicas, por día. Tómela para que sepan que está en sus manos y, al terminar, suba el informe con lo que le falta al cliente."}
        </p>
      </div>
      <Pestanas base="/almacen/aperturas" activa={pestana} />
      <ListaAperturas vistaAlmacen pestana={pestana} />
    </div>
  );
}
