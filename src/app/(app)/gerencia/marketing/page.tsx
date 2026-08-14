import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function MarketingPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Panel de marketing</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          CPL, CPA y ROAS por campaña — se activa en el bloque B5 cuando exista ingesta
          de gasto (Google Ads / Meta Marketing API) en <code>gasto_campania</code>.
        </p>
      </CardContent>
    </Card>
  );
}
