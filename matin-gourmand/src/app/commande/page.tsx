"use client";

import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowLeft, ArrowRight, Check, LoaderCircle, MapPin, ShoppingBag, Truck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Product = { id: string; name: string; description: string; priceCfa: number; imageId: string; quantity: number; available: number };
type CartLine = { product: Product; quantity: number };
type Zone = { id: string; name: string; feeCfa: number; minimumHours: number; maximumHours: number; neighborhoods: string; kind: "pickup" | "delivery"; instructions: string };
type CreatedOrder = {
  orderId: string; orderNumber: string; trackingToken: string; subtotalCfa: number;
  deliveryFeeCfa: number; totalCfa: number; depositCfa: number; remainingCfa: number;
  paymentChoice: "deposit" | "full"; paymentStatus: string; status: string;
  deliveryMethod: "pickup" | "delivery"; deliveryZone: string; estimatedAt: string;
  items: Array<{ name: string; quantity: number; unitPriceCfa: number; subtotalCfa: number }>;
};

const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} CFA`;
const imageUrl = (imageId: string) => `https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=180&q=75`;

export default function CheckoutPage() {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<CreatedOrder | null>(null);
  const [checkoutUrl, setCheckoutUrl] = useState("");
  const [paymentNotice, setPaymentNotice] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"pickup" | "delivery">("pickup");
  const [selectedZoneId, setSelectedZoneId] = useState("");
  const [paymentChoice, setPaymentChoice] = useState<"deposit" | "full">("deposit");
  const [details, setDetails] = useState({ firstName: "", lastName: "", email: "", phone: "", address: "" });

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [catalogResponse, optionsResponse] = await Promise.all([
          fetch("/api/catalog", { cache: "no-store" }),
          fetch("/api/checkout/options", { cache: "no-store" }),
        ]);
        if (!catalogResponse.ok || !optionsResponse.ok) throw new Error("checkout_unavailable");
        const catalog = await catalogResponse.json() as { products: Product[] };
        const options = await optionsResponse.json() as { zones: Zone[] };
        const stored = sessionStorage.getItem("mg-cart");
        const saved = stored ? JSON.parse(stored) as Array<{ id: string; quantity: number }> : [];
        if (active) {
          const reconciled = saved.flatMap((line) => {
            const product = catalog.products.find((candidate) => candidate.id === line.id);
            return product && product.available && product.quantity > 0 && Number.isInteger(line.quantity)
              ? [{ product, quantity: Math.min(line.quantity, product.quantity) }]
              : [];
          });
          setCart(reconciled);
          setZones(options.zones);
          const initialZone = options.zones.find((zone) => zone.kind === "pickup");
          if (initialZone) setSelectedZoneId(initialZone.id);
        }
      } catch {
        if (active) setError("Le checkout est momentanément indisponible. Réessayez dans quelques instants.");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  const availableZones = zones.filter((zone) => zone.kind === deliveryMethod);
  const selectedZone = availableZones.find((zone) => zone.id === selectedZoneId) || availableZones[0];
  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.product.priceCfa * line.quantity, 0), [cart]);
  const total = subtotal + (selectedZone?.feeCfa || 0);
  const deposit = Math.ceil(total / 2);
  const dueNow = paymentChoice === "deposit" ? deposit : total;
  const remaining = total - dueNow;

  function updateDetail(field: keyof typeof details, value: string) {
    setDetails((current) => ({ ...current, [field]: value }));
  }

  function submitDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStep(2);
  }

  async function submitOrder() {
    if (!selectedZone) {
      setError("Aucun mode de livraison n’est disponible pour cette option.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: details.firstName,
          lastName: details.lastName,
          email: details.email,
          phone: details.phone,
          items: cart.map(({ product, quantity }) => ({ id: product.id, quantity })),
          paymentChoice,
          deliveryMethod,
          deliveryZoneId: selectedZone.id,
          deliveryAddress: deliveryMethod === "delivery" ? details.address : "",
        }),
      });
      const result = await response.json() as { order?: CreatedOrder; error?: string };
      if (!response.ok || !result.order) throw new Error(result.error || "La commande n’a pas pu être enregistrée.");
      setOrder(result.order);
      setStep(3);
      sessionStorage.removeItem("mg-cart");
      sessionStorage.setItem("mg-order-tracking", JSON.stringify({ orderNumber: result.order.orderNumber, trackingToken: result.order.trackingToken }));
      setCart([]);
      const paymentResponse = await fetch(`/api/orders/${result.order.orderNumber}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingToken: result.order.trackingToken }),
      });
      const paymentResult = await paymentResponse.json() as { checkoutUrl?: string; error?: string };
      if (paymentResponse.ok && paymentResult.checkoutUrl) setCheckoutUrl(paymentResult.checkoutUrl);
      else setPaymentNotice(paymentResult.error || "Votre commande est enregistrée. Le paiement est momentanément indisponible.");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <main className="checkout-loading"><LoaderCircle className="spin" size={25} /> Préparation de votre commande…</main>;

  return (
    <main className="checkout-shell">
      <header className="checkout-header">
        <Link href="/" className="wordmark" aria-label="Retour à l’accueil Matin Gourmand"><BrandLogo /></Link>
        {step < 3 && <Link className="checkout-back" href={step === 1 ? "/#menu" : "#details"} onClick={(event) => { if (step === 2) { event.preventDefault(); setStep(1); } }}><ArrowLeft size={14} /> {step === 1 ? "Retour au menu" : "Vos coordonnées"}</Link>}
      </header>

      {step < 3 && <div className="checkout-progress" aria-label={`Étape ${step} sur 2`}><span className={step >= 1 ? "complete" : ""} /><span className={step >= 2 ? "complete" : ""} /></div>}

      {step < 3 && cart.length === 0 ? <section className="checkout-empty"><ShoppingBag size={27} /><h1>Votre panier est vide.</h1><p>Il y a une douceur qui vous attend au menu.</p><Link href="/#menu" className="button-primary">Découvrir le menu <ArrowRight size={15} /></Link></section> : null}

      {step === 1 && cart.length > 0 && <section className="checkout-layout" id="details">
        <div className="checkout-main"><span className="eyebrow">Étape 1 · Vos coordonnées</span><h1>On prépare votre commande.</h1><p className="checkout-intro">Quelques informations pour préparer votre commande et vous tenir au courant.</p>
          <form className="checkout-form" onSubmit={submitDetails}>
            <div className="field-pair"><label>Prénom<input required maxLength={60} autoComplete="given-name" value={details.firstName} onChange={(event) => updateDetail("firstName", event.target.value)} /></label><label>Nom<input required maxLength={60} autoComplete="family-name" value={details.lastName} onChange={(event) => updateDetail("lastName", event.target.value)} /></label></div>
            <label>Email<input required type="email" maxLength={254} autoComplete="email" value={details.email} onChange={(event) => updateDetail("email", event.target.value)} /></label>
            <label>Téléphone<input required type="tel" minLength={8} maxLength={20} autoComplete="tel" placeholder="+225 07 00 00 00 00" value={details.phone} onChange={(event) => updateDetail("phone", event.target.value)} /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button-primary checkout-next" type="submit">Continuer <ArrowRight size={15} /></button>
          </form>
        </div>
        <OrderSummary cart={cart} subtotal={subtotal} deliveryFee={selectedZone?.feeCfa || 0} total={total} />
      </section>}

      {step === 2 && cart.length > 0 && <section className="checkout-layout">
        <div className="checkout-main"><span className="eyebrow">Étape 2 · Livraison et paiement</span><h1>La dernière ligne droite.</h1><p className="checkout-intro">Choisissez comment recevoir vos douceurs, puis le montant à régler.</p>
          <div className="checkout-choice-row" role="group" aria-label="Mode de livraison">
            <button className={`checkout-choice${deliveryMethod === "pickup" ? " selected" : ""}`} type="button" aria-pressed={deliveryMethod === "pickup"} onClick={() => { setDeliveryMethod("pickup"); setSelectedZoneId(zones.find((zone) => zone.kind === "pickup")?.id || ""); }}><ShoppingBag size={18} /><span><strong>Retrait en boutique</strong><small>Gratuit · horaires confirmés par email</small></span><span className="choice-radio" /></button>
            <button className={`checkout-choice${deliveryMethod === "delivery" ? " selected" : ""}`} type="button" aria-pressed={deliveryMethod === "delivery"} onClick={() => { setDeliveryMethod("delivery"); setSelectedZoneId(zones.find((zone) => zone.kind === "delivery")?.id || ""); }}><Truck size={18} /><span><strong>Livraison à domicile</strong><small>Choisissez votre quartier ci-dessous</small></span><span className="choice-radio" /></button>
          </div>
          {availableZones.length > 1 && <label className="zone-field"><span>Zone de livraison</span><select value={selectedZone?.id || ""} onChange={(event) => setSelectedZoneId(event.target.value)}>{availableZones.map((zone) => <option value={zone.id} key={zone.id}>{zone.name} · {zone.feeCfa === 0 ? "Gratuit" : money(zone.feeCfa)} · {zone.minimumHours}–{zone.maximumHours} h</option>)}</select><small>{selectedZone?.instructions}</small></label>}
          {deliveryMethod === "pickup" && selectedZone && <div className="delivery-note"><MapPin size={16} /><span><strong>Retrait en boutique</strong><small>{selectedZone.instructions}</small></span></div>}
          {deliveryMethod === "delivery" && <label>Adresse de livraison<textarea className="checkout-textarea" required minLength={8} maxLength={300} autoComplete="street-address" placeholder="Numéro, rue, quartier et repère" value={details.address} onChange={(event) => updateDetail("address", event.target.value)} /></label>}

          <div className="payment-section"><span className="eyebrow">Choisissez le montant à régler</span><div className="payment-option-list">
            <button className={`payment-option${paymentChoice === "deposit" ? " selected" : ""}`} type="button" aria-pressed={paymentChoice === "deposit"} onClick={() => setPaymentChoice("deposit")}><span className="choice-radio" /><span><strong>Acompte de 50 %</strong><small>Le solde restera dû avant la livraison</small></span><strong>{money(deposit)}</strong></button>
            <button className={`payment-option${paymentChoice === "full" ? " selected" : ""}`} type="button" aria-pressed={paymentChoice === "full"} onClick={() => setPaymentChoice("full")}><span className="choice-radio" /><span><strong>Régler la totalité</strong><small>Un seul paiement pour votre commande</small></span><strong>{money(total)}</strong></button>
          </div><div className="payment-secure"><span className="secure-mark">✓</span><span><strong>Paiement Mobile Money sécurisé</strong><small>Vos coordonnées bancaires ne sont jamais enregistrées ici. Le paiement sera confirmé par la passerelle.</small></span></div></div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button-primary checkout-next" type="button" disabled={submitting || !selectedZone} onClick={() => void submitOrder()}>{submitting ? <><LoaderCircle className="spin" size={15} /> Enregistrement…</> : <>Confirmer la commande <ArrowRight size={15} /></>}</button>
        </div>
        <OrderSummary cart={cart} subtotal={subtotal} deliveryFee={selectedZone?.feeCfa || 0} total={total} deposit={deposit} remaining={remaining} />
      </section>}

      {step === 3 && order && <section className="confirmation-page"><div className="confirmation-icon"><Check size={25} /></div><span className="eyebrow">Commande enregistrée</span><h1>Merci, {details.firstName}.</h1><p className="confirmation-lede">Votre commande <strong>#{order.orderNumber}</strong> est bien enregistrée. Votre boutique prépare la suite.</p>
        <div className="order-status-note"><span className="status-dot" /><span><strong>En attente de paiement</strong><small>La commande sera confirmée lorsque le paiement sera validé par la passerelle.</small></span></div>
        <div className="confirmation-details"><div className="confirmation-items">{order.items.map((item) => <div className="confirmation-line" key={item.name}><span>{item.name} <small>× {item.quantity}</small></span><strong>{money(item.subtotalCfa)}</strong></div>)}</div><div className="summary-line"><span>Sous-total</span><span>{money(order.subtotalCfa)}</span></div><div className="summary-line"><span>{order.deliveryMethod === "pickup" ? "Retrait en boutique" : `Livraison · ${order.deliveryZone}`}</span><span>{money(order.deliveryFeeCfa)}</span></div><div className="summary-line total"><span>Total commande</span><span>{money(order.totalCfa)}</span></div><div className="deposit-highlight"><span>{order.paymentChoice === "deposit" ? "Acompte à régler · 50 %" : "Montant à régler"}</span><strong>{money(order.depositCfa)}</strong></div>{order.remainingCfa > 0 && <div className="summary-line"><span>Solde restant après acompte</span><span>{money(order.remainingCfa)}</span></div>}<div className="summary-line"><span>Mode de réception</span><span>{order.deliveryZone}</span></div><div className="summary-line"><span>Délai estimé</span><span>{new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(order.estimatedAt))}</span></div></div>
        <p className="confirmation-message">Un récapitulatif sera envoyé par email.</p>{paymentNotice && <p className="payment-notice" role="status">{paymentNotice}</p>}{checkoutUrl && <a className="button-primary" href={checkoutUrl} rel="noopener noreferrer">Payer par Mobile Money <ArrowRight size={15} /></a>}<div className="confirmation-actions"><Link href="/suivi" className="text-link">Suivre ma commande <ArrowRight size={14} /></Link><Link href="/" className="text-link">Retour à l’accueil</Link></div>
      </section>}
    </main>
  );
}

function OrderSummary({ cart, subtotal, deliveryFee, total, deposit, remaining }: { cart: CartLine[]; subtotal: number; deliveryFee: number; total: number; deposit?: number; remaining?: number }) {
  return <aside className="order-summary"><h2>Votre sélection</h2><div className="summary-items">{cart.map(({ product, quantity }) => <div className="summary-product" key={product.id}><div className="summary-product-image"><Image src={imageUrl(product.imageId)} alt="" fill sizes="54px" /></div><span className="summary-product-quantity">{quantity}</span><span className="summary-product-name">{product.name}</span><strong>{money(product.priceCfa * quantity)}</strong></div>)}</div><div className="summary-line"><span>Sous-total</span><span>{money(subtotal)}</span></div><div className="summary-line"><span>Livraison</span><span>{deliveryFee === 0 ? "Gratuit" : money(deliveryFee)}</span></div><div className="summary-line total"><span>Total</span><span>{money(total)}</span></div>{deposit !== undefined && <div className="summary-payment"><div className="summary-line"><span>Acompte de 50 %</span><strong>{money(deposit)}</strong></div><div className="summary-line"><span>Solde après acompte</span><span>{money(remaining || 0)}</span></div></div>}</aside>;
}