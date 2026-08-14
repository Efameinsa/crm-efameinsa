import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function CapturaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar contacto</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Formulario de captura con búsqueda de duplicados (bloque B2) — pendiente de
          construir: canal, área destino, datos de contacto, RUC/DNI con detección en
          vivo contra cuentas existentes.
        </p>
      </CardContent>
    </Card>
  );
}
