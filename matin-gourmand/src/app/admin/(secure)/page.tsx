"use client";

import {
  Activity, AlertCircle, ArrowDown, ArrowRight, ArrowUpRight, Bell, Boxes,
  CalendarDays, Check, ChevronDown, CircleDollarSign, Clock3, CookingPot, Download, Filter,
  LayoutDashboard, LogOut, MapPin, Menu, Package, Plus, Search, Settings, ShoppingBag,
  Truck, Users, Wallet, X,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

type Tab = "dashboard" | "orders" | "products" | "categories" | "events" | "deliveries" | "payments" | "notifications" | "customers" | "audit" | "settings";
type AdminSession = { id: string; email: string; role: "admin" | "manager" };
type Order = {
  id: string; orderNumber: string; status: string; paymentStatus: string;
  subtotalCfa: number; deliveryFeeCfa: number; totalCfa: number; depositCfa: number;
  remainingCfa: number; deliveryMethod: string; deliveryZone: string; deliveryAddress: string;
  cancellationReason: string | null; createdAt: string; firstName: string; lastName: string;
  email: string; phone: string; items: string;
};
type Product = { id: string; categoryId: string; category: string; name: string; description: string; priceCfa: number; imageId: string; available: number; quantity: number };
type Category = { id: string; name: string; description: string; color: string; visible: number; displayOrder: number; productCount: number };
type EventRecord = { id: string; title: string; summary: string; description: string; imageId: string; location: string; startsAt: string; endsAt: string; published: number; publishedAt: string | null; createdAt: string };
type EventDraft = { title: string; summary: string; description: string; imageId: string; location: string; startsAt: string; endsAt: string; published: boolean };
type Delivery = { id: string; name: string; kind: "pickup" | "delivery"; feeCfa: number; minimumHours: number; maximumHours: number; neighborhoods: string; availability: string; instructions: string; active: number };
type Notice = { id: string; type: string; event: string; recipient: string; status: string; sentAt: string | null; errorMessage: string | null; retryCount: number; createdAt: string; orderNumber: string };
type Customer = { id: string; firstName: string; lastName: string; email: string; phone: string; createdAt: string; orderCount: number; lifetimeValueCfa: number };
type Audit = { id: string; action: string; entity: string; entityId: string | null; actorRole: string; result: string; context: string; createdAt: string; actorEmail: string | null };
type Stats = { today: { orderCount: number; revenueCfa: number; newOrders: number; preparingOrders: number; readyOrders: number; deliveredOrders: number; cancelledOrders: number }; payments: { receivedCfa: number; pendingCfa: number }; popularProducts: Array<{ name: string; quantity: number; revenueCfa: number }>; dailyRevenue: Array<{ date: string; revenueCfa: number }> };
type ProductDraft = { id?: string; name: string; categoryId: string; priceCfa: number; available: boolean; quantity: number; description: string; imageId: string };
type ApiState = { busy?: string; error?: string; success?: string };

const money = (amount: number) => `${new Intl.NumberFormat("fr-FR").format(amount)} CFA`;
const dateTime = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const statusLabel: Record<string, string> = {
  created: "Nouvelle", paid: "Payée", partially_paid: "Acompte reçu", confirmed: "Confirmée",
  preparing: "En préparation", ready: "Prête", delivered: "Livrée", cancelled: "Annulée",
  pending: "En attente", partial: "Partiel", failed: "Échec", succeeded: "Réussi", sent: "Envoyée",
};
const navItems: Array<{ id: Tab; label: string; icon: typeof LayoutDashboard }> = [
  { id: "dashboard", label: "Vue d’ensemble", icon: LayoutDashboard },
  { id: "orders", label: "Commandes", icon: ShoppingBag },
  { id: "products", label: "Produits", icon: Package },
  { id: "categories", label: "Catégories", icon: Boxes },
  { id: "events", label: "Événements", icon: CalendarDays },
  { id: "deliveries", label: "Livraisons", icon: Truck },
  { id: "payments", label: "Paiements", icon: Wallet },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "customers", label: "Clients", icon: Users },
  { id: "audit", label: "Historique", icon: Activity },
  { id: "settings", label: "Paramètres", icon: Settings },
];

export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [csrfToken, setCsrfToken] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [notifications, setNotifications] = useState<Notice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [auditLogs, setAuditLogs] = useState<Audit[]>([]);
  const [apiState, setApiState] = useState<ApiState>({});
  const [orderQuery, setOrderQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [productQuery, setProductQuery] = useState("");
  const [productDialog, setProductDialog] = useState(false);
  const [eventDialog, setEventDialog] = useState(false);
  const [editingEventId, setEditingEventId] = useState("");
  const [eventDraft, setEventDraft] = useState<EventDraft>({ title: "", summary: "", description: "", imageId: "photo-1517248135467-4c7edcad34c4", location: "Matin Gourmand", startsAt: "", endsAt: "", published: false });
  const [productDraft, setProductDraft] = useState<ProductDraft>({ name: "", categoryId: "", priceCfa: 0, available: true, quantity: 1, description: "", imageId: "photo-1555507036-ab1f4038808a" });
  const [categoryName, setCategoryName] = useState("");
  const [deliveryDraft, setDeliveryDraft] = useState({ name: "", kind: "delivery" as "pickup" | "delivery", feeCfa: 1000, minimumHours: 2, maximumHours: 6, neighborhoods: "", instructions: "" });
  const [cancelOrder, setCancelOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ id: string; title: string; message: string; run: () => Promise<void> } | null>(null);

  const apiFetch = useCallback(async function requestApi<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...(options?.method && options.method !== "GET" && csrfToken ? { "x-csrf-token": csrfToken } : {}),
        ...options?.headers,
      },
      cache: "no-store",
    });
    const result = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(result.error || "Une erreur est survenue. Réessayez.");
    return result;
  }, [csrfToken]);

  async function refreshData() {
    const [statsResult, ordersResult, productsResult, categoriesResult, eventsResult, deliveriesResult, noticesResult, customersResult, auditResult] = await Promise.allSettled([
      apiFetch<{ today: Stats["today"]; payments: Stats["payments"]; popularProducts: Stats["popularProducts"]; dailyRevenue: Stats["dailyRevenue"] }>("/api/admin/stats"),
      apiFetch<{ orders: Order[] }>("/api/admin/orders"),
      apiFetch<{ products: Product[] }>("/api/admin/products"),
      apiFetch<{ categories: Category[] }>("/api/admin/categories"),
      apiFetch<{ events: EventRecord[] }>("/api/admin/events"),
      apiFetch<{ zones: Delivery[] }>("/api/admin/deliveries"),
      apiFetch<{ notifications: Notice[] }>("/api/admin/notifications"),
      apiFetch<{ customers: Customer[] }>("/api/admin/customers"),
      apiFetch<{ logs: Audit[] }>("/api/admin/audit"),
    ]);
    if (statsResult.status === "fulfilled") setStats(statsResult.value);
    if (ordersResult.status === "fulfilled") setOrders(ordersResult.value.orders);
    if (productsResult.status === "fulfilled") setProducts(productsResult.value.products);
    if (categoriesResult.status === "fulfilled") setCategories(categoriesResult.value.categories);
    if (eventsResult.status === "fulfilled") setEvents(eventsResult.value.events);
    if (deliveriesResult.status === "fulfilled") setDeliveries(deliveriesResult.value.zones);
    if (noticesResult.status === "fulfilled") setNotifications(noticesResult.value.notifications);
    if (customersResult.status === "fulfilled") setCustomers(customersResult.value.customers);
    if (auditResult.status === "fulfilled") setAuditLogs(auditResult.value.logs);
  }

  useEffect(() => {
    let active = true;
    void fetch("/api/admin/auth/me", { cache: "no-store" })
      .then((response) => response.json())
      .then((result: { session?: AdminSession; csrfToken?: string }) => {
        if (active && result.session) {
          setSession(result.session);
          setCsrfToken(result.csrfToken || "");
        }
      })
      .catch(() => setApiState({ error: "Impossible de charger la session." }));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    let active = true;
    async function loadDashboard() {
      const [statsResult, ordersResult, productsResult, categoriesResult, eventsResult, deliveriesResult, noticesResult, customersResult, auditResult] = await Promise.allSettled([
        apiFetch<Stats>("/api/admin/stats"),
        apiFetch<{ orders: Order[] }>("/api/admin/orders"),
        apiFetch<{ products: Product[] }>("/api/admin/products"),
        apiFetch<{ categories: Category[] }>("/api/admin/categories"),
        apiFetch<{ events: EventRecord[] }>("/api/admin/events"),
        apiFetch<{ zones: Delivery[] }>("/api/admin/deliveries"),
        apiFetch<{ notifications: Notice[] }>("/api/admin/notifications"),
        apiFetch<{ customers: Customer[] }>("/api/admin/customers"),
        apiFetch<{ logs: Audit[] }>("/api/admin/audit"),
      ]);
      if (!active) return;
      if (statsResult.status === "fulfilled") setStats(statsResult.value);
      if (ordersResult.status === "fulfilled") setOrders(ordersResult.value.orders);
      if (productsResult.status === "fulfilled") setProducts(productsResult.value.products);
      if (categoriesResult.status === "fulfilled") setCategories(categoriesResult.value.categories);
      if (eventsResult.status === "fulfilled") setEvents(eventsResult.value.events);
      if (deliveriesResult.status === "fulfilled") setDeliveries(deliveriesResult.value.zones);
      if (noticesResult.status === "fulfilled") setNotifications(noticesResult.value.notifications);
      if (customersResult.status === "fulfilled") setCustomers(customersResult.value.customers);
      if (auditResult.status === "fulfilled") setAuditLogs(auditResult.value.logs);
    }
    void loadDashboard().catch(() => setApiState({ error: "Certaines données n’ont pas pu être chargées." }));
    return () => { active = false; };
  }, [session, csrfToken, apiFetch]);

  async function perform(action: string, request: () => Promise<unknown>, success: string) {
    setApiState({ busy: action });
    try {
      await request();
      setApiState({ success });
      await refreshData();
    } catch (error) {
      setApiState({ error: error instanceof Error ? error.message : "Une erreur est survenue." });
    }
  }

  async function logout() {
    try { await apiFetch("/api/admin/auth/logout", { method: "POST" }); } finally { window.location.replace("/admin/connexion"); }
  }

  async function updateOrder(order: Order, status: string) {
    if (status === "cancelled") { setCancelOrder(order); setCancelReason(""); return; }
    await perform(`order-${order.id}`, () => apiFetch(`/api/admin/orders/${order.id}`, { method: "PATCH", body: JSON.stringify({ status }) }), "Statut de commande mis à jour.");
  }

  async function saveCancellation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cancelOrder) return;
    const selected = cancelOrder;
    await perform(`order-${selected.id}`, () => apiFetch(`/api/admin/orders/${selected.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "cancelled", cancellationReason: cancelReason }),
    }), "Commande annulée. Le remboursement est en attente de confirmation du prestataire.");
    setCancelOrder(null);
  }

  const filteredOrders = useMemo(() => orders.filter((order) => {
    const query = orderQuery.toLocaleLowerCase("fr");
    return (orderStatusFilter === "all" || order.status === orderStatusFilter)
      && (!query || `${order.orderNumber} ${order.firstName} ${order.lastName} ${order.phone}`.toLocaleLowerCase("fr").includes(query));
  }), [orders, orderQuery, orderStatusFilter]);
  const filteredProducts = products.filter((product) => `${product.name} ${product.category}`.toLocaleLowerCase("fr").includes(productQuery.toLocaleLowerCase("fr")));

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = { ...productDraft, quantity: productDraft.available ? productDraft.quantity : 0 };
    await perform("product-save", () => apiFetch(productDraft.id ? `/api/admin/products/${productDraft.id}` : "/api/admin/products", {
      method: productDraft.id ? "PATCH" : "POST", body: JSON.stringify(payload),
    }), productDraft.id ? "Produit modifié avec succès." : "Produit ajouté avec succès.");
    setProductDialog(false);
  }

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await perform("category-create", () => apiFetch("/api/admin/categories", { method: "POST", body: JSON.stringify({ name: categoryName, description: "", color: "#66806d", visible: true }) }), "Catégorie créée avec succès.");
    setCategoryName("");
  }

  async function reorderCategories(sourceId: string, targetId: string) {
    const reordered = [...categories];
    const sourceIndex = reordered.findIndex((category) => category.id === sourceId);
    const targetIndex = reordered.findIndex((category) => category.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    const [moved] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, moved);
    await perform("category-order", () => apiFetch("/api/admin/categories", {
      method: "PATCH", body: JSON.stringify({ order: reordered.map((category, index) => ({ id: category.id, displayOrder: index + 1 })) }),
    }), "Ordre des catégories mis à jour.");
  }

  async function saveDelivery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const neighborhoods = deliveryDraft.kind === "delivery" ? deliveryDraft.neighborhoods.split(",").map((name) => name.trim()).filter(Boolean) : [];
    await perform("delivery-create", () => apiFetch("/api/admin/deliveries", {
      method: "POST", body: JSON.stringify({ ...deliveryDraft, neighborhoods, availability: {} }),
    }), "Mode de livraison créé.");
    setDeliveryDraft({ name: "", kind: "delivery", feeCfa: 1000, minimumHours: 2, maximumHours: 6, neighborhoods: "", instructions: "" });
  }

  function openNewEvent() {
    setEditingEventId("");
    setEventDraft({ title: "", summary: "", description: "", imageId: "photo-1517248135467-4c7edcad34c4", location: "Matin Gourmand", startsAt: "", endsAt: "", published: false });
    setEventDialog(true);
  }

  function openEditEvent(event: EventRecord) {
    setEditingEventId(event.id);
    setEventDraft({ title: event.title, summary: event.summary, description: event.description, imageId: event.imageId, location: event.location, startsAt: new Date(event.startsAt).toISOString().slice(0, 16), endsAt: new Date(event.endsAt).toISOString().slice(0, 16), published: Boolean(event.published) });
    setEventDialog(true);
  }

  async function saveEvent(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    const payload = { ...eventDraft, startsAt: new Date(eventDraft.startsAt).toISOString(), endsAt: new Date(eventDraft.endsAt).toISOString() };
    await perform("event-save", () => apiFetch(editingEventId ? `/api/admin/events/${editingEventId}` : "/api/admin/events", {
      method: editingEventId ? "PATCH" : "POST", body: JSON.stringify(payload),
    }), editingEventId ? (eventDraft.published ? "Événement publié sur la boutique." : "Événement modifié.") : (eventDraft.published ? "Événement publié sur la boutique." : "Événement enregistré en brouillon."));
    setEventDialog(false);
  }

  async function toggleEvent(event: EventRecord) {
    await perform(`event-${event.id}`, () => apiFetch(`/api/admin/events/${event.id}`, {
      method: "PATCH", body: JSON.stringify({ published: !event.published }),
    }), event.published ? "Événement dépublié." : "Événement publié sur la boutique.");
  }

  async function toggleDelivery(zone: Delivery) {
    await perform(`zone-${zone.id}`, () => apiFetch(`/api/admin/deliveries/${zone.id}`, {
      method: "PATCH", body: JSON.stringify({ active: !zone.active }),
    }), zone.active ? "Mode de livraison désactivé." : "Mode de livraison réactivé.");
  }

  async function retryNotification(notification: Notice) {
    await perform(`notice-${notification.id}`, () => apiFetch(`/api/admin/notifications/${notification.id}/retry`, { method: "POST" }), "Notification renvoyée.");
  }

  function openNewProduct() {
    setProductDraft({ name: "", categoryId: categories[0]?.id || "", priceCfa: 0, available: true, quantity: 1, description: "", imageId: "photo-1555507036-ab1f4038808a" });
    setProductDialog(true);
  }

  function openEditProduct(product: Product) {
    setProductDraft({ id: product.id, name: product.name, categoryId: product.categoryId, priceCfa: product.priceCfa, available: Boolean(product.available), quantity: product.quantity, description: product.description, imageId: product.imageId });
    setProductDialog(true);
  }

  const orderStatuses = ["created", "paid", "partially_paid", "confirmed", "preparing", "ready", "delivered", "cancelled"];
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));

  return (
    <div className="admin-shell">
      <aside className={`admin-sidebar${mobileNavOpen ? " expanded" : ""}`}>
        <Link className="admin-sidebar-brand" href="/" aria-label="Matin Gourmand, boutique"><BrandLogo compact /></Link>
        <div className="sidebar-group-label">GESTION</div>
        <nav className="admin-nav" aria-label="Navigation d’administration">
          {navItems.map(({ id, label, icon: Icon }) => {
            if ((id === "customers" || id === "audit" || id === "settings") && session?.role !== "admin") return null;
            return <button key={id} type="button" className={`admin-nav-item${tab === id ? " active" : ""}`} onClick={() => { setTab(id); setMobileNavOpen(false); setApiState({}); }}><Icon size={17} strokeWidth={1.7} /><span>{label}</span>{id === "orders" && activeOrders.length > 0 && <span className="nav-count">{activeOrders.length}</span>}</button>;
          })}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-status"><span className="live-dot" /> Boutique en ligne</div><div className="admin-profile"><span className="profile-initial">{session?.email.slice(0, 1).toUpperCase() || "M"}</span><span className="profile-copy"><b>{session?.email || "Chargement…"}</b><small>{session?.role === "admin" ? "Administrateur" : "Manager"}</small></span><button className="sidebar-logout" type="button" title="Se déconnecter" aria-label="Se déconnecter" onClick={() => void logout()}><LogOut size={15} /></button></div></div>
      </aside>

      <main className="admin-content">
        <header className="admin-topbar"><button className="admin-mobile-menu" type="button" aria-label="Ouvrir la navigation" onClick={() => setMobileNavOpen(!mobileNavOpen)}><Menu size={19} /></button><div className="admin-breadcrumb"><span>Matin Gourmand</span><ArrowRight size={12} /><b>{navItems.find((item) => item.id === tab)?.label}</b></div><div className="admin-top-actions"><span className="admin-date">{new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</span><button className="admin-bell" type="button" aria-label="Notifications" onClick={() => setTab("notifications")}><Bell size={17} />{notifications.some((notice) => notice.status === "failed") && <i />}</button></div></header>
        <section className="admin-page-heading"><div><span className="admin-kicker">{tab === "dashboard" ? "MARDI · BONJOUR" : "GESTION DE LA BOUTIQUE"}</span><h1>{tab === "dashboard" ? "La boutique ce matin." : navItems.find((item) => item.id === tab)?.label}</h1><p>{tab === "dashboard" ? "Les bons chiffres pour commencer la journée." : descriptions[tab]}</p></div>{tab === "products" && session?.role === "admin" && <button className="button-primary admin-primary-action" type="button" onClick={openNewProduct}><Plus size={15} /> Ajouter un produit</button>}{tab === "events" && session?.role === "admin" && <button className="button-primary admin-primary-action" type="button" onClick={openNewEvent}><Plus size={15} /> Nouvel événement</button>}</section>

        {apiState.error && <div className="admin-message error" role="alert"><AlertCircle size={15} /> {apiState.error}<button type="button" aria-label="Fermer" onClick={() => setApiState({})}><X size={15} /></button></div>}
        {apiState.success && <div className="admin-message success" role="status"><Check size={15} /> {apiState.success}<button type="button" aria-label="Fermer" onClick={() => setApiState({})}><X size={15} /></button></div>}

        {tab === "dashboard" && <DashboardView stats={stats} orders={orders} onGo={setTab} onStatus={updateOrder} />}
        {tab === "orders" && <OrdersView orders={filteredOrders} query={orderQuery} onQuery={setOrderQuery} filter={orderStatusFilter} onFilter={setOrderStatusFilter} statuses={orderStatuses} onStatus={updateOrder} />}
        {tab === "products" && <ProductsView products={filteredProducts} categories={categories} query={productQuery} onQuery={setProductQuery} role={session?.role || "manager"} onEdit={openEditProduct} onDelete={(product) => setConfirmAction({ id: product.id, title: "Supprimer ce produit ?", message: `« ${product.name} » sera masqué du catalogue et conservé dans l’historique.`, run: async () => { await perform(`product-${product.id}`, () => apiFetch(`/api/admin/products/${product.id}`, { method: "DELETE" }), "Produit supprimé du catalogue."); } })} />}
        {tab === "categories" && <CategoriesView categories={categories} role={session?.role || "manager"} value={categoryName} onValue={setCategoryName} onSubmit={saveCategory} onReorder={reorderCategories} onEdit={async (category, patch) => perform(`category-${category.id}`, () => apiFetch(`/api/admin/categories/${category.id}`, { method: "PATCH", body: JSON.stringify(patch) }), "Catégorie modifiée.")} onDelete={(category) => setConfirmAction({ id: category.id, title: "Supprimer cette catégorie ?", message: `« ${category.name} » sera supprimée. ${category.productCount ? `${category.productCount} produit(s) doivent être réaffectés avant cette action.` : "Cette action est irréversible."}`, run: async () => { await perform(`category-${category.id}`, () => apiFetch(`/api/admin/categories/${category.id}`, { method: "DELETE" }), "Catégorie supprimée."); } })} />}
        {tab === "events" && <EventsView events={events} canManage={session?.role === "admin"} onEdit={openEditEvent} onToggle={toggleEvent} onDelete={(event) => setConfirmAction({ id: event.id, title: "Supprimer cet événement ?", message: `« ${event.title} » sera retiré de la boutique et conservé dans l’historique.`, run: async () => { await perform(`event-${event.id}`, () => apiFetch(`/api/admin/events/${event.id}`, { method: "DELETE" }), "Événement supprimé."); } })} />}
        {tab === "deliveries" && <DeliveriesView zones={deliveries} draft={deliveryDraft} onDraft={setDeliveryDraft} onSubmit={saveDelivery} onToggle={toggleDelivery} role={session?.role || "manager"} />}
        {tab === "payments" && <PaymentsView orders={orders} />}
        {tab === "notifications" && <NotificationsView notifications={notifications} busy={apiState.busy} onRetry={retryNotification} />}
        {tab === "customers" && <CustomersView customers={customers} />}
        {tab === "audit" && <AuditView logs={auditLogs} />}
        {tab === "settings" && <SettingsView role={session?.role || "manager"} />}
      </main>

      {productDialog && <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setProductDialog(false); }}><form className="admin-modal" onSubmit={saveProduct} aria-label="Formulaire de produit"><header><div><span className="admin-kicker">CATALOGUE</span><h2>{productDraft.id ? "Modifier le produit" : "Ajouter un produit"}</h2></div><button className="admin-icon-button" type="button" aria-label="Fermer" onClick={() => setProductDialog(false)}><X size={17} /></button></header><div className="admin-form-grid"><label className="full">Nom du produit<input required maxLength={100} value={productDraft.name} onChange={(event) => setProductDraft({ ...productDraft, name: event.target.value })} /></label><label>Catégorie<select required value={productDraft.categoryId} onChange={(event) => setProductDraft({ ...productDraft, categoryId: event.target.value })}>{categories.filter((category) => category.visible).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Prix · CFA<input required type="number" min="0" step="1" value={productDraft.priceCfa} onChange={(event) => setProductDraft({ ...productDraft, priceCfa: Number(event.target.value) })} /></label><label>Image Unsplash ID<input required value={productDraft.imageId} onChange={(event) => setProductDraft({ ...productDraft, imageId: event.target.value })} /></label><label>Description<textarea maxLength={1000} value={productDraft.description} onChange={(event) => setProductDraft({ ...productDraft, description: event.target.value })} /></label><label className="full toggle-line"><input type="checkbox" checked={productDraft.available} onChange={(event) => setProductDraft({ ...productDraft, available: event.target.checked })} /> Disponible dans le catalogue</label>{productDraft.available && <label>Quantité disponible<input required type="number" min="0" max="100000" step="1" value={productDraft.quantity} onChange={(event) => setProductDraft({ ...productDraft, quantity: Number(event.target.value) })} /></label>}</div><footer><button className="button-secondary" type="button" onClick={() => setProductDialog(false)}>Annuler</button><button className="button-primary" type="submit" disabled={Boolean(apiState.busy)}>{apiState.busy ? "Enregistrement…" : "Enregistrer"}</button></footer></form></div>}

      {eventDialog && <EventEditor event={eventDraft} editing={Boolean(editingEventId)} busy={apiState.busy === "event-save"} onChange={setEventDraft} onClose={() => setEventDialog(false)} onSubmit={saveEvent} />}

      {cancelOrder && <div className="admin-modal-backdrop" role="presentation"><form className="admin-modal compact" onSubmit={(event) => void saveCancellation(event)}><header><div><span className="admin-kicker">{cancelOrder.orderNumber}</span><h2>Annuler la commande</h2></div><button className="admin-icon-button" type="button" aria-label="Fermer" onClick={() => setCancelOrder(null)}><X size={17} /></button></header><p>Cette action sera historisée. Un remboursement sera créé en attente si un paiement est confirmé.</p><label>Motif obligatoire<textarea required minLength={10} maxLength={500} value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label>{apiState.error && <p className="form-error">{apiState.error}</p>}<footer><button className="button-secondary" type="button" onClick={() => setCancelOrder(null)}>Conserver</button><button className="danger-button" type="submit" disabled={cancelReason.trim().length < 10}>Confirmer l’annulation</button></footer></form></div>}

      {confirmAction && <div className="admin-modal-backdrop" role="presentation"><section className="admin-modal compact" role="alertdialog" aria-modal="true"><header><div><span className="admin-kicker">CONFIRMATION</span><h2>{confirmAction.title}</h2></div><button className="admin-icon-button" type="button" aria-label="Fermer" onClick={() => setConfirmAction(null)}><X size={17} /></button></header><p>{confirmAction.message}</p>{apiState.error && <p className="form-error">{apiState.error}</p>}<footer><button className="button-secondary" type="button" onClick={() => setConfirmAction(null)}>Annuler</button><button className="danger-button" type="button" onClick={() => { void confirmAction.run().then(() => setConfirmAction(null)); }}>Confirmer la suppression</button></footer></section></div>}
    </div>
  );
}

const descriptions: Record<Tab, string> = {
  dashboard: "Les bons chiffres pour commencer la journée.", orders: "Recherchez, suivez et traitez chaque commande.",
  products: "Les douceurs disponibles dans la boutique.", categories: "Organisez votre menu et sa visibilité.",
  events: "Publiez les rendez-vous et animations visibles par vos clients.",
  deliveries: "Tarifs, zones et délais proposés aux clients.", payments: "Suivi des montants réglés et des soldes restants.",
  notifications: "État des emails et messages de confirmation.", customers: "Les personnes qui passent commande chez vous.",
  audit: "Les actions importantes et leurs auteurs.", settings: "Informations et services de votre boutique.",
};

function DashboardView({ stats, orders, onGo, onStatus }: { stats: Stats | null; orders: Order[]; onGo: (tab: Tab) => void; onStatus: (order: Order, status: string) => Promise<void> }) {
  const latestOrders = orders.slice(0, 5);
  const revenue = stats?.today.revenueCfa || 0;
  const maxRevenue = Math.max(1, ...(stats?.dailyRevenue.map((day) => day.revenueCfa) || [1]));
  return <>
    <section className="metric-grid"><Metric icon={CircleDollarSign} label="Ventes du jour" value={money(revenue)} note="Montants des commandes du jour" tone="green" /><Metric icon={ShoppingBag} label="Commandes du jour" value={String(stats?.today.orderCount || 0)} note={`${stats?.today.newOrders || 0} nouvelles commandes`} tone="gold" /><Metric icon={CookingPot} label="En préparation" value={String(stats?.today.preparingOrders || 0)} note={`${stats?.today.readyOrders || 0} prête(s) à retirer`} tone="clay" /><Metric icon={Wallet} label="Paiements reçus" value={money(stats?.payments.receivedCfa || 0)} note={`${money(stats?.payments.pendingCfa || 0)} en attente`} tone="sage" /></section>
    <section className="admin-dashboard-grid"><div className="admin-panel"><PanelHeader title="Commandes récentes" action="Voir les commandes" onAction={() => onGo("orders")} /><OrdersTable orders={latestOrders} compact onStatus={onStatus} /></div><div className="admin-panel revenue-panel"><PanelHeader title="Chiffre d’affaires" note="7 derniers jours" /><div className="revenue-total">{money(revenue)}<small>aujourd’hui</small></div><div className="mini-chart">{Array.from({ length: 7 }, (_, index) => { const entry = stats?.dailyRevenue[index]; const height = entry ? Math.max(9, Math.round((entry.revenueCfa / maxRevenue) * 100)) : 6; return <div className="chart-column" key={entry?.date || index}><span style={{ height: `${height}%` }} title={entry ? money(entry.revenueCfa) : "Aucune vente"} /><small>{entry ? new Intl.DateTimeFormat("fr-FR", { weekday: "short" }).format(new Date(entry.date)) : "—"}</small></div>; })}</div><div className="chart-legend"><span><i /> Ventes enregistrées</span><button type="button" onClick={() => onGo("payments")}>Voir les paiements <ArrowUpRight size={13} /></button></div></div></section>
    <section className="admin-dashboard-bottom"><div className="admin-panel"><PanelHeader title="À suivre" action="Ouvrir les commandes" onAction={() => onGo("orders")} /><div className="task-list"><Task icon={ShoppingBag} label="Commandes à traiter" count={orders.filter((order) => ["created", "paid", "partially_paid"].includes(order.status)).length} color="green" /><Task icon={CookingPot} label="En préparation" count={orders.filter((order) => order.status === "preparing").length} color="clay" /><Task icon={Truck} label="Prêtes à livrer" count={orders.filter((order) => order.status === "ready").length} color="gold" /><Task icon={AlertCircle} label="Notifications à relancer" count={stats ? 0 : 0} color="red" onClick={() => onGo("notifications")} /></div></div><div className="admin-panel"><PanelHeader title="Les plus demandés" action="Gérer les produits" onAction={() => onGo("products")} />{stats?.popularProducts.length ? <div className="popular-list">{stats.popularProducts.map((item, index) => <div className="popular-row" key={item.name}><span className="popular-rank">0{index + 1}</span><strong>{item.name}</strong><span>{item.quantity} vendus</span><b>{money(item.revenueCfa)}</b></div>)}</div> : <div className="admin-empty small">Vos produits les plus vendus apparaîtront ici.</div>}</div></section>
  </>;
}

function Metric({ icon: Icon, label, value, note, tone }: { icon: typeof LayoutDashboard; label: string; value: string; note: string; tone: string }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={18} /></div><span className="metric-label">{label}</span><strong className="metric-value">{value}</strong><span className="metric-note">{note}</span></article>;
}
function PanelHeader({ title, action, onAction, note }: { title: string; action?: string; onAction?: () => void; note?: string }) { return <header className="panel-header"><div><h2>{title}</h2>{note && <small>{note}</small>}</div>{action && <button type="button" onClick={onAction}>{action}<ArrowRight size={13} /></button>}</header>; }
function Task({ icon: Icon, label, count, color, onClick }: { icon: typeof LayoutDashboard; label: string; count: number; color: string; onClick?: () => void }) { return <button type="button" className="task-row" onClick={onClick}><span className={`task-icon ${color}`}><Icon size={16} /></span><span>{label}</span><b>{count}</b><ArrowRight size={13} /></button>; }

function OrdersView({ orders, query, onQuery, filter, onFilter, statuses, onStatus }: { orders: Order[]; query: string; onQuery: (value: string) => void; filter: string; onFilter: (value: string) => void; statuses: string[]; onStatus: (order: Order, status: string) => Promise<void> }) {
  return <section className="admin-panel table-panel"><div className="table-tools"><label className="admin-search"><Search size={15} /><input placeholder="N° de commande, client, téléphone" value={query} onChange={(event) => onQuery(event.target.value)} /></label><label className="filter-select"><Filter size={14} /><select value={filter} onChange={(event) => onFilter(event.target.value)}><option value="all">Tous les statuts</option>{statuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select><ChevronDown size={14} /></label><button className="export-button" type="button" onClick={() => { const csv = ["Commande,Client,Telephone,Statut,Total,Date", ...orders.map((order) => [order.orderNumber, `${order.firstName} ${order.lastName}`, order.phone, order.status, order.totalCfa, order.createdAt].join(","))].join("\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "commandes-matin-gourmand.csv"; link.click(); URL.revokeObjectURL(url); }}><Download size={14} /> Exporter</button></div><OrdersTable orders={orders} onStatus={onStatus} /></section>;
}

function OrdersTable({ orders, onStatus, compact = false }: { orders: Order[]; onStatus: (order: Order, status: string) => Promise<void>; compact?: boolean }) {
  if (!orders.length) return <div className="admin-empty">Aucune commande pour le moment.</div>;
  return <div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Commande</th><th>Client</th>{!compact && <th>Articles</th>}<th>Statut</th><th>Total</th><th>Reçue</th><th /></tr></thead><tbody>{orders.map((order) => { const items = JSON.parse(order.items) as Array<{ name: string; quantity: number }>; const next = nextOrderStatus(order.status, order.paymentStatus); return <tr key={order.id}><td><b className="order-number">{order.orderNumber}</b></td><td><b>{order.firstName} {order.lastName}</b><small>{order.phone}</small></td>{!compact && <td><span>{items.map((item) => `${item.name} × ${item.quantity}`).join(", ")}</span></td>}<td><StatusBadge value={order.status} /></td><td><b>{money(order.totalCfa)}</b><small>{statusLabel[order.paymentStatus] || order.paymentStatus}</small></td><td><span className="table-date">{dateTime(order.createdAt)}</span></td><td>{next && <label className="status-action"><select aria-label={`Changer le statut ${order.orderNumber}`} value="" onChange={(event) => { if (event.target.value) void onStatus(order, event.target.value); }}><option value="">Action</option>{next.map((status) => <option value={status} key={status}>{status === "cancelled" ? "Annuler…" : `→ ${statusLabel[status]}`}</option>)}</select><ChevronDown size={12} /></label>}</td></tr>; })}</tbody></table></div>;
}

function nextOrderStatus(status: string, paymentStatus: string) {
  if (status === "created") return paymentStatus === "pending" ? ["cancelled"] : ["confirmed", "cancelled"];
  if (["paid", "partially_paid"].includes(status)) return ["confirmed", "cancelled"];
  if (status === "confirmed") return ["preparing", "cancelled"];
  if (status === "preparing") return ["ready", "cancelled"];
  if (status === "ready") return ["delivered", "cancelled"];
  if (status === "delivered" || status === "cancelled") return [];
  return [];
}

function StatusBadge({ value }: { value: string }) { return <span className={`status-badge status-${value}`}>{statusLabel[value] || value}</span>; }

function ProductsView({ products, categories, query, onQuery, role, onEdit, onDelete }: { products: Product[]; categories: Category[]; query: string; onQuery: (value: string) => void; role: string; onEdit: (product: Product) => void; onDelete: (product: Product) => void }) {
  return <section className="admin-panel table-panel"><div className="table-tools"><label className="admin-search"><Search size={15} /><input placeholder="Rechercher un produit" value={query} onChange={(event) => onQuery(event.target.value)} /></label><span className="catalog-count">{products.length} produit(s) · {categories.length} catégorie(s)</span></div><div className="product-admin-grid">{products.map((product) => <article className="product-admin-card" key={product.id}><div className="product-admin-image" style={{ backgroundImage: `url(https://images.unsplash.com/${product.imageId}?auto=format&fit=crop&w=500&q=75)` }}><StatusBadge value={product.available && product.quantity > 0 ? "succeeded" : "failed"} /></div><div className="product-admin-info"><span>{product.category}</span><h3>{product.name}</h3><p>{product.description || "Aucune description"}</p><div><strong>{money(product.priceCfa)}</strong><small>{product.quantity} en stock</small></div></div>{role === "admin" && <footer><button type="button" onClick={() => onEdit(product)}>Modifier</button><button type="button" className="text-danger" onClick={() => onDelete(product)}>Supprimer</button></footer>}</article>)}</div></section>;
}

function CategoriesView({ categories, role, value, onValue, onSubmit, onReorder, onEdit, onDelete }: { categories: Category[]; role: string; value: string; onValue: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onReorder: (source: string, target: string) => Promise<void>; onEdit: (category: Category, patch: Record<string, unknown>) => Promise<void>; onDelete: (category: Category) => void }) {
  const [dragged, setDragged] = useState("");
  return <div className="admin-split-view"><section className="admin-panel"><PanelHeader title="Ordre du menu" note="Les clients voient les catégories visibles" /><div className="category-admin-list">{categories.map((category) => <article className="category-admin-row" key={category.id} draggable={role === "admin"} onDragStart={() => setDragged(category.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged) void onReorder(dragged, category.id); setDragged(""); }}><span className="category-color" style={{ background: category.color }} /><span className="category-admin-copy"><b>{category.name}</b><small>{category.productCount} produit(s) · #{category.displayOrder}</small></span><button className={`visibility-pill${category.visible ? " visible" : ""}`} type="button" disabled={role !== "admin"} onClick={() => void onEdit(category, { visible: !category.visible })}>{category.visible ? "Visible" : "Masquée"}</button>{role === "admin" && <button className="admin-icon-button" type="button" aria-label={`Supprimer ${category.name}`} onClick={() => onDelete(category)}><X size={15} /></button>}</article>)}</div><p className="admin-help"><ArrowDown size={13} /> Faites glisser les catégories pour changer leur ordre.</p></section><section className="admin-panel"><PanelHeader title="Ajouter une catégorie" /><form className="admin-inline-form" onSubmit={onSubmit}><label>Nom de la catégorie<input required maxLength={50} placeholder="Ex. Gâteaux de saison" value={value} onChange={(event) => onValue(event.target.value)} disabled={role !== "admin"} /></label><small>50 caractères maximum · Le nom doit être unique</small><button className="button-primary" type="submit" disabled={role !== "admin" || !value.trim()}><Plus size={15} /> Créer la catégorie</button></form></section></div>;
}

function DeliveriesView({ zones, draft, onDraft, onSubmit, onToggle, role }: { zones: Delivery[]; draft: { name: string; kind: "pickup" | "delivery"; feeCfa: number; minimumHours: number; maximumHours: number; neighborhoods: string; instructions: string }; onDraft: (value: typeof draft) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onToggle: (zone: Delivery) => Promise<void>; role: string }) {
  return <div className="admin-split-view"><section className="admin-panel"><PanelHeader title="Modes et zones actifs" note="Les changements s’appliquent aux nouvelles commandes" /><div className="delivery-list">{zones.map((zone) => { const neighborhoods = JSON.parse(zone.neighborhoods) as string[]; return <article className="delivery-card" key={zone.id}><div className="delivery-card-head"><span className={`delivery-symbol ${zone.kind}`}>{zone.kind === "pickup" ? <ShoppingBag size={17} /> : <Truck size={17} />}</span><span><b>{zone.name}</b><small>{zone.kind === "pickup" ? "Retrait en boutique" : neighborhoods.join(" · ") || "Livraison"}</small></span><span className={`delivery-active${zone.active ? " on" : ""}`}>{zone.active ? "Actif" : "Désactivé"}</span></div><div className="delivery-facts"><span><b>{zone.feeCfa === 0 ? "Gratuit" : money(zone.feeCfa)}</b><small>Tarif</small></span><span><b>{zone.minimumHours}–{zone.maximumHours} h</b><small>Délai estimé</small></span><span><b>{JSON.parse(zone.availability || "{}") && Object.keys(JSON.parse(zone.availability || "{}")).length ? "Horaires définis" : "Selon disponibilité"}</b><small>Disponibilité</small></span></div><p>{zone.instructions}</p><button className="text-action" type="button" disabled={role !== "admin"} onClick={() => void onToggle(zone)}>{zone.active ? "Désactiver" : "Réactiver"} <ArrowRight size={13} /></button></article>; })}</div></section><section className="admin-panel"><PanelHeader title="Ajouter une zone" /><form className="admin-inline-form" onSubmit={onSubmit}><label>Nom<input required maxLength={80} value={draft.name} onChange={(event) => onDraft({ ...draft, name: event.target.value })} disabled={role !== "admin"} /></label><label>Type<select value={draft.kind} onChange={(event) => onDraft({ ...draft, kind: event.target.value as "pickup" | "delivery" })} disabled={role !== "admin"}><option value="delivery">Livraison à domicile</option><option value="pickup">Retrait en boutique</option></select></label><div className="admin-field-pair"><label>Tarif · CFA<input type="number" min="0" value={draft.feeCfa} onChange={(event) => onDraft({ ...draft, feeCfa: Number(event.target.value) })} disabled={role !== "admin"} /></label><label>Délai min. · h<input type="number" min="0" value={draft.minimumHours} onChange={(event) => onDraft({ ...draft, minimumHours: Number(event.target.value) })} disabled={role !== "admin"} /></label></div><label>Délai max. · heures<input type="number" min="1" value={draft.maximumHours} onChange={(event) => onDraft({ ...draft, maximumHours: Number(event.target.value) })} disabled={role !== "admin"} /></label>{draft.kind === "delivery" && <label>Quartiers · séparés par des virgules<input value={draft.neighborhoods} onChange={(event) => onDraft({ ...draft, neighborhoods: event.target.value })} placeholder="Plateau, Cocody" disabled={role !== "admin"} /></label>}<label>Instructions<textarea maxLength={300} value={draft.instructions} onChange={(event) => onDraft({ ...draft, instructions: event.target.value })} disabled={role !== "admin"} /></label><button className="button-primary" type="submit" disabled={role !== "admin"}><Plus size={15} /> Enregistrer la zone</button><small>Le délai minimum doit être inférieur au délai maximum.</small></form></section></div>;
}

function PaymentsView({ orders }: { orders: Order[] }) {
  const paid = orders.filter((order) => ["paid", "partially_paid", "confirmed", "preparing", "ready", "delivered"].includes(order.status));
  const pending = orders.filter((order) => order.paymentStatus === "pending");
  return <><section className="metric-grid"><Metric icon={Wallet} label="Paiements reçus" value={money(orders.reduce((sum, order) => sum + (order.paymentStatus === "paid" ? order.totalCfa : order.paymentStatus === "partial" ? order.depositCfa : 0), 0))} note={`${paid.length} commande(s) avec paiement`} tone="green" /><Metric icon={Clock3} label="En attente" value={money(pending.reduce((sum, order) => sum + order.depositCfa, 0))} note={`${pending.length} paiement(s) à confirmer`} tone="gold" /><Metric icon={CircleDollarSign} label="Soldes restants" value={money(orders.reduce((sum, order) => sum + order.remainingCfa, 0))} note="Acomptes encaissés à compléter" tone="clay" /></section><section className="admin-panel table-panel"><PanelHeader title="Journal des paiements" note="Aucun statut ne peut être modifié depuis l’interface client" /><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Commande</th><th>Client</th><th>Statut paiement</th><th>Montant commande</th><th>Versé</th><th>Solde</th><th>Mode</th></tr></thead><tbody>{orders.map((order) => <tr key={order.id}><td><b className="order-number">{order.orderNumber}</b></td><td>{order.firstName} {order.lastName}<small>{order.phone}</small></td><td><StatusBadge value={order.paymentStatus} /></td><td>{money(order.totalCfa)}</td><td><b>{money(order.paymentStatus === "paid" ? order.totalCfa : order.paymentStatus === "partial" ? order.depositCfa : 0)}</b></td><td>{money(order.remainingCfa)}</td><td>Mobile Money</td></tr>)}</tbody></table>{!orders.length && <div className="admin-empty">Aucun paiement enregistré.</div>}</div></section></>;
}

function NotificationsView({ notifications, busy, onRetry }: { notifications: Notice[]; busy?: string; onRetry: (notification: Notice) => Promise<void> }) {
  return <section className="admin-panel table-panel"><PanelHeader title="Journal des notifications" note="Trois tentatives maximum · La commande reste active en cas d’échec" /><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Commande</th><th>Canal</th><th>Destinataire</th><th>Type</th><th>Statut</th><th>Tentatives</th><th /></tr></thead><tbody>{notifications.map((notification) => <tr key={notification.id}><td><b className="order-number">{notification.orderNumber}</b></td><td>{notification.type === "email" ? "Email" : "WhatsApp"}</td><td>{notification.recipient}</td><td>{notification.event === "new_order" ? "Nouvelle commande" : notification.event === "order_confirmation" ? "Confirmation client" : "Mise à jour"}</td><td><StatusBadge value={notification.status} />{notification.errorMessage && <small className="notification-error">{notification.errorMessage}</small>}</td><td>{notification.retryCount} / 3</td><td>{notification.status === "failed" && notification.retryCount < 3 && <button className="text-action" type="button" disabled={busy === `notice-${notification.id}`} onClick={() => void onRetry(notification)}>Réessayer <ArrowRight size={13} /></button>}</td></tr>)}</tbody></table>{!notifications.length && <div className="admin-empty">Aucune notification pour le moment.</div>}</div></section>;
}

function CustomersView({ customers }: { customers: Customer[] }) {
  return <section className="admin-panel table-panel"><div className="table-tools"><div className="admin-search-static"><Users size={15} /> {customers.length} clients enregistrés</div></div><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th>Client</th><th>Email</th><th>Téléphone</th><th>Commandes</th><th>Valeur vie client</th><th>Depuis</th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><b>{customer.firstName} {customer.lastName}</b></td><td>{customer.email}</td><td>{customer.phone}</td><td>{customer.orderCount}</td><td><b>{money(customer.lifetimeValueCfa)}</b></td><td>{dateTime(customer.createdAt)}</td></tr>)}</tbody></table>{!customers.length && <div className="admin-empty">Les clients apparaîtront à leur première commande.</div>}</div></section>;
}

function AuditView({ logs }: { logs: Audit[] }) {
  return <section className="admin-panel table-panel"><PanelHeader title="Journal d’audit" note="Les mots de passe, OTP, PIN et secrets ne sont jamais journalisés" /><div className="audit-list">{logs.map((log) => <article className="audit-row" key={log.id}><span className={`audit-result ${log.result}`}><Activity size={15} /></span><span className="audit-copy"><b>{log.action.replaceAll("_", " ")}</b><small>{log.entity}{log.entityId ? ` · ${log.entityId.slice(0, 14)}` : ""} · {log.actorEmail || log.actorRole}</small></span><span className="audit-time">{dateTime(log.createdAt)}</span></article>)}{!logs.length && <div className="admin-empty">Les actions sensibles apparaîtront ici.</div>}</div></section>;
}

function SettingsView({ role }: { role: string }) {
  const [services, setServices] = useState<{ email: boolean; whatsapp: boolean; payment: boolean; https: boolean } | null>(null);
  useEffect(() => { void fetch("/api/admin/settings", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((data) => setServices(data?.services || null)); }, []);
  return <div className="admin-split-view"><section className="admin-panel"><PanelHeader title="Sécurité de la boutique" /><div className="settings-list"><Setting name="Authentification administrateur" value="Email + mot de passe + OTP" ok /><Setting name="Mot de passe" value="Hashé avec bcrypt · minimum 8 caractères" ok /><Setting name="OTP" value="Unique · expire en 2 minutes · hashé" ok /><Setting name="Session" value="Cookie HttpOnly · SameSite strict · 8 heures" ok /><Setting name="Stockage de session" value="Token en base · invalidation au logout" ok /><Setting name="Contrôle d’accès" value="Rôles et permissions vérifiés côté serveur" ok /><Setting name="Sauvegardes" value="À configurer sur l’hébergement de production" /></div></section><section className="admin-panel"><PanelHeader title="Services externes" note="Les clés restent côté serveur" /><div className="settings-list"><Setting name="Email transactionnel" value={services ? services.email ? "SMTP configuré" : "En attente de configuration" : "Vérification…"} ok={services?.email} /><Setting name="WhatsApp Business" value={services ? services.whatsapp ? "API configurée" : "En attente de configuration" : "Vérification…"} ok={services?.whatsapp} /><Setting name="Paiement Mobile Money" value={services ? services.payment ? "API configurée" : "En attente de configuration" : "Vérification…"} ok={services?.payment} /><Setting name="Connexion HTTPS" value={services ? services.https ? "HTTPS actif" : "HTTP local uniquement" : "Vérification…"} ok={services?.https} /></div><p className="admin-setting-note">Les paramètres qui affectent les prix, la sécurité et les notifications ne sont pas modifiables par le navigateur.</p>{role !== "admin" && <p className="admin-setting-note">Certaines informations et actions sont réservées à l’administrateur.</p>}</section></div>;
}

function Setting({ name, value, ok = true }: { name: string; value: string; ok?: boolean }) { return <div className="setting-row"><span><b>{name}</b><small>{value}</small></span><span className={`setting-indicator${ok ? " ok" : ""}`} aria-label={ok ? "Configuré" : "À configurer"} /></div>; }

function EventsView({ events, canManage, onEdit, onToggle, onDelete }: {
  events: EventRecord[];
  canManage: boolean;
  onEdit: (event: EventRecord) => void;
  onToggle: (event: EventRecord) => Promise<void>;
  onDelete: (event: EventRecord) => void;
}) {
  return <section className="admin-panel events-admin-panel"><PanelHeader title="Événements de la boutique" note="Seuls les événements publiés et non expirés apparaissent sur le site public." />{events.length === 0 ? <div className="admin-empty">Aucun événement pour le moment. Créez un brouillon ou publiez votre premier rendez-vous.</div> : <div className="events-admin-grid">{events.map((event) => {
    const ended = new Date(event.endsAt) < new Date();
    return <article className="event-admin-card" key={event.id}><div className="event-admin-photo" style={{ backgroundImage: `url(https://images.unsplash.com/${event.imageId}?auto=format&fit=crop&w=720&q=75)` }}><StatusBadge value={ended ? "cancelled" : event.published ? "published" : "pending"} /></div><div className="event-admin-copy"><div className="event-admin-meta"><CalendarDays size={13} /> {dateTime(event.startsAt)}{ended && <span>Terminé</span>}</div><h3>{event.title}</h3><p>{event.summary}</p><small><MapPin size={12} /> {event.location}</small><div className="event-admin-actions">{canManage && <><button className="text-action" type="button" onClick={() => onEdit(event)}>Modifier</button><button className="text-action" type="button" onClick={() => void onToggle(event)}>{event.published ? "Dépublier" : "Publier"}</button><button className="text-action text-danger" type="button" onClick={() => onDelete(event)}>Supprimer</button></>}</div></div></article>;
  })}</div>}</section>;
}

function EventEditor({ event, editing, busy, onChange, onClose, onSubmit }: {
  event: EventDraft;
  editing: boolean;
  busy: boolean;
  onChange: (event: EventDraft) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return <div className="admin-modal-backdrop" role="presentation" onMouseDown={(mouseEvent) => { if (mouseEvent.target === mouseEvent.currentTarget) onClose(); }}><form className="admin-modal event-editor" onSubmit={onSubmit}><header><div><span className="admin-kicker">RENDEZ-VOUS CLIENT</span><h2>{editing ? "Modifier l’événement" : "Nouvel événement"}</h2></div><button className="admin-icon-button" type="button" aria-label="Fermer" onClick={onClose}><X size={17} /></button></header><div className="admin-form-grid"><label className="full">Titre<input required minLength={3} maxLength={100} value={event.title} onChange={(change) => onChange({ ...event, title: change.target.value })} placeholder="Ex. Brunch gourmand du dimanche" /></label><label className="full">Résumé affiché sur le site<input required minLength={5} maxLength={180} value={event.summary} onChange={(change) => onChange({ ...event, summary: change.target.value })} placeholder="Une phrase pour donner envie de venir" /></label><label className="full">Description<textarea required minLength={5} maxLength={2000} value={event.description} onChange={(change) => onChange({ ...event, description: change.target.value })} /></label><label>Image Unsplash ID<input required pattern="photo-[A-Za-z0-9-]+" title="Utilisez un identifiant photo Unsplash, ex. photo-123456" value={event.imageId} onChange={(change) => onChange({ ...event, imageId: change.target.value })} /></label><label>Lieu<input maxLength={120} value={event.location} onChange={(change) => onChange({ ...event, location: change.target.value })} /></label><label>Date et heure de début<input required type="datetime-local" value={event.startsAt} onChange={(change) => onChange({ ...event, startsAt: change.target.value })} /></label><label>Date et heure de fin<input required type="datetime-local" value={event.endsAt} onChange={(change) => onChange({ ...event, endsAt: change.target.value })} /></label><label className="full toggle-line"><input type="checkbox" checked={event.published} onChange={(change) => onChange({ ...event, published: change.target.checked })} /> Publier immédiatement sur le site</label><small className="full event-editor-note">Les visiteurs verront l’événement jusqu’à sa date de fin. Les dates passées ne sont pas proposées dans les événements à venir.</small></div><footer><button className="button-secondary" type="button" onClick={onClose}>Annuler</button><button className="button-primary" type="submit" disabled={busy}>{busy ? "Enregistrement…" : event.published ? "Enregistrer et publier" : "Enregistrer en brouillon"}</button></footer></form></div>;
}