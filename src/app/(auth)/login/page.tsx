import { LoginForm } from "./login-form";
import { FondoLogin } from "./fondo-login";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-dvh flex-1 items-center justify-center overflow-hidden p-4">
      <FondoLogin />
      <LoginForm />
    </main>
  );
}
