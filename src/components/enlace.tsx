"use client";

// EL ENLACE DEL CRM (26-09, diagnóstico de consumo). El <Link> de Next pide
// por adelantado cada enlace que aparece en pantalla: abrir una lista de
// gerencia disparaba entre 13 y 41 pedidos al servidor, y cada uno era una
// función de Vercel que además verificaba la sesión y leía el perfil y el
// comunicado. Era la mayor parte de las ~115 000 funciones diarias del CRM.
//
// Este enlace no pide nada al aparecer. Pide la pantalla cuando alguien deja
// el mouse encima un momento (intención de hacer clic) o apoya el dedo: el
// clic sigue sintiéndose rápido y solo se paga lo que de verdad se abre.
// Quien pase `prefetch` explícito conserva el comportamiento de Next.
// Vale también para el menú: sus ~12 enlaces se volvían a pedir en cada
// carga de página y cada 3 minutos mientras la pestaña seguía abierta.

import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, type ComponentProps } from "react";

type Props = ComponentProps<typeof NextLink>;

const ESPERA_MS = 120;

export default function Enlace({ prefetch, onMouseEnter, onMouseLeave, onTouchStart, ...props }: Props) {
  const router = useRouter();
  const espera = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pedido = useRef(false);
  useEffect(() => () => {
    if (espera.current) clearTimeout(espera.current);
  }, []);

  if (prefetch !== undefined) {
    return <NextLink prefetch={prefetch} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} onTouchStart={onTouchStart} {...props} />;
  }

  const href = typeof props.href === "string" ? props.href : null;
  function pedir() {
    if (pedido.current || !href || !href.startsWith("/")) return;
    pedido.current = true;
    router.prefetch(href);
  }

  return (
    <NextLink
      prefetch={false}
      onMouseEnter={(e) => {
        onMouseEnter?.(e);
        if (espera.current) clearTimeout(espera.current);
        espera.current = setTimeout(pedir, ESPERA_MS);
      }}
      onMouseLeave={(e) => {
        onMouseLeave?.(e);
        if (espera.current) clearTimeout(espera.current);
      }}
      onTouchStart={(e) => {
        onTouchStart?.(e);
        pedir();
      }}
      {...props}
    />
  );
}
