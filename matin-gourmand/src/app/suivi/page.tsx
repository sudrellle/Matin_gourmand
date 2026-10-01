"use client";

import Link from "next/link";
import { ArrowLeft, Check, Clock3, CookingPot, LoaderCircle, MapPin, PackageCheck, ShoppingBag, Truck } from "lucide-react";
import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type TrackedOrder = {
  orderNumber: string; status: string; paymentStatus: string; subtotalCfa: number;
  deliveryFeeCfa: number; totalCfa: number; depositCfa: number; remainingCfa: number;
  deliveryMethod: string; deliveryZone: string; estimatedAt: string; createdAt: string;
  items: string;
};

const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} CFA`;
const stages = [
  { id: "confirmed", label: "Commande confirmée", icon: Check },
  { id: "preparing", label: "En préparation", icon: CookingPot },
  { id: "ready", label: "Prête à retirer / livrer", icon: PackageCheck },
  { id: "delivered", label: "Remise au client", icon: Truck },
];

export default function TrackingPage() {
  const [order, setOrder] = useState<TrackedOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const hash = window.location.hash.slice(1);
        let tracking: { orderNumber?: string; trackingToken?: string } | null = null;
        if (hash.includes(".")) {
          const separator = hash.indexOf(".");
          tracking = { orderNumber: hash.slice(0, separator), trackingToken: hash.slice(separator + 1) };
          sessionStorage.setItem("mg-order-tracking", JSON.stringify(tracking));
          window.history.replaceState(null, "", window.location.pathname);
        } else {
          const saved = sessionStorage.getItem("mg-order-tracking");
          tracking = saved ? JSON.parse(saved) as { orderNumber?: string; trackingToken?: string } : null;
        }
        if (!tracking?.orderNumber || !tracking.trackingToken) throw new Error("Ouvrez le suivi depuis votre confirmation de commande sur cet appareil.");
        const response = await fetch(`/api/orders/${tracking.orderNumber}/tracking`, {
          headers: { Authorization: `Bearer ${tracking.trackingToken}` },
          cache: "no-store",
        });
        const result = await response.json() as { order?: TrackedOrder; error?: string };
        if (!response.ok || !result.order) throw new Error(result.error || "Commande introuvable.");
        if (active) setOrder(result.order);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : "Impossible de charger le suivi.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const currentIndex = order ? stages.findIndex((stage) => stage.id === order.status) : -1;
  const items = order ? JSON.parse(order.items) as Array<{ name: string; quantity: number; subtotalCfa: number }> : [];

  return <main className="tracking-page"><header className="tracking-header"><Link href="/" className="wordmark" aria-label="Retour à l’accueil Matin Gourmand"><BrandLogo /></Link><Link href="/" className="checkout-back"><ArrowLeft size={14} /> Retour à la boutique</Link></header>{loading ? <div className="tracking-state"><LoaderCircle className="spin" size={24} /> Chargement de votre commande…</div> : error ? <section className="tracking-state tracking-error"><ShoppingBag size={25} /><h1>Suivi de commande</h1><p>{error}</p><Link className="button-primary" href="/">Retour à la boutique</Link></section> : order ? <section className="tracking-content"><span className="eyebrow">VOTRE COMMANDE</span><h1>On s’en occupe.</h1><p className="tracking-intro">La commande <strong>#{order.orderNumber}</strong> · passée le {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.createdAt))}</p>{order.status === "cancelled" ? <div className="tracking-cancelled">Cette commande a été annulée.</div> : <div className="tracking-timeline">{stages.map((stage, index) => { const Icon = stage.icon; const complete = currentIndex >= index; const current = currentIndex === index; return <div className={`timeline-step${complete ? " complete" : ""}${current ? " current" : ""}`} key={stage.id}><span className="timeline-marker"><Icon size={15} /></span><span className="timeline-copy"><b>{stage.label}</b>{current && <small>{stage.id === "confirmed" ? order.status === "created" ? "En attente de confirmation du paiement" : "Votre commande est enregistrée" : "Nous vous tenons au courant par email"}</small>}</span>{index < stages.length - 1 && <span className="timeline-connector" />}</div>; })}</div>}<div className="tracking-delivery"><MapPin size={15} /><span><b>{order.deliveryMethod === "pickup" ? "Retrait en boutique" : "Livraison à domicile"}</b><small>{order.deliveryZone} · délai estimé {new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.estimatedAt))}</small></span><Clock3 size={15} /></div><div className="tracking-summary"><h2>Récapitulatif</h2>{items.map((item) => <div className="tracking-line" key={item.name}><span>{item.name} × {item.quantity}</span><span>{money(item.subtotalCfa)}</span></div>)}<div className="tracking-line"><span>Sous-total</span><span>{money(order.subtotalCfa)}</span></div><div className="tracking-line"><span>Livraison</span><span>{money(order.deliveryFeeCfa)}</span></div><div className="tracking-line grand-total"><b>Total commande</b><b>{money(order.totalCfa)}</b></div><div className="tracking-line"><span>Paiement</span><span>{order.paymentStatus === "paid" ? "Payée" : order.paymentStatus === "partial" ? "Acompte reçu" : order.paymentStatus === "failed" ? "Échec du paiement" : "En attente"}</span></div><div className="tracking-line"><span>Solde restant</span><span>{money(order.remainingCfa)}</span></div></div><p className="tracking-private">Ce suivi est privé. Ne partagez pas le lien de votre confirmation.</p></section> : null}</main>;
}