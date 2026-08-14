import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CapturaForm } from "./captura-form";

export default function CapturaPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar contacto</CardTitle>
      </CardHeader>
      <CardContent>
        <CapturaForm />
      </CardContent>
    </Card>
  );
}
