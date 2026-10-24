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
      <div className="rounded-2xl border border-[--line] bg-white p-8 sm:p-9">
        {sent ? (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[--brand-600]">
              Email sent
            </p>
            <h2 className="mt-2 font-display text-[1.85rem] font-semibold tracking-tight text-[--brand-900]">
              Check your inbox
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[--ink-500]">
              If an account exists for <span className="font-semibold text-[--ink-900]">{email}</span>,
              we sent a link to choose a new password.
            </p>
          </>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[--brand-600]">
              Account recovery
            </p>
            <h2 className="mt-2 font-display text-[1.85rem] font-semibold tracking-tight text-[--brand-900]">
              Reset password
            </h2>
            <p className="mt-2 text-[15px] leading-relaxed text-[--ink-500]">
              Enter your work email and we&apos;ll send a secure reset link.
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
              {error && (
                <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-800" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="mt-1 h-11 w-full text-[15px] font-semibold" size="lg" disabled={busy}>
                {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
            </form>
          </>
        )}
      </div>
      <p className="mt-7 text-center text-sm text-[--ink-500]">
        <Link to="/login" className="font-semibold text-[--brand-700] hover:text-[--brand-900] hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
