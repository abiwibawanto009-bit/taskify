const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.resolve(__dirname, 'database.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to the SQLite database.');
  }
});

// Promise wrapper for db.run
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ id: this.lastID, changes: this.changes });
      }
    });
  });
}

// Promise wrapper for db.all
function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Promise wrapper for db.get
function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Initialize tables
async function initDb() {
  const createTasksTable = `
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

  const createSubscriptionsTable = `
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      endpoint TEXT UNIQUE NOT NULL,
      expiration_time TEXT,
      keys_p256dh TEXT NOT NULL,
      keys_auth TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  try {
    await dbRun(createTasksTable);
    await dbRun(createSubscriptionsTable);
    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Error initializing tables:', error);
  }
}

// Tasks queries using async/await
async function getTasks() {
  return await dbAll('SELECT * FROM tasks ORDER BY due_date ASC, created_at DESC');
}

async function getTaskById(id) {
  return await dbGet('SELECT * FROM tasks WHERE id = ?', [id]);
}

async function createTask(task) {
  const { title, description, category, due_date, status = 'todo' } = task;
  const sql = `
    INSERT INTO tasks (title, description, category, due_date, status)
    VALUES (?, ?, ?, ?, ?)
  `;
  const result = await dbRun(sql, [title, description, category, due_date, status]);
  return { id: result.id, ...task };
}

async function updateTask(id, task) {
  const { title, description, category, due_date, status } = task;
  const sql = `
    UPDATE tasks
    SET title = ?, description = ?, category = ?, due_date = ?, status = ?
    WHERE id = ?
  `;
  const result = await dbRun(sql, [title, description, category, due_date, status, id]);
  return result.changes > 0;
}

async function deleteTask(id) {
  const sql = 'DELETE FROM tasks WHERE id = ?';
  const result = await dbRun(sql, [id]);
  return result.changes > 0;
}

// Subscription queries
async function saveSubscription(sub) {
  const { endpoint, expirationTime, keys } = sub;
  const sql = `
    INSERT OR REPLACE INTO subscriptions (endpoint, expiration_time, keys_p256dh, keys_auth)
    VALUES (?, ?, ?, ?)
  `;
  await dbRun(sql, [endpoint, expirationTime, keys.p256dh, keys.auth]);
  return true;
}

async function getSubscriptions() {
  const rows = await dbAll('SELECT * FROM subscriptions');
  return rows.map(row => ({
    endpoint: row.endpoint,
    expirationTime: row.expiration_time,
    keys: {
      p256dh: row.keys_p256dh,
      auth: row.keys_auth
    }
  }));
}

async function deleteSubscriptionByEndpoint(endpoint) {
  const sql = 'DELETE FROM subscriptions WHERE endpoint = ?';
  const result = await dbRun(sql, [endpoint]);
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
