-- TravelMate Nepal — Database Schema
-- Run this in your PostgreSQL database on Render

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USERS ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name    VARCHAR(100) NOT NULL,
  last_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  phone         VARCHAR(20),
  nationality   VARCHAR(100),
  avatar_url    TEXT,
  role          VARCHAR(20) DEFAULT 'traveler',
  is_verified   BOOLEAN DEFAULT false,
  created_at    TIMESTAMP DEFAULT NOW(),
  updated_at    TIMESTAMP DEFAULT NOW()
);

-- ─── VENDORS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  business_name VARCHAR(255) NOT NULL,
  business_type VARCHAR(50),
  description   TEXT,
  location      VARCHAR(255),
  phone         VARCHAR(20),
  email         VARCHAR(255),
  website       VARCHAR(255),
  logo_url      TEXT,
  is_verified   BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── LISTINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      UUID REFERENCES vendors(id) ON DELETE CASCADE,
  type           VARCHAR(50) NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    TEXT,
  location       VARCHAR(255),
  region         VARCHAR(100),
  price_from     DECIMAL(10,2) NOT NULL,
  price_unit     VARCHAR(20) DEFAULT 'per_person',
  duration_days  INT,
  difficulty     VARCHAR(20),
  max_group_size INT,
  images         TEXT[] DEFAULT '{}',
  amenities      TEXT[] DEFAULT '{}',
  includes       TEXT[] DEFAULT '{}',
  excludes       TEXT[] DEFAULT '{}',
  rating         DECIMAL(3,1) DEFAULT 0,
  review_count   INT DEFAULT 0,
  is_active      BOOLEAN DEFAULT true,
  created_at     TIMESTAMP DEFAULT NOW(),
  updated_at     TIMESTAMP DEFAULT NOW()
);

-- ─── BOOKINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference        VARCHAR(20) UNIQUE NOT NULL,
  user_id          UUID REFERENCES users(id),
  listing_id       UUID REFERENCES listings(id),
  vendor_id        UUID REFERENCES vendors(id),
  start_date       DATE NOT NULL,
  end_date         DATE,
  travelers        INT NOT NULL DEFAULT 1,
  package_type     VARCHAR(20) DEFAULT 'standard',
  addons           JSONB DEFAULT '[]',
  base_price       DECIMAL(10,2) NOT NULL,
  addon_price      DECIMAL(10,2) DEFAULT 0,
  service_fee      DECIMAL(10,2) NOT NULL,
  total_amount     DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(3) DEFAULT 'USD',
  status           VARCHAR(20) DEFAULT 'pending',
  payment_status   VARCHAR(20) DEFAULT 'unpaid',
  special_requests TEXT,
  traveler_details JSONB DEFAULT '{}',
  created_at       TIMESTAMP DEFAULT NOW(),
  updated_at       TIMESTAMP DEFAULT NOW()
);

-- ─── PAYMENTS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id       UUID REFERENCES bookings(id),
  method           VARCHAR(20) NOT NULL,
  amount           DECIMAL(10,2) NOT NULL,
  currency         VARCHAR(3) DEFAULT 'USD',
  status           VARCHAR(20) DEFAULT 'pending',
  gateway_ref      VARCHAR(255),
  gateway_response JSONB,
  created_at       TIMESTAMP DEFAULT NOW()
);

-- ─── REVIEWS ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id    UUID REFERENCES bookings(id),
  user_id       UUID REFERENCES users(id),
  listing_id    UUID REFERENCES listings(id),
  rating        DECIMAL(2,1) NOT NULL CHECK (rating >= 1 AND rating <= 10),
  title         VARCHAR(255),
  body          TEXT,
  guide_rating  DECIMAL(2,1),
  value_rating  DECIMAL(2,1),
  safety_rating DECIMAL(2,1),
  created_at    TIMESTAMP DEFAULT NOW()
);

-- ─── INDEXES ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_listings_type     ON listings(type);
CREATE INDEX IF NOT EXISTS idx_listings_region   ON listings(region);
CREATE INDEX IF NOT EXISTS idx_listings_active   ON listings(is_active);
CREATE INDEX IF NOT EXISTS idx_listings_price    ON listings(price_from);
CREATE INDEX IF NOT EXISTS idx_listings_rating   ON listings(rating DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_user     ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_vendor   ON bookings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_reviews_listing   ON reviews(listing_id);
CREATE INDEX IF NOT EXISTS idx_vendors_user      ON vendors(user_id);

-- ─── SAMPLE DATA ──────────────────────────────────────────────
-- Insert a sample vendor and listings so your API returns real data

SELECT 'Schema created successfully!' AS status;
