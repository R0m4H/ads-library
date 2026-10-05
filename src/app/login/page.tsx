"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Sign-up is open to this email domain, plus anyone an owner has invited on the Team page. The page
// does not try to judge an address itself — the database decides (migrations 0012 and 0013) and this
// only explains the refusal.
const COMPANY_DOMAIN = "bog.ge";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // Set after a successful sign-up that still needs email confirmation; shows the "check your inbox" screen.
  const [signedUpEmail, setSignedUpEmail] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "sign-in") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          // Supabase gives this same message for a wrong password and for an email with no
          // account (on purpose, so it can't be used to find out who is registered) — so point
          // new people to Sign up without saying which of the two it was.
          setError(
            /invalid login credentials/i.test(error.message)
              ? `Invalid login credentials. No account yet? Choose "Sign up" below — use your @${COMPANY_DOMAIN} email, or the address an owner invited.`
              : error.message
          );
        } else {
          router.push("/");
          router.refresh();
        }
      } else {
        const address = email.trim().toLowerCase();
        const { data, error } = await supabase.auth.signUp({
          email: address,
          password,
          // Where the confirmation link in the email sends the person back to.
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (error) {
          // The database rejects an address that is neither on the company domain nor invited with this
          // generic error.
          setError(
            /database error saving new user/i.test(error.message)
              ? `Couldn't create the account. Use your @${COMPANY_DOMAIN} email, or ask an owner to invite the address you want to use.`
              : error.message
          );
        } else if (data.session) {
          // Email confirmation is off, so signing up also signs the user in.
          // New accounts start as viewers, whose home is the Ad Library.
          router.push("/ads");
          router.refresh();
        } else if (data.user && data.user.identities?.length === 0) {
          // With confirmation on, Supabase answers "success" for an address that already has an
          // account (so it can't be used to discover who is registered), but returns no identities.
          setError("An account with this email already exists. Log in instead.");
        } else {
          setSignedUpEmail(address);
          setPassword("");
        }
      }
    } catch (e) {
      // A thrown network-level error (e.g. "Failed to fetch") skips the
      // normal { error } return path entirely — without this, the button
      // gets stuck on "Please wait…" forever with no visible feedback.
      setError(e instanceof Error ? e.message : "Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-navy to-navy-light">
      <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-8 shadow-lg">
        <h1 className="mb-1 text-xl font-semibold">
          Competitors <span className="text-bog">Analysis</span>
        </h1>
        {signedUpEmail ? (
          <div className="mt-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-bog-pale text-bog">
              <MailCheck className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold text-neutral-900">Account created</h2>
            <p className="mt-2 text-sm text-neutral-600">
              We sent a confirmation link to <strong className="break-words text-neutral-900">{signedUpEmail}</strong>.
            </p>
            <p className="mt-2 text-sm text-neutral-600">
              Open the email and click the link to activate your account. After that, come back here and log in.
            </p>
            <p className="mt-3 text-xs text-neutral-400">Can&apos;t find it? Check your spam folder.</p>
            <button
              onClick={() => {
                setSignedUpEmail(null);
                setMode("sign-in");
              }}
              className="mt-6 w-full rounded-md bg-bog px-3 py-2 text-sm font-medium text-white hover:bg-bog-dark"
            >
              Go to Log in
            </button>
          </div>
        ) : (
          <>
        <p className="mb-6 text-sm text-neutral-500">
          {mode === "sign-in" ? "Log in to your team's ad library." : `Use your @${COMPANY_DOMAIN} email, or the address you were invited with.`}
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
            <input
              type="email"
              required
              placeholder={mode === "sign-up" ? `you@${COMPANY_DOMAIN}` : undefined}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-bog focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-bog focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-bog px-3 py-2 text-sm font-medium text-white hover:bg-bog-dark disabled:opacity-50"
          >
            {loading ? "Please wait…" : mode === "sign-in" ? "Log in" : "Sign up"}
          </button>
        </form>
        <button
          onClick={() => setMode(mode === "sign-in" ? "sign-up" : "sign-in")}
          className="mt-4 text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800"
        >
          {mode === "sign-in" ? "Need an account? Sign up" : "Already have an account? Log in"}
        </button>
          </>
        )}
      </div>
    </div>
  );
}
