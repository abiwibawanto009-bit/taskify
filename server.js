require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const webpush = require('web-push');
const fs = require('fs');

const {
  initDb,
  getTasks,
  createTask,
  updateTask,
  deleteTask,
  saveSubscription,
  getSubscriptions,
  deleteSubscriptionByEndpoint
} = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Dynamic VAPID Keys Setup
// Generate VAPID keys if they are not in environment variables
let vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
let vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

if (!vapidPublicKey || !vapidPrivateKey) {
  console.log('Generating new VAPID keys since they were not found in the environment...');
  const keys = webpush.generateVAPIDKeys();
  vapidPublicKey = keys.publicKey;
  vapidPrivateKey = keys.privateKey;
  
  // Write to a .env file to persist across server restarts
  const envContent = `VAPID_PUBLIC_KEY=${vapidPublicKey}\nVAPID_PRIVATE_KEY=${vapidPrivateKey}\nPORT=5000\n`;
  fs.writeFileSync(path.join(__dirname, '.env'), envContent, 'utf8');
  console.log('Generated and saved VAPID keys to .env');
}

webpush.setVapidDetails(
  'mailto:admin@taskify-pwa.local',
  vapidPublicKey,
  vapidPrivateKey
);

// Initialize DB tables
initDb();

// ------------------- API ROUTES -------------------

// Get all tasks
app.get('/api/tasks', async (req, res) => {
  try {
    const tasks = await getTasks();
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new task
app.post('/api/tasks', async (req, res) => {
  try {
    const { title, description, category, due_date } = req.body;
    if (!title) {
      return res.status(400).json({ success: false, error: 'Title is required' });
    }
    const task = await createTask({ title, description, category, due_date, status: 'todo' });
    
    // Proactively send a push notification when a task is created (optional, great UX)
    sendPushToAll(`New Task Created!`, `"${title}" has been added to your board.`);

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update task
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, category, due_date, status } = req.body;
    const updated = await updateTask(id, { title, description, category, due_date, status });
    if (updated) {
      const updatedTask = { id, title, description, category, due_date, status };
      res.json({ success: true, data: updatedTask });
    } else {
      res.status(404).json({ success: false, error: 'Task not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete task
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await deleteTask(id);
    if (deleted) {
      res.json({ success: true, message: 'Task deleted successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Task not found' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ------------------- PUSH NOTIFICATION ROUTES -------------------

// Get public VAPID Key
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidPublicKey });
});

// Subscribe to push notifications
app.post('/api/subscribe', async (req, res) => {
  try {
    const subscription = req.body;
    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ success: false, error: 'Invalid subscription object.' });
    }
    await saveSubscription(subscription);
    res.status(201).json({ success: true, message: 'Subscribed successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Trigger a test push notification to all subscribers
app.post('/api/notify', async (req, res) => {
  try {
    const { title, message } = req.body;
    const payload = JSON.stringify({
      title: title || 'Taskify Notification',
      body: message || 'This is a test notification from your Taskify PWA board!'
    });

    const subscriptions = await getSubscriptions();
    let successCount = 0;

    const notificationPromises = subscriptions.map(subscription => {
      return webpush.sendNotification(subscription, payload)
        .then(() => { successCount++; })
        .catch(async (err) => {
          console.error('Error sending push notification:', err.message);
          // If subscription is expired or inactive, clean it from DB
          if (err.statusCode === 410 || err.statusCode === 404) {
            await deleteSubscriptionByEndpoint(subscription.endpoint);
          }
        });
    });

    await Promise.all(notificationPromises);
    res.json({ success: true, message: `Sent notifications to ${successCount} active subscriptions.` });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper function to send push notification to all users
async function sendPushToAll(title, body) {
  try {
    const subscriptions = await getSubscriptions();
    const payload = JSON.stringify({ title, body });
    subscriptions.forEach(subscription => {
      webpush.sendNotification(subscription, payload)
        .catch(async (err) => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await deleteSubscriptionByEndpoint(subscription.endpoint);
          }
        });
    });
  } catch (error) {
    console.error('Failed to broadcast push notification:', error);
  }
}

// Redirect all unknown requests to static files
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
