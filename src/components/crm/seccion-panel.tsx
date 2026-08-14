export function SeccionPanel({
  titulo,
  accion,
  children,
}: {
  titulo: string;
  accion?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <h2 className="text-[13px] font-bold uppercase tracking-wide text-foreground">{titulo}</h2>
        {accion}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}
