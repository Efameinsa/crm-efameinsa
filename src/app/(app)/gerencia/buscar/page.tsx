import { redirect } from "next/navigation";

// El buscador pasó a /buscar (29-09): dentro de /gerencia, el control de la
// sección solo deja entrar a gerencia y admin, y Central y Lesly (operaciones)
// quedaban en «Cargando» y volvían a su inicio. Los enlaces viejos siguen sirviendo.
export default async function BuscarViejo({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  redirect(q ? `/buscar?q=${encodeURIComponent(q)}` : "/buscar");
}
