import { createClient } from "@/lib/supabase/server";
import { ListaDelSistema, type ItemLista } from "@/components/crm/lista-del-sistema";

export const dynamic = "force-dynamic";

/**
 * Las listas del sistema: las palabras que el CRM pone en sus desplegables.
 *
 * «¿Y esta vista tiene sentido? No entiendo qué hace o para qué sirve» (28-08).
 * Sentido tenía; la pantalla no lo contaba. Eran tres tablas de nombres, de
 * solo lectura, que mostraban lo retirado igual que lo vigente —por eso
 * «Compra a futuro» parecía estar dos veces— y no decían cuánto se usa nada.
 * Sin el uso no se puede decidir: retirar una opción a ciegas puede dejar dos
 * mil registros apuntando a algo que ya no se ofrece.
 *
 * Ahora cada lista dice para qué sirve, cuánto pesa cada palabra, cuáles están
 * retiradas, y se puede mantener.
 */

interface FilaUso {
  lista: string;
  id: string;
  codigo: string | null;
  nombre: string;
  activo: boolean;
  usos: number;
}

export default async function CatalogosPage() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("uso_de_listas");
  const filas = (data ?? []) as unknown as FilaUso[];

  const de = (lista: string): ItemLista[] =>
    filas
      .filter((f) => f.lista === lista)
      .map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, activo: f.activo, usos: Number(f.usos) }));

  return (
    <div className="space-y-4">
      <p className="max-w-prose text-sm leading-snug text-muted-foreground">
        Estas son las palabras que el CRM ofrece cuando alguien tiene que elegir. Cambiarlas cambia lo que ven todos:
        el nombre es lo que se lee en el desplegable.
      </p>

      <div className="grid gap-4 lg:grid-cols-3">
        <ListaDelSistema
          lista="rubros"
          titulo="Rubros"
          paraQue="A qué se dedica el cliente. Se elige al registrar la cuenta y es con lo que gerencia mira el mercado por sector."
          items={de("rubros")}
        />
        <ListaDelSistema
          lista="motivos"
          titulo="Motivos de rechazo"
          paraQue="Por qué se perdió una oportunidad. Lo elige el comercial al darla por perdida, y es de donde sale saber si se pierde por precio o por otra cosa."
          items={de("motivos")}
        />
        <ListaDelSistema
          lista="resultados"
          titulo="Resultados de gestión"
          paraQue="Qué pasó en cada llamada o visita. Es lo que el comercial marca al registrar una gestión, y lo que decide cuándo se vuelve a llamar."
          items={de("resultados")}
        />
      </div>

      <p className="max-w-prose rounded-md border border-dashed border-border bg-secondary/40 p-2.5 text-xs leading-snug text-muted-foreground">
        Los resultados de gestión llevan además un <strong className="text-foreground">código</strong> que no se ve y
        no se puede cambiar: hay reglas que lo comparan —la ruta de mantenimiento decide a quién volver a llamar
        buscando «no contestó», «pidió cotización» y «compra a futuro»—. El nombre sí se cambia cuando haga falta.
      </p>
    </div>
  );
}
