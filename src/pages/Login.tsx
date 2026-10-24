import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { postAuth, writeSession, type AuthSession } from "@/lib/session";

const PUBLIC_CAREERS_URL = "https://www.uniquecareuk.online/careers";

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
      <div className="rounded-2xl border border-[--line] bg-white p-8 sm:p-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[--brand-600]">
          UniqueCare Connect
        </p>
        <h2 className="mt-2 font-display text-[1.85rem] font-semibold tracking-tight text-[--brand-900]">
          Staff sign in
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-[--ink-500]">
          Use your Unique Care UK work email and password.
        </p>

        <form className="mt-7 space-y-4" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="password">Password</Label>
              <Link
                to="/forgot-password"
                className="text-xs font-semibold text-[--brand-700] hover:text-[--brand-900] hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11"
            />
          </div>
          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" className="mt-1 h-11 w-full text-[15px] font-semibold" size="lg" disabled={busy}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Sign in
          </Button>
        </form>
      </div>

      <div className="mt-7 space-y-3 text-center text-sm text-[--ink-500]">
        <p>
          New here?{" "}
          <Link to="/signup" className="font-semibold text-[--brand-700] hover:text-[--brand-900] hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-xs">
          Looking for work?{" "}
          <a
            href={PUBLIC_CAREERS_URL}
            className="font-semibold text-[--brand-700] hover:text-[--brand-900] hover:underline"
          >
            See open roles
          </a>
        </p>
      </div>
    </AuthShell>
  );
}
