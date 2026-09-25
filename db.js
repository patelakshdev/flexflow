require('dotenv').config();
const bcrypt = require('bcryptjs');

const rawDbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.MYSQL_URL || '';
const isPg = Boolean(
  rawDbUrl.startsWith('postgres://') ||
  rawDbUrl.startsWith('postgresql://') ||
  process.env.PGHOST ||
  process.env.DB_TYPE === 'postgres' ||
  (!rawDbUrl && !process.env.DB_HOST && process.env.NODE_ENV === 'production')
);

let pool;
let pgTypes;

if (isPg) {
  const { Pool, types } = require('pg');
  pgTypes = types;

  // Type parsers for consistency with MySQL
  // BIGINT (20) -> integer Number
  types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10)));
  // NUMERIC / DECIMAL (1700) -> float Number
  types.setTypeParser(1700, val => (val === null ? null : parseFloat(val)));
  // DATE (1082) -> 'YYYY-MM-DD' string (matches dateStrings: true)
  types.setTypeParser(1082, val => val);

  const databaseUrl = rawDbUrl || 'postgresql://localhost:5432/flexflow';
  const isRemote =
    /render\.com|supabase\.co|neon\.tech|vercel-storage\.com|aws\.com|amazonaws\.com/i.test(databaseUrl) ||
    process.env.NODE_ENV === 'production' ||
    process.env.DB_SSL === 'true' ||
    process.env.DB_SSL === '1';

  pool = new Pool({
    connectionString: databaseUrl,
    ssl: isRemote ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle PostgreSQL client:', err.message);
  });
} else {
  const mysql = require('mysql2/promise');
  const poolConfig = rawDbUrl || {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'flexflow',
    port: Number(process.env.DB_PORT) || 3306,
    waitForConnections: true,
    connectionLimit: 10,
    dateStrings: true,
    ssl: (process.env.DB_SSL === 'true' || process.env.DB_SSL === '1') ? { rejectUnauthorized: false } : undefined,
  };
  pool = mysql.createPool(poolConfig);
}

function transformToPg(sql) {
  let s = sql;

  // CURDATE() -> CURRENT_DATE
  s = s.replace(/\bCURDATE\(\)/gi, 'CURRENT_DATE');

  // DATE_SUB(DATE_FORMAT(CURRENT_DATE,'%Y-%m-01'),INTERVAL 5 MONTH)
  s = s.replace(
    /DATE_SUB\(\s*DATE_FORMAT\(CURRENT_DATE\s*,\s*['"]%Y-%m-01['"]\)\s*,\s*INTERVAL\s+(\d+)\s+MONTH\)/gi,
    `(DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '$1 month')`
  );

  // DATE_SUB(CURRENT_DATE, INTERVAL X DAY)
  s = s.replace(
    /DATE_SUB\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\)/gi,
    `(CURRENT_DATE - INTERVAL '$1 day')`
  );

  // DATE_ADD(CURRENT_DATE, INTERVAL X DAY)
  s = s.replace(
    /DATE_ADD\(\s*CURRENT_DATE\s*,\s*INTERVAL\s+(\d+)\s+DAY\)/gi,
    `(CURRENT_DATE + INTERVAL '$1 day')`
  );

  // DATE_FORMAT(CURRENT_DATE,'%Y-%m-01')
  s = s.replace(
    /DATE_FORMAT\(\s*CURRENT_DATE\s*,\s*['"]%Y-%m-01['"]\)/gi,
    `DATE_TRUNC('month', CURRENT_DATE)`
  );

  // DATE_FORMAT(col, '%Y-%m') -> TO_CHAR(col, 'YYYY-MM')
  s = s.replace(
    /DATE_FORMAT\(\s*([a-zA-Z0-9_.]+)\s*,\s*['"]%Y-%m['"]\)/gi,
    `TO_CHAR($1, 'YYYY-MM')`
  );

  // INSERT IGNORE INTO attendance
  if (/INSERT\s+IGNORE\s+INTO\s+attendance/i.test(s)) {
    s = s.replace(/INSERT\s+IGNORE\s+INTO\s+attendance/i, 'INSERT INTO attendance');
    s += ' ON CONFLICT (member_id, date) DO NOTHING';
  } else if (/INSERT\s+IGNORE\s+INTO\s+badges/i.test(s)) {
    s = s.replace(/INSERT\s+IGNORE\s+INTO\s+badges/i, 'INSERT INTO badges');
    s += ' ON CONFLICT (member_id, type) DO NOTHING';
  } else if (/INSERT\s+IGNORE\s+INTO\s+plans/i.test(s)) {
    s = s.replace(/INSERT\s+IGNORE\s+INTO\s+plans/i, 'INSERT INTO plans');
    s += ' ON CONFLICT DO NOTHING';
  }

  // ON DUPLICATE KEY UPDATE in progress
  if (/ON\s+DUPLICATE\s+KEY\s+UPDATE/i.test(s) && /progress/i.test(s)) {
    s = s.replace(
      /ON\s+DUPLICATE\s+KEY\s+UPDATE\s+weight_kg\s*=\s*VALUES\(weight_kg\)\s*,\s*note\s*=\s*VALUES\(note\)/i,
      'ON CONFLICT (member_id, date) DO UPDATE SET weight_kg = EXCLUDED.weight_kg, note = EXCLUDED.note'
    );
  }

  // Double quoted string literals -> single quotes
  s = s.replace(/"(member|trainer|admin|pending|active|paid|Admin)"/g, "'$1'");

  // Quote revMonth and revTotal so PostgreSQL preserves case
  s = s.replace(/\brevMonth\b/g, '"revMonth"');
  s = s.replace(/\brevTotal\b/g, '"revTotal"');

  // Auto append RETURNING id for INSERT queries that need the id
  if (
    /^\s*INSERT\s+INTO\s+(users|trainers|members|memberships|payments)\b/i.test(s) &&
    !/RETURNING/i.test(s)
  ) {
    s += ' RETURNING id';
  }

  // Replace ? placeholders with $1, $2, ...
  let paramIndex = 0;
  s = s.replace(/\?/g, () => `$${++paramIndex}`);

  return s;
}

async function q(sql, params = []) {
  if (isPg) {
    const pgSql = transformToPg(sql);
    const result = await pool.query(pgSql, params);
    const rows = result.rows || [];
    rows.insertId = result.rows?.[0]?.id || null;
    rows.affectedRows = result.rowCount || 0;
    rows.rowCount = result.rowCount || 0;
    return rows;
  }

  const [r] = await pool.query(sql, params);
  return r;
}

async function getConnection() {
  if (isPg) {
    const client = await pool.connect();
    return {
      beginTransaction: () => client.query('BEGIN'),
      commit: () => client.query('COMMIT'),
      rollback: () => client.query('ROLLBACK'),
      release: () => client.release(),
      query: async (sql, params = []) => {
        const pgSql = transformToPg(sql);
        const result = await client.query(pgSql, params);
        const rows = result.rows || [];
        rows.insertId = result.rows?.[0]?.id || null;
        rows.affectedRows = result.rowCount || 0;
        rows.rowCount = result.rowCount || 0;
        return [rows];
      },
    };
  }

  return await pool.getConnection();
}

let isInitialized = false;
let initPromise = null;

async function ensureDbInit() {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = (async () => {
      try {
    if (isPg) {
      // 1. Users Table
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        phone VARCHAR(20),
        password_hash VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL CHECK (role IN ('member', 'trainer', 'admin')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);

      // 2. Trainers Table
      await pool.query(`CREATE TABLE IF NOT EXISTS trainers (
        id SERIAL PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        specialization VARCHAR(100),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);

      // 3. Members Table
      await pool.query(`CREATE TABLE IF NOT EXISTS members (
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
      )`);

      // 4. Plans Table
      await pool.query(`CREATE TABLE IF NOT EXISTS plans (
        id SERIAL PRIMARY KEY,
        name VARCHAR(30) NOT NULL,
        months SMALLINT NOT NULL,
        price INT NOT NULL
      )`);

      // 5. Memberships Table
      await pool.query(`CREATE TABLE IF NOT EXISTS memberships (
        id SERIAL PRIMARY KEY,
        member_id INT NOT NULL,
        plan_id INT NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id)
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_memberships_lookup ON memberships(member_id, status, end_date)`);

      // 6. Payments Table
      await pool.query(`CREATE TABLE IF NOT EXISTS payments (
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
      )`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_payments_status_paid ON payments(status, paid_on)`);

      // 7. Attendance Table
      await pool.query(`CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        member_id INT NOT NULL,
        date DATE NOT NULL,
        checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT unique_attendance_one_per_day UNIQUE (member_id, date),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`);

      // 8. Progress Table
      await pool.query(`CREATE TABLE IF NOT EXISTS progress (
        id SERIAL PRIMARY KEY,
        member_id INT NOT NULL,
        date DATE NOT NULL,
        weight_kg DECIMAL(5,1) NOT NULL,
        note VARCHAR(200),
        CONSTRAINT unique_progress_one_per_day UNIQUE (member_id, date),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`);

      // 9. Badges Table
      await pool.query(`CREATE TABLE IF NOT EXISTS badges (
        id SERIAL PRIMARY KEY,
        member_id INT NOT NULL,
        type VARCHAR(30) NOT NULL CHECK (type IN ('streak30', 'streak90')),
        earned_on DATE NOT NULL,
        CONSTRAINT unique_badges_one_each UNIQUE (member_id, type),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`);

      // Seed default plans if empty
      const pRes = await pool.query('SELECT COUNT(*) c FROM plans');
      if (Number(pRes.rows[0]?.c || 0) === 0) {
        await pool.query(`INSERT INTO plans (name, months, price) VALUES
          ('1 Month', 1, 1500),
          ('3 Months', 3, 4000),
          ('6 Months', 6, 7000),
          ('12 Months', 12, 12000)
        ON CONFLICT DO NOTHING`);
      }

      // Seed admin if not present
      const aRes = await pool.query("SELECT id FROM users WHERE role = 'admin' LIMIT 1");
      if (aRes.rows.length === 0) {
        const e = (process.env.ADMIN_EMAIL || 'admin@flexflow.com').toLowerCase().trim();
        const p = process.env.ADMIN_PASSWORD || 'Admin@123456';
        const hash = await bcrypt.hash(p, 10);
        await pool.query(
          "INSERT INTO users(name, email, password_hash, role) VALUES('Admin', $1, $2, 'admin')",
          [e, hash]
        );
        console.log('FlexFlow (PostgreSQL): Created default admin:', e);
      }
    } else {
      // MySQL init
      await pool.query(`CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        phone VARCHAR(20),
        password_hash VARCHAR(100) NOT NULL,
        role ENUM('member','trainer','admin') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS trainers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        specialization VARCHAR(100),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL UNIQUE,
        trainer_id INT NULL,
        goal ENUM('lose_fat','build_muscle','stay_fit') DEFAULT 'stay_fit',
        declared_level ENUM('beginner','intermediate','advanced') DEFAULT 'beginner',
        diet_pref ENUM('veg','nonveg') DEFAULT 'veg',
        height_cm SMALLINT,
        joined_on DATE NOT NULL DEFAULT (CURRENT_DATE),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (trainer_id) REFERENCES trainers(id) ON DELETE SET NULL
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS plans (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(30) NOT NULL,
        months TINYINT NOT NULL,
        price INT NOT NULL
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS memberships (
        id INT AUTO_INCREMENT PRIMARY KEY,
        member_id INT NOT NULL,
        plan_id INT NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        status ENUM('pending','active') NOT NULL DEFAULT 'pending',
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
        FOREIGN KEY (plan_id) REFERENCES plans(id),
        INDEX (member_id, status, end_date)
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS payments (
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
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS attendance (
        id INT AUTO_INCREMENT PRIMARY KEY,
        member_id INT NOT NULL,
        date DATE NOT NULL,
        checked_in_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY one_per_day (member_id, date),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS progress (
        id INT AUTO_INCREMENT PRIMARY KEY,
        member_id INT NOT NULL,
        date DATE NOT NULL,
        weight_kg DECIMAL(5,1) NOT NULL,
        note VARCHAR(200),
        UNIQUE KEY one_per_day (member_id, date),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`);
      await pool.query(`CREATE TABLE IF NOT EXISTS badges (
        id INT AUTO_INCREMENT PRIMARY KEY,
        member_id INT NOT NULL,
        type ENUM('streak30','streak90') NOT NULL,
        earned_on DATE NOT NULL,
        UNIQUE KEY one_each (member_id, type),
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
      )`);

      const [pRows] = await pool.query('SELECT COUNT(*) c FROM plans');
      if (!pRows[0]?.c) {
        await pool.query(`INSERT IGNORE INTO plans (name, months, price) VALUES
          ('1 Month',1,1500),('3 Months',3,4000),('6 Months',6,7000),('12 Months',12,12000)`);
      }

      const [aRows] = await pool.query('SELECT id FROM users WHERE role="admin" LIMIT 1');
      if (!aRows.length) {
        const e = (process.env.ADMIN_EMAIL || 'admin@flexflow.com').toLowerCase().trim();
        const p = process.env.ADMIN_PASSWORD || 'Admin@123456';
        const hash = await bcrypt.hash(p, 10);
        await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES("Admin",?,?,"admin")', [e, hash]);
        console.log('FlexFlow (MySQL): Created default admin:', e);
      }
    }

    isInitialized = true;
      } catch (err) {
        console.error('Database initialization notice:', err.message);
      } finally {
        initPromise = null;
      }
    })();
  }
  return initPromise;
}

module.exports = {
  pool,
  isPg,
  q,
  getConnection,
  ensureDbInit,
};
