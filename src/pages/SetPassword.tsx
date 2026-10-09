import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { postAuth, readSession, writeSession, type AuthSession } from "@/lib/session";

type Phase = "checking" | "ready" | "invalid";

export default function SetPassword() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const query = new URLSearchParams(window.location.search);
    const linkType = hash.get("type") || query.get("type") || "";
    setRecovery(linkType === "recovery");

    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const linkError = hash.get("error_description") || query.get("error_description");
    if (linkError) {
      setError(linkError.replaceAll("+", " "));
      setPhase("invalid");
      return;
    }
    if (accessToken && refreshToken) {
      const expiresIn = Number(hash.get("expires_in") || "3600");
      const next = {
        accessToken,
        refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + (Number.isFinite(expiresIn) ? expiresIn : 3600),
      };
      setSession(next);
      setPhase("ready");
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }

    const tokenHash = query.get("token_hash");
    if (tokenHash) {
      postAuth<{ session: AuthSession }>("/api/auth/verify", { tokenHash, type: linkType || "signup" })
        .then((result) => {
          setSession(result.session);
          setPhase("ready");
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch((err) => {
          setError(err instanceof Error ? err.message : "This link is invalid or has expired");
          setPhase("invalid");
        });
      return;
    }

    const existing = readSession();
    if (existing) {
      setSession(existing);
      setPhase("ready");
      return;
    }
    setPhase("invalid");
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!session) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await postAuth("/api/auth/set-password", { accessToken: session.accessToken, password });
      writeSession(session);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="uc-card p-8">
        {phase === "checking" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking your confirmation link…
          </p>
        )}
        {phase === "invalid" && (
          <>
            <h2 className="text-xl font-semibold">Link not valid</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              {error || "This confirmation link is missing, expired, or has already been used."}
            </p>
            <p className="mt-4 text-sm">
              <Link to="/forgot-password" className="font-medium text-[--brand-700] hover:underline">Request a new link</Link>
            </p>
          </>
        )}
        {phase === "ready" && (
          <>
            <h2 className="text-xl font-semibold">{recovery ? "Choose a new password" : "Create your password"}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {recovery
                ? "This replaces the password on your account. You will use it the next time you sign in."
                : "Your email is confirmed. Set the password you will use to sign in."}
            </p>
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" required autoComplete="new-password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" required autoComplete="new-password" minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              {error && <p className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-800" role="alert">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Save password
              </Button>
            </form>
          </>
        )}
      </div>
    </AuthShell>
  );
}
