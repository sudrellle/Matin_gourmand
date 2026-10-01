"use client";

import { ArrowLeft, ArrowRight, Check, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<"credentials" | "otp">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submitCredentials(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json() as { challengeId?: string; message?: string; error?: string };
      if (!response.ok || !result.challengeId) throw new Error(result.error || "Connexion impossible.");
      setChallengeId(result.challengeId);
      setStep("otp");
      setMessage(result.message || "Un code de connexion vous a été envoyé.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue. Réessayez.");
    } finally { setBusy(false); }
  }

  async function submitCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/auth/verify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId, code }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Code invalide ou expiré.");
      router.replace("/admin");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Une erreur est survenue. Réessayez.");
    } finally { setBusy(false); }
  }

  return (
    <main className="admin-login-page">
      <Link href="/" className="admin-login-back"><ArrowLeft size={15} /> Retour à la boutique</Link>
      <section className="admin-login-card">
        <div className="admin-login-brand"><BrandLogo /></div>
        <span className="admin-kicker"><ShieldCheck size={14} /> CONNEXION SÉCURISÉE</span>
        <h1>{step === "credentials" ? "Ravi de vous revoir." : "Vérifions que c’est bien vous."}</h1>
        <p className="admin-login-copy">{step === "credentials" ? "Connectez-vous à votre espace de gestion." : "Saisissez le code à usage unique reçu par email. Il expire après deux minutes."}</p>
        {step === "credentials" ? <form className="admin-login-form" onSubmit={submitCredentials}>
          <label>Email professionnel<span className="input-icon"><Mail size={16} /><input type="email" required maxLength={254} autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} /></span></label>
          <label>Mot de passe<span className="input-icon"><LockKeyhole size={16} /><input type="password" required maxLength={128} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></span></label>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <button className="button-primary admin-login-submit" type="submit" disabled={busy}>{busy ? <><LoaderCircle className="spin" size={15} /> Vérification…</> : <>Continuer <ArrowRight size={15} /></>}</button>
        </form> : <form className="admin-login-form" onSubmit={submitCode}>
          {message && <p className="admin-success"><Check size={15} /> {message}</p>}
          <label>Code à 6 chiffres<input className="otp-input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /></label>
          {error && <p className="admin-alert" role="alert">{error}</p>}
          <button className="button-primary admin-login-submit" type="submit" disabled={busy || code.length !== 6}>{busy ? <><LoaderCircle className="spin" size={15} /> Vérification…</> : <>Valider le code <ArrowRight size={15} /></>}</button>
          <button className="admin-back-step" type="button" disabled={busy} onClick={() => { setStep("credentials"); setCode(""); setError(""); }}>Utiliser un autre compte</button>
        </form>}
        <div className="admin-login-foot"><LockKeyhole size={13} /> Session sécurisée · Déconnexion automatique après 8 h</div>
      </section>
      <span className="admin-login-copyright">MATIN GOURMAND · GESTION DE BOUTIQUE</span>
    </main>
  );
}