import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { postAuth, writeSession, type AuthSession } from "@/lib/session";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await postAuth<{ session: AuthSession }>("/api/auth/signin", { email, password });
      writeSession(result.session);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="uc-card p-8">
        <h2 className="text-xl font-semibold">Staff sign in</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in with the email and password for your Unique Care UK account.
        </p>
        <form className="mt-6 space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link to="/forgot-password" className="text-xs font-medium text-[--brand-700] hover:underline">Forgot password?</Link>
            </div>
            <Input id="password" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          {error && <p className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-800" role="alert">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to UniqueCare Connect?{" "}
        <Link to="/signup" className="font-medium text-[--brand-700] hover:underline">Create an account</Link>
      </p>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        Looking for work? <Link to="/careers" className="font-medium text-[--brand-700] hover:underline">See current vacancies</Link>
      </p>
    </AuthShell>
  );
}
