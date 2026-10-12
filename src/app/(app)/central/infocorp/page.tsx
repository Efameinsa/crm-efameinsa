import Link from "@/components/enlace";
import { FileText } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requerirRol } from "@/lib/auth";
import { fechaHoraLima } from "@/lib/fechas";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { ResponderInfocorp } from "@/components/crm/responder-infocorp";

export const dynamic = "force-dynamic";

type Fila = {
  id: string;
  cuenta_id: string | null;
  oportunidad_id: string | null;
  ruc: string | null;
  razon_social: string;
  nota: string | null;
  created_at: string;
  atendido_at: string | null;
  resultado: string | null;
  archivo_path: string | null;
  archivo_nombre: string | null;
  es_prueba: boolean;
  pidio: { nombre: string; codigo_comercial: string | null } | null;
  atendio: { nombre: string } | null;
};

/**
 * Los Infocorp que piden los comerciales (0447; Brenda, buzón 12-10). Antes
 * llegaban por correo a Central con el RUC y la razón social; ahora llegan
 * acá y a la campana. Central lo saca de Experian, sube el reporte y al
 * comercial le llega el aviso con el archivo en su expediente.
 */
export default async function InfocorpCentralPage() {
  await requerirRol(["central", "gerencia", "admin"]);
  const supabase = await createClient();
  const columnas =
    "id, cuenta_id, oportunidad_id, ruc, razon_social, nota, created_at, atendido_at, resultado, archivo_path, archivo_nombre, es_prueba, pidio:perfiles!solicitudes_infocorp_solicitado_por_fkey(nombre, codigo_comercial), atendio:perfiles!solicitudes_infocorp_atendido_por_fkey(nombre)";
  const [{ data: pendientes }, { data: atendidas }] = await Promise.all([
    supabase.from("solicitudes_infocorp").select(columnas).is("atendido_at", null).order("created_at", { ascending: true }).limit(200),
    supabase.from("solicitudes_infocorp").select(columnas).not("atendido_at", "is", null).order("atendido_at", { ascending: false }).limit(60),
  ]);
  const listas = { pendientes: (pendientes ?? []) as unknown as Fila[], atendidas: (atendidas ?? []) as unknown as Fila[] };
  const conArchivo = listas.atendidas.filter((f) => f.archivo_path);
  const { data: firmadas } = conArchivo.length
    ? await supabase.storage.from("adjuntos").createSignedUrls(conArchivo.map((f) => f.archivo_path as string), 3600)
    : { data: [] };
  const url = new Map(conArchivo.map((f, i) => [f.id, firmadas?.[i]?.signedUrl ?? null]));

  const tarjeta = (f: Fila) => (
    <li key={f.id} className="grid gap-3 rounded-md border border-border p-3 text-sm md:grid-cols-2">
      <div className="space-y-1">
        <p className="font-semibold text-foreground">
          {f.razon_social}
          {f.es_prueba && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">práctica</span>}
        </p>
        <p className="text-xs text-foreground">{f.ruc ? `RUC ${f.ruc}` : "Sin RUC en la ficha (ver la nota)"}</p>
        <p className="text-xs text-muted-foreground">
          Lo pidió {f.pidio ? `${f.pidio.codigo_comercial ? `${f.pidio.codigo_comercial} · ` : ""}${f.pidio.nombre}` : "—"} · {fechaHoraLima(f.created_at)}
        </p>
        {f.nota && <p className="whitespace-pre-line text-xs text-foreground">Nota: {f.nota}</p>}
        {f.cuenta_id && (
          <Link href={`/central/clientes/${f.cuenta_id}`} className="text-xs text-primary hover:underline">
            Ver la ficha del cliente
          </Link>
        )}
      </div>
      <div className="space-y-1.5">
        {f.atendido_at && (
          <div className="space-y-1 text-xs">
            <p className="text-muted-foreground">
              Respondido {fechaHoraLima(f.atendido_at)}
              {f.atendio ? ` por ${f.atendio.nombre}` : ""}
            </p>
            {f.resultado && <p className="whitespace-pre-line text-foreground">{f.resultado}</p>}
            {url.get(f.id) && (
              <a href={url.get(f.id)!} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                <FileText className="size-3.5" />
                {f.archivo_nombre ?? "Ver el reporte"}
              </a>
            )}
          </div>
        )}
        <ResponderInfocorp id={f.id} respondido={Boolean(f.atendido_at)} />
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <SeccionPanel titulo={`Infocorp por sacar${listas.pendientes.length ? ` · ${listas.pendientes.length}` : ""}`}>
        <p className="mb-3 text-xs text-muted-foreground">
          Lo que piden los comerciales desde el expediente del cliente (antes llegaba por correo). Saque el reporte en
          Experian, súbalo aquí y al comercial le llega el aviso con el archivo.
        </p>
        {listas.pendientes.length ? (
          <ul className="space-y-2">{listas.pendientes.map(tarjeta)}</ul>
        ) : (
          <p className="text-sm text-muted-foreground">No hay Infocorp pendientes: todo lo pedido ya se respondió.</p>
        )}
      </SeccionPanel>
      {listas.atendidas.length > 0 && (
        <SeccionPanel titulo="Respondidos">
          <ul className="space-y-2">{listas.atendidas.map(tarjeta)}</ul>
        </SeccionPanel>
      )}
    </div>
  );
}
