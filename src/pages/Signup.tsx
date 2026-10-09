import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { postAuth, writeSession, type AuthSession } from "@/lib/session";

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await postAuth<{ status: "confirm_email" | "session"; session?: AuthSession }>("/api/auth/signup", { email, fullName });
      if (result.status === "session" && result.session) {
        writeSession(result.session);
        navigate("/auth/set-password");
        return;
      }
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <div className="uc-card p-8">
        {sent ? (
          <>
            <h2 className="text-xl font-semibold">Check your email</h2>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
              Open it to create your password. The link expires after a short time.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">Create your account</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Use your work email. You will set a password after you confirm the address.
            </p>
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div>
                <Label htmlFor="full-name">Full name</Label>
                <Input id="full-name" required autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-800" role="alert">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Create account
              </Button>
            </form>
          </>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link to="/login" className="font-medium text-[--brand-700] hover:underline">Sign in</Link>
      </p>
    </AuthShell>
  );
}
