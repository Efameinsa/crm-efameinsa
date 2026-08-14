import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center bg-secondary p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-efameinsa.png" alt="Efameinsa" className="h-12 w-auto" />
          <p className="text-sm text-muted-foreground">
            Ingrese con su cuenta del CRM comercial.
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
