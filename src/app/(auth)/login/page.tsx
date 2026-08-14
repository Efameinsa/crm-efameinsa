import { LoginForm } from "./login-form";
import { FondoLogin } from "./fondo-login";

export default function LoginPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-gradient-to-b from-white to-[var(--app-bg)] p-4">
      <FondoLogin />
      <LoginForm />
    </main>
  );
}
