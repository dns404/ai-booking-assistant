-- ============================================================
-- AI Booking Assistant — Database Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS ai_booking
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_booking;

-- ─── Conversations ──────────────────────────────────────────
-- Tracks per-phone-number conversation state & message history
CREATE TABLE IF NOT EXISTS conversations (
  id            BIGINT       AUTO_INCREMENT PRIMARY KEY,
  phone_number  VARCHAR(20)  NOT NULL,
  messages      JSON         DEFAULT ('[]'),
  state         JSON         DEFAULT ('{}'),
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_phone (phone_number)
) ENGINE=InnoDB;

-- ─── Services ───────────────────────────────────────────────
-- Catalog of bookable services (swap rows to change vertical)
CREATE TABLE IF NOT EXISTS services (
  id                INT          AUTO_INCREMENT PRIMARY KEY,
  name              VARCHAR(100) NOT NULL,
  duration_minutes  INT          NOT NULL,
  price             DECIMAL(8,2) DEFAULT NULL,
  description       VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB;

-- ─── Availability Slots ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS availability_slots (
  id             BIGINT    AUTO_INCREMENT PRIMARY KEY,
  service_id     INT       NOT NULL,
  slot_datetime  DATETIME  NOT NULL,
  is_booked      BOOLEAN   DEFAULT FALSE,
  FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE CASCADE,
  INDEX idx_slot_lookup (service_id, slot_datetime, is_booked)
) ENGINE=InnoDB;

-- ─── Bookings ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id             BIGINT       AUTO_INCREMENT PRIMARY KEY,
  phone_number   VARCHAR(20)  NOT NULL,
  service_id     INT          NOT NULL,
  slot_id        BIGINT       DEFAULT NULL,
  slot_datetime  DATETIME     NOT NULL,
  party_size     INT          DEFAULT 1,
  status         ENUM('pending','confirmed','canceled') DEFAULT 'confirmed',
  reminder_sent  BOOLEAN      DEFAULT FALSE,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (service_id) REFERENCES services(id),
  FOREIGN KEY (slot_id) REFERENCES availability_slots(id),
  INDEX idx_upcoming (status, slot_datetime, reminder_sent)
) ENGINE=InnoDB;
