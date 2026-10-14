-- BookLeaf Publishing schema (MySQL 8)
-- Applied automatically by scripts/migrate.js and the seed script.

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  author_id     VARCHAR(20) NULL UNIQUE,          -- e.g. AUTH001 (null for admins)
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  phone         VARCHAR(30) NULL,
  city          VARCHAR(80) NULL,
  role          ENUM('author','admin') NOT NULL DEFAULT 'author',
  password_hash VARCHAR(100) NOT NULL,
  joined_date   DATE NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS books (
  id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  book_id               VARCHAR(20) NOT NULL UNIQUE,   -- e.g. BK001
  author_user_id        INT UNSIGNED NOT NULL,
  title                 VARCHAR(200) NOT NULL,
  isbn                  VARCHAR(40) NULL,
  genre                 VARCHAR(120) NULL,
  publication_date      DATE NULL,
  status                VARCHAR(60) NOT NULL,          -- 'Published & Live' or 'In Production - ...'
  is_published          TINYINT(1) NOT NULL DEFAULT 0,
  mrp                   DECIMAL(10,2) NULL,
  author_royalty_per_copy DECIMAL(10,2) NULL,
  total_copies_sold     INT NOT NULL DEFAULT 0,
  total_royalty_earned  DECIMAL(12,2) NOT NULL DEFAULT 0,
  royalty_paid          DECIMAL(12,2) NOT NULL DEFAULT 0,
  royalty_pending       DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_royalty_payout_date DATE NULL,
  print_partner         VARCHAR(60) NULL,
  available_on          JSON NULL,
  created_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_books_author FOREIGN KEY (author_user_id) REFERENCES users(id),
  INDEX idx_books_author (author_user_id),
  INDEX idx_books_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tickets (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference      VARCHAR(20) NOT NULL UNIQUE,          -- human-friendly BL-TCK-000001
  author_user_id INT UNSIGNED NOT NULL,
  book_id        INT UNSIGNED NULL,                    -- null = General / Account Level
  subject        VARCHAR(200) NOT NULL,
  description    TEXT NOT NULL,
  attachment_name VARCHAR(200) NULL,                   -- UI-only metadata
  category       ENUM('Royalty & Payments','ISBN & Metadata Issues','Printing & Quality',
                      'Distribution & Availability','Book Status & Production Updates','General Inquiry')
                 NULL,
  category_source     ENUM('ai','manual') NULL,
  category_rationale  TEXT NULL,
  priority       ENUM('Critical','High','Medium','Low') NULL,
  priority_source     ENUM('ai','manual') NULL,
  priority_rationale  TEXT NULL,
  status         ENUM('Open','In Progress','Resolved','Closed') NOT NULL DEFAULT 'Open',
  assigned_admin_id INT UNSIGNED NULL,
  ai_draft       TEXT NULL,
  ai_draft_generated_at DATETIME NULL,
  ai_processing_status ENUM('pending','complete','failed','skipped') NOT NULL DEFAULT 'pending',
  ai_model       VARCHAR(80) NULL,
  ai_processed_at DATETIME NULL,
  ai_meta        JSON NULL,                            -- token usage etc., never secrets
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_author FOREIGN KEY (author_user_id) REFERENCES users(id),
  CONSTRAINT fk_tickets_book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT fk_tickets_admin FOREIGN KEY (assigned_admin_id) REFERENCES users(id),
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_priority (priority),
  INDEX idx_tickets_author (author_user_id),
  INDEX idx_tickets_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id    INT UNSIGNED NOT NULL,
  sender_user_id INT UNSIGNED NOT NULL,
  kind         ENUM('public_reply','internal_note') NOT NULL DEFAULT 'public_reply',
  body         TEXT NOT NULL,
  visible_to_author TINYINT(1) NOT NULL DEFAULT 1,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_sender FOREIGN KEY (sender_user_id) REFERENCES users(id),
  INDEX idx_messages_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ticket_events (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id  INT UNSIGNED NOT NULL,
  actor_user_id INT UNSIGNED NULL,                     -- null = system/AI
  event      VARCHAR(60) NOT NULL,                     -- created|status_changed|assigned|category_overridden|...
  detail     JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  INDEX idx_events_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
