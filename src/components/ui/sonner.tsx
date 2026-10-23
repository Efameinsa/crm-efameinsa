"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      // En el celular el menú de abajo mide 3.5rem (h-14) + zona segura: los avisos
      // se apoyan encima de él en vez de taparlo.
      // En escritorio la bolita de Efamein vive en la esquina (bottom-5 right-5,
      // 52 px): los avisos arrancan por encima de ella para no taparla.
      offset={{ bottom: 88 }}
      mobileOffset={{ bottom: "calc(3.5rem + env(safe-area-inset-bottom) + 12px)" }}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        closeButtonAriaLabel: "Cerrar aviso",
        classNames: {
          toast: "cn-toast",
          closeButton: "cn-toast-cerrar",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
