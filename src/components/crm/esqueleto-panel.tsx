// Esqueleto genérico para los paneles de gerencia. Next lo muestra al
// instante (loading.tsx) mientras el servidor arma la página: la navegación
// se siente inmediata aunque los datos tarden 200–400 ms.
export function EsqueletoPanel({ filas = 3, kpis = 4 }: { filas?: number; kpis?: number }) {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true" aria-label="Cargando">
      <div className="h-14 rounded-xl border border-border bg-card" />
      <div className="h-3 w-64 rounded bg-secondary" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: kpis }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl border border-border bg-card" />
        ))}
      </div>
      {Array.from({ length: filas }).map((_, i) => (
        <div key={i} className="h-56 rounded-xl border border-border bg-card" />
      ))}
    </div>
  );
}
