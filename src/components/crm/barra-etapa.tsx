"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function BarraEtapa({
  etiqueta,
  total,
  maximo,
  destacada,
}: {
  etiqueta: string;
  total: number;
  maximo: number;
  destacada?: boolean;
}) {
  const porcentaje = Math.max((total / maximo) * 100, total > 0 ? 4 : 0);

  return (
    <div className="grid grid-cols-[110px_1fr_44px] items-center gap-3">
      <span className="text-right text-xs text-muted-foreground">{etiqueta}</span>
      <div className="h-6 overflow-hidden rounded-md bg-secondary">
        <motion.div
          className={cn(
            "flex h-full items-center justify-end rounded-md px-2 text-[11px] font-semibold tabular-nums text-white",
            destacada ? "bg-[#1E7F4F]" : "bg-primary",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${porcentaje}%` }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          {total > 0 ? total : ""}
        </motion.div>
      </div>
      <span className="text-right text-xs tabular-nums text-muted-foreground">{total}</span>
    </div>
  );
}
