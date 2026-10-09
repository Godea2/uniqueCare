import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import AuthShell from "@/components/AuthShell";
import { postAuth } from "@/lib/session";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await postAuth("/api/auth/forgot", { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the reset email");
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
              If an account exists for <span className="font-medium text-foreground">{email}</span>,
              we sent a link to choose a new password.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-xl font-semibold">Reset your password</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your account email and we will send a link to set a new password.
            </p>
            <form className="mt-6 space-y-4" onSubmit={submit}>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              {error && <p className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs text-red-800" role="alert">{error}</p>}
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                Send reset link
              </Button>
            </form>
          </>
        )}
      </div>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        <Link to="/login" className="font-medium text-[--brand-700] hover:underline">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
