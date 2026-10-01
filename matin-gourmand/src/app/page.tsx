"use client";

import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChefHat,
  CalendarDays,
  Clock3,
  Croissant,
  Heart,
  Leaf,
  MapPin,
  Menu,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Truck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

type Category = { id: string; name: string; description: string; color: string; displayOrder: number };
type Product = {
  id: string;
  categoryId: string;
  category: string;
  name: string;
  description: string;
  priceCfa: number;
  imageId: string;
  available: number;
  quantity: number;
  featured: number;
};
type EventItem = {
  id: string;
  title: string;
  summary: string;
  description: string;
  imageId: string;
  location: string;
  startsAt: string;
  endsAt: string;
};
type CartLine = { product: Product; quantity: number };
type Catalog = { categories: Category[]; products: Product[] };

const formatPrice = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} CFA`;
const imageUrl = (imageId: string, width = 900) =>
  `https://images.unsplash.com/${imageId}?auto=format&fit=crop&w=${width}&q=82`;

export default function Home() {
  const [catalog, setCatalog] = useState<Catalog>({ categories: [], products: [] });
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("Tous les produits");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/catalog", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Catalog unavailable");
        return response.json() as Promise<Catalog>;
      })
      .then((data) => {
        if (active) {
          setCatalog(data);
          try {
            const savedCart = sessionStorage.getItem("mg-cart");
            const parsed = savedCart ? JSON.parse(savedCart) as Array<{ id: string; quantity: number }> : [];
            if (Array.isArray(parsed)) {
              setCart(parsed.flatMap((line) => {
                const product = data.products.find((candidate) => candidate.id === line.id);
                return product && Number.isInteger(line.quantity) && line.quantity > 0
                  ? [{ product, quantity: Math.min(line.quantity, product.quantity) }]
                  : [];
              }));
            }
          } catch {
            sessionStorage.removeItem("mg-cart");
          }
        }
      })
      .catch(() => {
        if (active) setCatalogError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    fetch("/api/events", { cache: "no-store" })
      .then((response) => response.ok ? response.json() as Promise<{ events: EventItem[] }> : Promise.reject())
      .then((data) => { if (active) setEvents(data.events); })
      .catch(() => { if (active) setEvents([]); });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return catalog.products.filter((product) => {
      const categoryMatch = selectedCategory === "Tous les produits" || product.category === selectedCategory;
      const searchMatch = !query || `${product.name} ${product.category} ${product.description}`.toLocaleLowerCase("fr").includes(query);
      return categoryMatch && searchMatch;
    });
  }, [catalog.products, search, selectedCategory]);

  const cartCount = cart.reduce((total, line) => total + line.quantity, 0);
  const cartTotal = cart.reduce((total, line) => total + line.product.priceCfa * line.quantity, 0);

  function addToCart(product: Product) {
    if (!product.available || product.quantity < 1) return;
    const existing = cart.find((line) => line.product.id === product.id);
    const next = existing
      ? cart.map((line) => line.product.id === product.id ? { ...line, quantity: Math.min(line.quantity + 1, product.quantity) } : line)
      : [...cart, { product, quantity: 1 }];
    setCart(next);
    sessionStorage.setItem("mg-cart", JSON.stringify(next.map((line) => ({ id: line.product.id, quantity: line.quantity }))));
    setToast(`${product.name} ajouté au panier`);
  }

  function changeQuantity(productId: string, delta: number) {
    const next = cart
      .map((line) => line.product.id === productId
        ? { ...line, quantity: Math.min(line.product.quantity, line.quantity + delta) }
        : line)
      .filter((line) => line.quantity > 0);
    setCart(next);
    sessionStorage.setItem("mg-cart", JSON.stringify(next.map((line) => ({ id: line.product.id, quantity: line.quantity }))));
  }

  return (
    <>
      <div className="announcement"><Sparkles size={12} aria-hidden="true" /> Chaque matin, de bonnes choses faites avec le temps et le cœur</div>
      <header className="site-header">
        <div className="header-inner">
          <a className="wordmark" href="#accueil" aria-label="Matin Gourmand, accueil">
            <BrandLogo />
          </a>
          <nav className={`main-nav${mobileMenuOpen ? " open" : ""}`} aria-label="Navigation principale">
            <a href="#menu" onClick={() => setMobileMenuOpen(false)}>Le menu</a>
            <a href="#maison" onClick={() => setMobileMenuOpen(false)}>La maison</a>
            <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Nous trouver</a>
          </nav>
          <div className="header-actions">
            <a className="admin-link" href="/admin/connexion">Espace boutique</a>
            <button className="icon-button mobile-menu" type="button" aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"} onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
              {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
            <button className="icon-button" type="button" aria-label={`Ouvrir le panier, ${cartCount} article${cartCount > 1 ? "s" : ""}`} onClick={() => setCartOpen(true)}>
              <ShoppingBag size={17} strokeWidth={1.7} />
              {cartCount > 0 && <span className="cart-count">{cartCount}</span>}
            </button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero" id="accueil">
          <div className="hero-copy">
            <span className="eyebrow">La boulangerie du quartier</span>
            <h1>Les plaisirs du matin, <em>bien faits.</em></h1>
            <p>Une pâte qui repose, un four qui chante et de belles choses à partager. Nos fournées vous attendent.</p>
            <div className="hero-cta">
              <a className="button-primary" href="#menu">Découvrir le menu <ArrowRight size={15} /></a>
              <button className="button-secondary" type="button" onClick={() => setCartOpen(true)}>Commander <ShoppingBag size={14} /></button>
            </div>
            <div className="hero-note"><Clock3 size={14} /> Préparé chaque matin, à deux pas de chez vous</div>
          </div>
          <div className="hero-image">
            <Image src={imageUrl("photo-1555507036-ab1f4038808a", 1400)} alt="Croissants et pains frais sortis du four" fill priority sizes="(max-width: 600px) 100vw, 50vw" />
            <div className="floating-seal">Pétris<br />avec soin<br />depuis le matin</div>
            <div className="image-note"><span /> La fournée du jour</div>
          </div>
        </section>

        <div className="trust-row" aria-label="Nos engagements">
          <div className="trust-item"><Croissant size={17} /> Fait maison chaque jour</div>
          <div className="trust-item"><Leaf size={17} /> De bons ingrédients</div>
          <div className="trust-item"><Truck size={17} /> Livraison de proximité</div>
          <div className="trust-item"><Heart size={17} /> Préparé avec attention</div>
        </div>

        <section className="section" id="menu">
          <div className="section-heading">
            <div><span className="eyebrow">La carte du moment</span><h2>À chacun sa douceur.</h2><p>De quoi faire une belle matinée, ou une très bonne après-midi.</p></div>
            <a className="text-link" href="#menu">Tout le menu <ArrowDown size={14} /></a>
          </div>
          <div className="category-row" role="group" aria-label="Filtrer par catégorie">
            {["Tous les produits", ...catalog.categories.map((category) => category.name)].map((category) => (
              <button className={`category-chip${selectedCategory === category ? " active" : ""}`} key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)}>{category}</button>
            ))}
          </div>
          <div className="catalog-tools">
            <label className="search-box"><Search size={15} /><input type="search" placeholder="Une envie particulière ?" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Rechercher un produit" /></label>
            <span className="catalog-count">{loading ? "Chargement…" : `${filteredProducts.length} douceur${filteredProducts.length > 1 ? "s" : ""}`}</span>
          </div>
          <div className="product-grid" aria-live="polite">
            {loading && Array.from({ length: 4 }, (_, index) => <div className="skeleton" key={index} aria-hidden="true" />)}
            {!loading && catalogError && <div className="empty-state">Le menu ne peut pas être chargé pour le moment. Réessayez dans quelques instants.</div>}
            {!loading && !catalogError && filteredProducts.map((product, index) => (
              <article className="product-card" key={product.id} style={{ animationDelay: `${Math.min(index, 7) * 45}ms` }}>
                <div className="product-photo">
                  <Image src={imageUrl(product.imageId, 780)} alt={product.name} fill sizes="(max-width: 600px) 48vw, (max-width: 850px) 30vw, 24vw" />
                  {product.featured === 1 && <span className="product-tag">Le favori</span>}
                  {(!product.available || product.quantity < 1) && <span className="product-tag sold-out">Indisponible</span>}
                  <button className="quick-add" type="button" aria-label={`Ajouter ${product.name} au panier`} disabled={!product.available || product.quantity < 1} onClick={() => addToCart(product)}><Plus size={17} /></button>
                </div>
                <div className="product-info">
                  <span className="product-category">{product.category}</span>
                  <button className="product-name" type="button" onClick={() => setActiveProduct(product)}>{product.name}</button>
                  <p className="product-description">{product.description}</p>
                  <div className="product-bottom"><span className="price">{formatPrice(product.priceCfa)}</span><span className={`availability${product.available && product.quantity > 0 ? "" : " unavailable"}`}>{product.available && product.quantity > 0 ? "En boutique" : "Indisponible"}</span></div>
                </div>
              </article>
            ))}
            {!loading && !catalogError && filteredProducts.length === 0 && <div className="empty-state">Aucune douceur ne correspond à cette recherche.</div>}
          </div>
        </section>

        {events.length > 0 && <section className="section event-section" aria-labelledby="events-title">
          <div className="section-heading"><div><span className="eyebrow">La maison vous invite</span><h2 id="events-title">Les prochains rendez-vous.</h2><p>De beaux moments à partager, préparés avec soin.</p></div><span className="event-count"><CalendarDays size={14} /> {events.length} événement{events.length > 1 ? "s" : ""}</span></div>
          <div className="event-grid">{events.map((event) => <article className="event-card" key={event.id}><div className="event-photo"><Image src={imageUrl(event.imageId, 740)} alt={event.title} fill sizes="(max-width: 600px) 90vw, (max-width: 850px) 45vw, 31vw" /><span className="event-date">{new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(new Date(event.startsAt))}</span></div><div className="event-copy"><span className="event-when"><CalendarDays size={13} /> {new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(event.startsAt))}</span><h3>{event.title}</h3><p>{event.summary}</p><span className="event-location"><MapPin size={13} /> {event.location}</span></div></article>)}</div>
        </section>}

        <section className="story-band" id="maison">
          <div className="story-image"><Image src={imageUrl("photo-1509440159596-0249088772ff", 1200)} alt="Pains artisanaux dorés dans la boulangerie" fill sizes="(max-width: 600px) 100vw, 50vw" /></div>
          <div className="story-copy"><span className="eyebrow">Le goût du bon temps</span><h2>Le secret ? Ne pas vouloir aller trop vite.</h2><p>Chez Matin Gourmand, chaque recette commence par de bons ingrédients et un peu de patience. Le reste, c’est le métier, le fournil et le plaisir de vous retrouver.</p><a className="text-link" href="#contact">Rencontrer la maison <ArrowRight size={14} /></a></div>
        </section>

        <section className="section" aria-label="Nos promesses">
          <div className="section-heading"><div><span className="eyebrow">Les bonnes habitudes</span><h2>Du fournil à votre table.</h2></div></div>
          <div className="promise-row">
            <div className="promise"><ChefHat size={21} /><h3>Des gestes soignés</h3><p>Des fournées en petites quantités, préparées avec le même soin chaque jour.</p></div>
            <div className="promise"><Leaf size={21} /><h3>De belles choses, simplement</h3><p>Des ingrédients choisis pour laisser les recettes parler d’elles-mêmes.</p></div>
            <div className="promise"><Truck size={21} /><h3>À votre rythme</h3><p>À emporter au comptoir ou livrer à la maison, selon votre matinée.</p></div>
          </div>
        </section>

        <section className="section" style={{ paddingTop: 0 }} id="contact">
          <div className="final-cta"><div><h2>Une envie gourmande ?</h2><p>Choisissez votre douceur et on s’occupe de la suite.</p></div><a href="#menu" className="button-primary">Commander maintenant <ArrowRight size={15} /></a></div>
        </section>
      </main>

      <footer className="site-footer"><div className="footer-inner"><a className="wordmark" href="#accueil" aria-label="Matin Gourmand, accueil"><BrandLogo /></a><span className="footer-note">Fait avec soin, chaque matin.</span><div className="footer-links"><a href="#menu">Le menu</a><a href="/admin/connexion">Espace boutique</a><span>© 2026 Matin Gourmand</span></div></div></footer>

      {cartOpen && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="cart-title">
          <div className="drawer-head"><div><h2 id="cart-title">Votre panier</h2><p>{cartCount} article{cartCount > 1 ? "s" : ""} sélectionné{cartCount > 1 ? "s" : ""}</p></div><button className="close-button" type="button" aria-label="Fermer le panier" onClick={() => setCartOpen(false)}><X size={17} /></button></div>
          {cart.length === 0 ? <div className="empty-cart"><ShoppingBag size={29} strokeWidth={1.3} /><strong>Le panier est encore vide.</strong><p>Il y a sûrement une douceur qui vous attend dans notre menu.</p><button className="button-primary" type="button" onClick={() => { setCartOpen(false); document.querySelector("#menu")?.scrollIntoView({ behavior: "smooth" }); }}>Voir le menu <ArrowRight size={14} /></button></div> : <>
            <div className="cart-lines">{cart.map(({ product, quantity }) => <div className="cart-line" key={product.id}><div className="cart-thumb"><Image src={imageUrl(product.imageId, 200)} alt="" fill sizes="70px" /></div><div><h3 className="cart-line-name">{product.name}</h3><span className="cart-line-price">{formatPrice(product.priceCfa)}</span><div className="quantity-control"><button type="button" aria-label={`Retirer une unité de ${product.name}`} onClick={() => changeQuantity(product.id, -1)}><Minus size={12} /></button><span>{quantity}</span><button type="button" aria-label={`Ajouter une unité de ${product.name}`} disabled={quantity >= product.quantity} onClick={() => changeQuantity(product.id, 1)}><Plus size={12} /></button></div></div><button className="remove-button" type="button" aria-label={`Supprimer ${product.name}`} onClick={() => changeQuantity(product.id, -quantity)}><X size={15} /></button></div>)}</div>
            <div className="cart-summary"><div className="summary-line"><span>Sous-total</span><span>{formatPrice(cartTotal)}</span></div><div className="summary-line"><span>Livraison</span><span>Calculée à l’étape suivante</span></div><div className="summary-line total"><span>Total provisoire</span><span>{formatPrice(cartTotal)}</span></div><Link className="button-primary" href="/commande" style={{ width: "100%" }}>Passer votre commande <ArrowRight size={15} /></Link><p className="checkout-unavailable">Le paiement et les options de livraison seront affichés à l’étape suivante.</p></div>
          </>}
        </aside>
      </div>}

      {activeProduct && <div className="overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setActiveProduct(null); }}><section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="product-title"><div className="detail-layout"><div className="detail-photo"><Image src={imageUrl(activeProduct.imageId, 850)} alt={activeProduct.name} fill sizes="(max-width: 600px) 100vw, 350px" /></div><div className="detail-copy"><button className="close-button" type="button" aria-label="Fermer la fiche produit" onClick={() => setActiveProduct(null)}><X size={17} /></button><span className="product-category">{activeProduct.category}</span><h2 id="product-title">{activeProduct.name}</h2><p>{activeProduct.description}</p><span className="price">{formatPrice(activeProduct.priceCfa)}</span><span className={`availability${activeProduct.available && activeProduct.quantity > 0 ? "" : " unavailable"}`}>{activeProduct.available && activeProduct.quantity > 0 ? `${activeProduct.quantity} en boutique` : "Indisponible"}</span><button className="button-primary" type="button" disabled={!activeProduct.available || activeProduct.quantity < 1} onClick={() => { addToCart(activeProduct); setActiveProduct(null); }}>Ajouter au panier <Plus size={15} /></button></div></div></section></div>}

      {toast && <div className="toast" role="status"><Check size={15} /> {toast}</div>}
    </>
  );
}
