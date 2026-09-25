-- FlexFlow PostgreSQL Database Schema
-- Ready for Render PostgreSQL, Neon, Supabase, AWS RDS, etc.

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('member', 'trainer', 'admin')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Trainers Table
CREATE TABLE IF NOT EXISTS trainers (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  specialization VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Members Table
CREATE TABLE IF NOT EXISTS members (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  trainer_id INT NULL,
  goal VARCHAR(30) DEFAULT 'stay_fit' CHECK (goal IN ('lose_fat', 'build_muscle', 'stay_fit')),
  declared_level VARCHAR(30) DEFAULT 'beginner' CHECK (declared_level IN ('beginner', 'intermediate', 'advanced')),
  diet_pref VARCHAR(20) DEFAULT 'veg' CHECK (diet_pref IN ('veg', 'nonveg')),
  height_cm SMALLINT,
  joined_on DATE NOT NULL DEFAULT CURRENT_DATE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

-- Plans Table
CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  months SMALLINT NOT NULL,
  price INT NOT NULL
);

-- Memberships Table
CREATE TABLE IF NOT EXISTS memberships (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_lookup ON memberships(member_id, status, end_date);

-- Payments Table
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL,
  membership_id INT NOT NULL,
  amount INT NOT NULL,
  method VARCHAR(20) NULL CHECK (method IS NULL OR method IN ('upi', 'card', 'netbanking', 'cash')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_on TIMESTAMP NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payments_status_paid ON payments(status, paid_on);

-- Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL,
  date DATE NOT NULL,
  checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_attendance_one_per_day UNIQUE (member_id, date),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Progress Table
CREATE TABLE IF NOT EXISTS progress (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL,
  date DATE NOT NULL,
  weight_kg DECIMAL(5,1) NOT NULL,
  note VARCHAR(200),
  CONSTRAINT unique_progress_one_per_day UNIQUE (member_id, date),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Badges Table
CREATE TABLE IF NOT EXISTS badges (
  id SERIAL PRIMARY KEY,
  member_id INT NOT NULL,
  type VARCHAR(30) NOT NULL CHECK (type IN ('streak30', 'streak90')),
  earned_on DATE NOT NULL,
  CONSTRAINT unique_badges_one_each UNIQUE (member_id, type),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

-- Default Plans Seed
INSERT INTO plans (name, months, price)
SELECT '1 Month', 1, 1500 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE months = 1);

INSERT INTO plans (name, months, price)
SELECT '3 Months', 3, 4000 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE months = 3);

INSERT INTO plans (name, months, price)
SELECT '6 Months', 6, 7000 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE months = 6);

INSERT INTO plans (name, months, price)
SELECT '12 Months', 12, 12000 WHERE NOT EXISTS (SELECT 1 FROM plans WHERE months = 12);
