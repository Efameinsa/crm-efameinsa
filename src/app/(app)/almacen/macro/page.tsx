import { redirect } from "next/navigation";
import Link from "@/components/enlace";
import { requerirPerfil } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SeccionPanel } from "@/components/crm/seccion-panel";
import { conteosPorGrupo } from "@/components/propuesta/vistas/almacen-pedidos";
import { conteo as conteoSeries } from "@/components/propuesta/vistas/almacen-series";
import { cargarCatalogo } from "@/lib/catalogo-operaciones";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * EL MACRO DEL ALMACÉN Y DE OPERACIONES (Lesly, reunión de gerencia del
 * 20-10-2026 15:45: «a mí el sistema me pide foto macro, y lo he estado
 * pidiendo»). Santos, 21-10: «la foto macro es el panorama de almacén y
 * operaciones».
 *
 * Es lo mismo que «El macro» de postventa (Carlos, 15-09: «dime cuántos… aquí
 * te tiene que dar todo, y se filtra»), para el lado del almacén y de
 * operaciones: cada número en una tarjeta, y la tarjeta lleva a la pantalla
 * donde ese trabajo se hace, con su filtro. Nada se trabaja aquí: se mira de
 * un vistazo qué hay y dónde está atrasado.
 */
interface Cuadro {
  titulo: string;
  numero: number;
  ayuda: string;
  href: string;
  alerta?: boolean;
}

function Tarjeta({ c }: { c: Cuadro }) {
  return (
    <Link
      href={c.href}
      className={cn(
        "flex flex-col rounded-lg border p-3 transition-colors hover:bg-accent",
        c.alerta && c.numero > 0 ? "border-destructive/40 bg-destructive/5" : "border-border",
      )}
    >
      <span className={cn("text-2xl font-bold leading-none tabular-nums", c.alerta && c.numero > 0 ? "text-destructive" : "text-foreground")}>
        {c.numero}
      </span>
      <span className="mt-1.5 text-xs font-semibold text-foreground">{c.titulo}</span>
      <span className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{c.ayuda}</span>
    </Link>
  );
}

function Bloque({ titulo, cuadros }: { titulo: string; cuadros: Cuadro[] }) {
  return (
    <div className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {cuadros.map((c) => (
          <Tarjeta key={c.titulo} c={c} />
        ))}
      </div>
    </div>
  );
}

export default async function MacroAlmacenPage() {
  const perfil = await requerirPerfil();
  const esOperaciones = Boolean(perfil.es_operaciones) || perfil.rol === "operaciones";
  const entra = esOperaciones || Boolean(perfil.es_almacen) || ["gerencia", "admin"].includes(perfil.rol);
  if (!entra) redirect("/");
  const supabase = await createClient();

  // Las mismas pantallas que ya trabajan cada cosa: operaciones las tiene en su
  // sección «Almacén»; la cuenta del almacén, en Pedidos.
  const porHacer = esOperaciones ? "/nuevo/almacen/por-hacer" : "/nuevo/pedidos";
  const series = esOperaciones ? "/nuevo/almacen/series" : "/almacen/pedidos?ver=series";

  const [g, nSeries, catalogo, { count: pedidosCatalogo }, { count: recepciones }, { data: repetidas }] = await Promise.all([
    conteosPorGrupo(supabase),
    conteoSeries(supabase),
    esOperaciones || ["gerencia", "admin"].includes(perfil.rol) ? cargarCatalogo(supabase) : Promise.resolve(null),
    supabase.from("pedidos_catalogo").select("id", { count: "exact", head: true }).in("estado", ["nuevo", "en_proceso"]),
    supabase.from("recepciones_equipo").select("id", { count: "exact", head: true }).is("anulada_at", null).is("listo_at", null),
    esOperaciones || ["gerencia", "admin"].includes(perfil.rol)
      ? supabase.rpc("fichas_repetidas", { p_solo_comercial: null })
      : Promise.resolve({ data: null }),
  ]);
  const gruposRepetidos = ((repetidas ?? []) as { clave: string }[]).length;

  const almacen: Cuadro[] = [
    { titulo: "Por despachar", numero: g.despachar, ayuda: "Con apertura de despacho: preparar y sacar. Lo atrasado y lo de hoy primero.", href: porHacer, alerta: true },
    { titulo: "Probar y embalar", numero: g.probar, ayuda: "Postventa pidió la prueba: falta el protocolo y el check.", href: porHacer },
    { titulo: "Generación de código", numero: nSeries, ayuda: "Pedidos que esperan la serie o el código de sus equipos.", href: series },
    { titulo: "Llamadas sin informe", numero: g.llamadas, ayuda: "Derivaciones de llamada de postventa que esperan el informe del almacén.", href: porHacer },
    { titulo: "Faltan fotos del despacho", numero: g.fotos, ayuda: "Salieron: falta la foto en el transporte (planta) o en la agencia.", href: porHacer },
    { titulo: "Falta la guía", numero: g.guia, ayuda: "Salieron: falta la foto de la guía en la agencia.", href: porHacer },
    { titulo: "Equipos que llegan a planta", numero: recepciones ?? g.recepcion, ayuda: "Recepciones abiertas (apertura interna): recibir con fotos, revisar y dejar el informe.", href: "/recepciones" },
    { titulo: "Con fecha, sin apertura", numero: g.sinApertura, ayuda: "Postventa puso fecha pero todavía no emitió la apertura.", href: porHacer },
    { titulo: "Para adelantar", numero: g.adelantar, ayuda: "Aprobados; postventa todavía no pidió la prueba.", href: porHacer },
  ];

  const operaciones: Cuadro[] = catalogo
    ? [
        { titulo: "Pedidos al catálogo", numero: pedidosCatalogo ?? 0, ayuda: "Lo que pidieron con «Pedir a Lesly» y sigue sin responder.", href: "/pedidos-catalogo", alerta: true },
        { titulo: "Equipos sin precio", numero: catalogo.salud.sinPrecio, ayuda: "Activos y sin precio vigente: el comercial no los puede cotizar bien.", href: "/operaciones/catalogo" },
        { titulo: "Equipos sin ficha técnica", numero: catalogo.salud.sinFicha, ayuda: "Activos sin la descripción de la hoja técnica.", href: "/operaciones/catalogo" },
        { titulo: "Equipos sin foto", numero: catalogo.salud.sinFoto, ayuda: "Activos sin la foto del equipo.", href: "/operaciones/catalogo" },
        { titulo: "Fichas repetidas", numero: gruposRepetidos, ayuda: "Clientes con dos o más fichas (mismo nombre o mismo RUC/DNI) para unir.", href: "/fichas-repetidas" },
      ]
    : [];

  return (
    <SeccionPanel titulo="El macro">
      <p className="mb-4 max-w-prose text-xs text-muted-foreground">
        Todo lo que tiene el almacén{operaciones.length ? " y operaciones" : ""} en este momento, en números. Cada tarjeta lleva a la pantalla
        donde ese trabajo se hace. Lo que está en rojo es lo que corre prisa.
      </p>
      <div className="space-y-5">
        <Bloque titulo="Almacén" cuadros={almacen} />
        {operaciones.length > 0 && <Bloque titulo="Operaciones" cuadros={operaciones} />}
      </div>
    </SeccionPanel>
  );
}
