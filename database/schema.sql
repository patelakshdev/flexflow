CREATE DATABASE IF NOT EXISTS flexflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE flexflow;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20),
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('member','trainer','admin') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE trainers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  specialization VARCHAR(100),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL UNIQUE,
  trainer_id INT NULL,
  goal ENUM('lose_fat','build_muscle','stay_fit') DEFAULT 'stay_fit',
  declared_level ENUM('beginner','intermediate','advanced') DEFAULT 'beginner',
  diet_pref ENUM('veg','nonveg') DEFAULT 'veg',
  height_cm SMALLINT,
  joined_on DATE NOT NULL DEFAULT (CURDATE()),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
);

CREATE TABLE plans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  months TINYINT NOT NULL,
  price INT NOT NULL
);

CREATE TABLE memberships (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  plan_id INT NOT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status ENUM('pending','active') NOT NULL DEFAULT 'pending',
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id),
  INDEX (member_id, status, end_date)
);

CREATE TABLE payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  membership_id INT NOT NULL,
  amount INT NOT NULL,
  method ENUM('upi','card','netbanking','cash') NULL,
  status ENUM('pending','paid') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paid_on DATETIME NULL,
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
  FOREIGN KEY (membership_id) REFERENCES memberships(id) ON DELETE CASCADE,
  INDEX (status, paid_on)
);

CREATE TABLE attendance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  date DATE NOT NULL,
  checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY one_per_day (member_id, date),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE progress (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  date DATE NOT NULL,
  weight_kg DECIMAL(5,1) NOT NULL,
  note VARCHAR(200),
  UNIQUE KEY one_per_day (member_id, date),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE badges (
  id INT AUTO_INCREMENT PRIMARY KEY,
  member_id INT NOT NULL,
  type ENUM('streak30','streak90') NOT NULL,
  earned_on DATE NOT NULL,
  UNIQUE KEY one_each (member_id, type),
  FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

INSERT INTO plans (name, months, price) VALUES
 ('1 Month',1,1500),('3 Months',3,4000),('6 Months',6,7000),('12 Months',12,12000);
