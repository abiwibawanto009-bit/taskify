const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

const isPostgres = !!process.env.DATABASE_URL;

let pgPool = null;
let sqliteDb = null;

if (isPostgres) {
  console.log('Database Mode: PostgreSQL (Cloud Database)');
  const { Pool } = require('pg');
  pgPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Required for hosting platforms like Neon/Supabase
  });
} else {
  console.log('Database Mode: SQLite (Local Fallback)');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, 'database.db');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening SQLite database:', err.message);
    } else {
      console.log('Connected to the SQLite database.');
    }
  });
}

// ------------------- DATABASE ENGINE ABSTRACTION -------------------

async function runQuery(sql, params = []) {
  if (isPostgres) {
    // Translate SQLite placeholders (?) to PostgreSQL ($1, $2, etc.)
    let pgSql = sql;
    let index = 1;
    while (pgSql.includes('?')) {
      pgSql = pgSql.replace('?', `$${index++}`);
    }
    
    // SQLite INSERT OR REPLACE conversion to PostgreSQL syntax
    if (pgSql.toUpperCase().startsWith('INSERT OR REPLACE')) {
      // Custom mapping for subscriptions conflict
      if (pgSql.includes('subscriptions')) {
        pgSql = `
          INSERT INTO subscriptions (endpoint, expiration_time, keys_p256dh, keys_auth)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (endpoint) 
          DO UPDATE SET 
            expiration_time = EXCLUDED.expiration_time, 
            keys_p256dh = EXCLUDED.keys_p256dh, 
            keys_auth = EXCLUDED.keys_auth
        `;
      }
    }

    const client = await pgPool.connect();
    try {
      const res = await client.query(pgSql, params);
      return { 
        rows: res.rows, 
        changes: res.rowCount, 
        lastID: res.rows[0] ? res.rows[0].id : null 
      };
    } finally {
      client.release();
    }
  } else {
    return new Promise((resolve, reject) => {
      // Map INSERT OR REPLACE (for subscriptions) to standard sqlite
      sqliteDb.all(sql, params, function(err, rows) {
        if (err) return reject(err);
        resolve({ rows: rows || [], changes: this.changes, lastID: this.lastID });
      });
    });
  }
}

// Initialize tables
async function initDb() {
  let createTasksTable = '';
  let createSubscriptionsTable = '';

  if (isPostgres) {
    createTasksTable = `
      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        category VARCHAR(100) DEFAULT 'Personal',
        due_date VARCHAR(50),
        status VARCHAR(50) DEFAULT 'todo',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;

    createSubscriptionsTable = `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id SERIAL PRIMARY KEY,
        endpoint TEXT UNIQUE NOT NULL,
        expiration_time VARCHAR(255),
        keys_p256dh TEXT NOT NULL,
        keys_auth TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
  } else {
    createTasksTable = `
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'Personal',
        due_date TEXT,
        status TEXT DEFAULT 'todo',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    createSubscriptionsTable = `
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint TEXT UNIQUE NOT NULL,
        expiration_time TEXT,
        keys_p256dh TEXT NOT NULL,
        keys_auth TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;
  }

  try {
    if (isPostgres) {
      const client = await pgPool.connect();
      try {
        await client.query(createTasksTable);
        await client.query(createSubscriptionsTable);
      } finally {
        client.release();
      }
    } else {
      await new Promise((resolve, reject) => {
        sqliteDb.serialize(() => {
          sqliteDb.run(createTasksTable, (err) => err ? reject(err) : null);
          sqliteDb.run(createSubscriptionsTable, (err) => err ? reject(err) : resolve());
        });
      });
    }
    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  }
}

// Tasks CRUD API
async function getTasks() {
  const sql = 'SELECT * FROM tasks ORDER BY due_date ASC, created_at DESC';
  const result = await runQuery(sql);
  return result.rows;
}

async function getTaskById(id) {
  const sql = 'SELECT * FROM tasks WHERE id = ?';
  const result = await runQuery(sql, [id]);
  return result.rows[0] || null;
}

async function createTask(task) {
  const { title, description, category, due_date, status = 'todo' } = task;
  let sql = '';
  let params = [title, description, category, due_date, status];
  
  if (isPostgres) {
    sql = `
      INSERT INTO tasks (title, description, category, due_date, status)
      VALUES (?, ?, ?, ?, ?) RETURNING id
    `;
    const result = await runQuery(sql, params);
    return { id: result.lastID, ...task };
  } else {
    // For SQLite, insert and read lastID
    return new Promise((resolve, reject) => {
      sqliteDb.run(
        `INSERT INTO tasks (title, description, category, due_date, status) VALUES (?, ?, ?, ?, ?)`,
        params,
        function (err) {
          if (err) return reject(err);
          resolve({ id: this.lastID, ...task });
        }
      );
    });
  }
}

async function updateTask(id, task) {
  const { title, description, category, due_date, status } = task;
  const sql = `
    UPDATE tasks
    SET title = ?, description = ?, category = ?, due_date = ?, status = ?
    WHERE id = ?
  `;
  const result = await runQuery(sql, [title, description, category, due_date, status, id]);
  return result.changes > 0;
}

async function deleteTask(id) {
  const sql = 'DELETE FROM tasks WHERE id = ?';
  const result = await runQuery(sql, [id]);
  return result.changes > 0;
}

// Subscriptions
async function saveSubscription(sub) {
  const { endpoint, expirationTime, keys } = sub;
  const sql = `
    INSERT OR REPLACE INTO subscriptions (endpoint, expiration_time, keys_p256dh, keys_auth)
    VALUES (?, ?, ?, ?)
  `;
  await runQuery(sql, [endpoint, expirationTime, keys.p256dh, keys.auth]);
  return true;
}

async function getSubscriptions() {
  const sql = 'SELECT * FROM subscriptions';
  const result = await runQuery(sql);
  
  // Normalize row keys for both drivers
  return result.rows.map(row => ({
    endpoint: row.endpoint,
    expirationTime: row.expiration_time || row.expiration_time,
    keys: {
      p256dh: row.keys_p256dh || row.keys_p256dh,
      auth: row.keys_auth || row.keys_auth
    }
  }));
}

async function deleteSubscriptionByEndpoint(endpoint) {
  const sql = 'DELETE FROM subscriptions WHERE endpoint = ?';
  const result = await runQuery(sql, [endpoint]);
  return result.changes > 0;
}

module.exports = {
  initDb,
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  saveSubscription,
  getSubscriptions,
  deleteSubscriptionByEndpoint
};
