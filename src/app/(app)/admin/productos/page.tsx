import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ProductosPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Productos y precios</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Alta de productos, fotos estandarizadas y listas de precios por tier
          (óptimo/medio/deseado/base) — bloque B4.
        </p>
      </CardContent>
    </Card>
  );
}
