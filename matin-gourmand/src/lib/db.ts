import "server-only";

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const globalForDatabase = globalThis as typeof globalThis & {
  matinGourmandDatabase?: Database.Database;
};

const seedProducts = [
  { id: "croissant", categoryId: "cat-viennoiseries", category: "Viennoiseries", name: "Croissant pur beurre", description: "Feuilletage aérien, beurre de baratte et cuisson dorée du matin.", price: 900, image: "photo-1555507036-ab1f4038808a", featured: 1, quantity: 18 },
  { id: "pain-chocolat", categoryId: "cat-viennoiseries", category: "Viennoiseries", name: "Pain au chocolat", description: "Deux barres de chocolat noir dans une pâte délicatement feuilletée.", price: 1200, image: "photo-1530610476181-d83430b64dcd", featured: 1, quantity: 14 },
  { id: "brioche", categoryId: "cat-viennoiseries", category: "Viennoiseries", name: "Brioche torsadée", description: "Une mie filante et un parfum de vanille, à partager ou pas.", price: 1500, image: "photo-1608198093002-ad4e005484df", featured: 0, quantity: 10 },
  { id: "tarte-citron", categoryId: "cat-patisseries", category: "Pâtisseries", name: "Tarte citron meringuée", description: "Crème citron vive, meringue légère et pâte sablée maison.", price: 3500, image: "photo-1519915028121-7d3463d20b13", featured: 1, quantity: 8 },
  { id: "entremets-chocolat", categoryId: "cat-patisseries", category: "Pâtisseries", name: "Entremets chocolat", description: "Mousse grand cru, croustillant praliné et biscuit moelleux.", price: 4500, image: "photo-1578985545062-69928b1d9587", featured: 1, quantity: 6 },
  { id: "paris-brest", categoryId: "cat-patisseries", category: "Pâtisseries", name: "Paris-Brest", description: "Pâte à choux dorée, crème pralinée et éclats de noisette.", price: 3000, image: "photo-1488477181946-6428a0291777", featured: 0, quantity: 5 },
  { id: "tarte-fruits", categoryId: "cat-patisseries", category: "Pâtisseries", name: "Tarte aux fruits", description: "Fruits de saison, crème légère et fond sablé croustillant.", price: 3800, image: "photo-1488477181946-6428a0291777", featured: 0, quantity: 7 },
  { id: "baguette", categoryId: "cat-pains", category: "Pains", name: "Baguette tradition", description: "Croûte chantante, mie alvéolée et fermentation lente.", price: 700, image: "photo-1509440159596-0249088772ff", featured: 0, quantity: 20 },
  { id: "pain-levain", categoryId: "cat-pains", category: "Pains", name: "Pain au levain", description: "Farine de meule, levain naturel et patience de boulanger.", price: 1800, image: "photo-1585478259715-876acc5be8eb", featured: 0, quantity: 9 },
];

function initializeDatabase(database: Database.Database) {
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE BINARY,
      description TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#66806d',
      visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
      display_order INTEGER NOT NULL UNIQUE CHECK (display_order > 0),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      price_cfa INTEGER NOT NULL CHECK (price_cfa >= 0),
      image_id TEXT NOT NULL,
      available INTEGER NOT NULL DEFAULT 1 CHECK (available IN (0, 1)),
      quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (name, category_id)
    );
    CREATE INDEX IF NOT EXISTS products_category_idx ON products(category_id, deleted_at);
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      description TEXT NOT NULL,
      image_id TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
      created_by TEXT REFERENCES admins(id),
      published_at TEXT,
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS events_publication_idx ON events(published, starts_at, ends_at, deleted_at);
    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_at TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      csrf_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS otp_challenges (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(email, phone)
    );
    CREATE TABLE IF NOT EXISTS delivery_zones (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      fee_cfa INTEGER NOT NULL CHECK (fee_cfa >= 0),
      minimum_hours INTEGER NOT NULL CHECK (minimum_hours >= 0),
      maximum_hours INTEGER NOT NULL CHECK (maximum_hours > minimum_hours),
      neighborhoods TEXT NOT NULL DEFAULT '[]',
      availability TEXT NOT NULL DEFAULT '{}',
      kind TEXT NOT NULL CHECK (kind IN ('pickup', 'delivery')),
      instructions TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      deleted_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      tracking_token_hash TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      status TEXT NOT NULL CHECK (status IN ('created', 'paid', 'partially_paid', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
      payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'partial', 'paid', 'failed')),
      payment_attempts INTEGER NOT NULL DEFAULT 0,
      subtotal_cfa INTEGER NOT NULL CHECK (subtotal_cfa >= 0),
      delivery_fee_cfa INTEGER NOT NULL CHECK (delivery_fee_cfa >= 0),
      total_cfa INTEGER NOT NULL CHECK (total_cfa >= 0),
      deposit_cfa INTEGER NOT NULL CHECK (deposit_cfa >= 0),
      remaining_cfa INTEGER NOT NULL CHECK (remaining_cfa >= 0),
      payment_choice TEXT NOT NULL CHECK (payment_choice IN ('deposit', 'full')),
      delivery_method TEXT NOT NULL CHECK (delivery_method IN ('pickup', 'delivery')),
      delivery_zone_id TEXT REFERENCES delivery_zones(id),
      delivery_zone_name TEXT NOT NULL,
      delivery_address TEXT NOT NULL DEFAULT '',
      estimated_at TEXT NOT NULL,
      cancellation_reason TEXT,
      cancelled_by TEXT REFERENCES admins(id),
      cancelled_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id),
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price_cfa INTEGER NOT NULL CHECK (unit_price_cfa >= 0),
      subtotal_cfa INTEGER NOT NULL CHECK (subtotal_cfa >= 0)
    );
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id),
      amount_cfa INTEGER NOT NULL CHECK (amount_cfa > 0),
      type TEXT NOT NULL CHECK (type IN ('deposit', 'full', 'balance', 'refund')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
      provider_reference TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK (type IN ('email', 'whatsapp')),
      event TEXT NOT NULL CHECK (event IN ('new_order', 'order_confirmation', 'status_update')),
      recipient TEXT NOT NULL,
      tracking_token_encrypted TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
      sent_at TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT REFERENCES admins(id),
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity TEXT NOT NULL,
      entity_id TEXT,
      result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
      context TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      key_hash TEXT PRIMARY KEY,
      attempt_count INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS notifications_order_idx ON notifications(order_id, status);
  `);

  const notificationColumns = database.pragma("table_info(notifications)") as Array<{ name: string }>;
  if (!notificationColumns.some((column) => column.name === "tracking_token_encrypted")) {
    database.exec("ALTER TABLE notifications ADD COLUMN tracking_token_encrypted TEXT");
  }

  const insertCategory = database.prepare(
    "INSERT OR IGNORE INTO categories (id, name, description, color, display_order) VALUES (?, ?, ?, ?, ?)",
  );
  const categories = [
    ["cat-viennoiseries", "Viennoiseries", "Le feuilletage du matin, travaillé avec du vrai beurre.", "#c85940", 1],
    ["cat-patisseries", "Pâtisseries", "Des recettes généreuses, préparées avec soin.", "#d09e43", 2],
    ["cat-pains", "Pains", "Des pains de caractère, façonnés et cuits sur place.", "#66806d", 3],
  ] as const;
  for (const category of categories) insertCategory.run(...category);

  const insertProduct = database.prepare(`
    INSERT OR IGNORE INTO products
      (id, category_id, name, description, price_cfa, image_id, available, quantity, featured)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `);
  for (const product of seedProducts) {
    insertProduct.run(
      `product-${product.id}`,
      product.categoryId,
      product.name,
      product.description,
      product.price,
      product.image,
      product.quantity,
      product.featured,
    );
  }

  const insertZone = database.prepare(`
    INSERT OR IGNORE INTO delivery_zones
      (id, name, fee_cfa, minimum_hours, maximum_hours, neighborhoods, kind, instructions)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertZone.run("pickup-boutique", "Retrait en boutique", 0, 1, 24, "[]", "pickup", "Retrait gratuit à la boutique. Les horaires vous seront confirmés avec votre commande.");
  insertZone.run("zone-centre", "Centre-ville", 1000, 2, 6, JSON.stringify(["Plateau", "Treichville", "Marcory"]), "delivery", "Livraison au Centre-ville.");
  insertZone.run("zone-cocody", "Cocody", 1500, 3, 8, JSON.stringify(["Cocody", "Riviera", "Angré"]), "delivery", "Livraison à Cocody et quartiers voisins.");
  insertZone.run("zone-yopougon", "Yopougon", 2000, 4, 10, JSON.stringify(["Yopougon"]), "delivery", "Livraison à Yopougon.");
}

export function getDatabase() {
  if (!globalForDatabase.matinGourmandDatabase) {
    const path = process.env.DATABASE_PATH || join(process.cwd(), "data", "matin-gourmand.db");
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    const database = new Database(path);
    initializeDatabase(database);
    globalForDatabase.matinGourmandDatabase = database;
  }
  return globalForDatabase.matinGourmandDatabase;
}