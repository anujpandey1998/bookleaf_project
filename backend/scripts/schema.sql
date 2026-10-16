CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(150) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  role          ENUM('AUTHOR', 'ADMIN') NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS authors (
  user_id     INT UNSIGNED PRIMARY KEY,
  author_code VARCHAR(20) NOT NULL UNIQUE,
  phone       VARCHAR(30) NULL,
  city        VARCHAR(80) NULL,
  joined_date DATE NULL,
  CONSTRAINT fk_authors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS books (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  book_id                VARCHAR(20) NOT NULL UNIQUE,
  author_user_id         INT UNSIGNED NOT NULL,
  title                  VARCHAR(200) NOT NULL,
  isbn                   VARCHAR(40) NULL,
  genre                  VARCHAR(120) NULL,
  publication_date       DATE NULL,
  status                 VARCHAR(80) NOT NULL,
  is_published           TINYINT(1) NOT NULL DEFAULT 0,
  mrp                    DECIMAL(10,2) NULL,
  author_royalty_per_copy DECIMAL(10,2) NULL,
  total_copies_sold      INT UNSIGNED NOT NULL DEFAULT 0,
  total_royalty_earned   DECIMAL(12,2) NOT NULL DEFAULT 0,
  royalty_paid           DECIMAL(12,2) NOT NULL DEFAULT 0,
  last_royalty_payout_date DATE NULL,
  print_partner          VARCHAR(60) NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_books_author FOREIGN KEY (author_user_id) REFERENCES authors(user_id),
  CONSTRAINT chk_books_royalties CHECK (
    total_royalty_earned >= 0 AND royalty_paid >= 0 AND royalty_paid <= total_royalty_earned
  ),
  INDEX idx_books_author (author_user_id),
  INDEX idx_books_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS book_platforms (
  book_id  INT UNSIGNED NOT NULL,
  platform VARCHAR(100) NOT NULL,
  PRIMARY KEY (book_id, platform),
  CONSTRAINT fk_book_platforms_book FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  reference              VARCHAR(20) NOT NULL UNIQUE,
  author_user_id         INT UNSIGNED NOT NULL,
  book_id                INT UNSIGNED NULL,
  subject                VARCHAR(200) NOT NULL,
  description            TEXT NOT NULL,
  attachment_name        VARCHAR(200) NULL,
  category               ENUM('Royalty & Payments','ISBN & Metadata Issues','Printing & Quality',
                              'Distribution & Availability','Book Status & Production Updates',
                              'General Inquiry') NULL,
  category_source        ENUM('ai','manual') NULL,
  category_rationale     TEXT NULL,
  priority               ENUM('Critical','High','Medium','Low') NULL,
  priority_source        ENUM('ai','manual') NULL,
  priority_rationale     TEXT NULL,
  status                 ENUM('Open','In Progress','Resolved','Closed') NOT NULL DEFAULT 'Open',
  assigned_admin_id      INT UNSIGNED NULL,
  ai_processing_status   ENUM('pending','complete','failed','skipped') NOT NULL DEFAULT 'pending',
  ai_model               VARCHAR(80) NULL,
  ai_processed_at        DATETIME NULL,
  ai_meta                JSON NULL,
  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_tickets_author FOREIGN KEY (author_user_id) REFERENCES authors(user_id),
  CONSTRAINT fk_tickets_book FOREIGN KEY (book_id) REFERENCES books(id),
  CONSTRAINT fk_tickets_admin FOREIGN KEY (assigned_admin_id) REFERENCES users(id),
  INDEX idx_tickets_queue (status, priority, created_at),
  INDEX idx_tickets_category (category),
  INDEX idx_tickets_author (author_user_id, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_reference_sequence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY
) ENGINE=InnoDB;

INSERT IGNORE INTO ticket_reference_sequence (id)
SELECT MAX(CAST(SUBSTRING(reference, 8) AS UNSIGNED))
FROM tickets
WHERE reference REGEXP '^BL-TCK-[0-9]+$'
HAVING MAX(CAST(SUBSTRING(reference, 8) AS UNSIGNED)) > 0;

CREATE TABLE IF NOT EXISTS ticket_responses (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id      INT UNSIGNED NOT NULL,
  sender_user_id INT UNSIGNED NOT NULL,
  body           TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_responses_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_responses_sender FOREIGN KEY (sender_user_id) REFERENCES users(id),
  INDEX idx_ticket_responses_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id      INT UNSIGNED NOT NULL,
  uploaded_by    INT UNSIGNED NOT NULL,
  original_name  VARCHAR(255) NOT NULL,
  storage_name   VARCHAR(50) NOT NULL UNIQUE,
  mime_type      VARCHAR(100) NOT NULL,
  size_bytes     INT UNSIGNED NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_attachments_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ticket_attachments_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id),
  INDEX idx_ticket_attachments_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS internal_notes (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id      INT UNSIGNED NOT NULL,
  admin_user_id  INT UNSIGNED NOT NULL,
  body           TEXT NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_internal_notes_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_internal_notes_admin FOREIGN KEY (admin_user_id) REFERENCES users(id),
  INDEX idx_internal_notes_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_drafts (
  ticket_id   INT UNSIGNED PRIMARY KEY,
  body        TEXT NOT NULL,
  model       VARCHAR(80) NULL,
  generated_at DATETIME NOT NULL,
  CONSTRAINT fk_ticket_drafts_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_events (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id     INT UNSIGNED NOT NULL,
  actor_user_id INT UNSIGNED NULL,
  event         VARCHAR(60) NOT NULL,
  detail        JSON NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_ticket FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  INDEX idx_events_ticket (ticket_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
