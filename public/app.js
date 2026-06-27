// Taskify - PWA Kanban Board Application Client

// API Endpoints
const API_URL = '/api';

// State Variables
let tasks = [];
let deferredPrompt = null;
let swRegistration = null;
let isSubscribed = false;

// DOM Elements
const connectionStatus = document.getElementById('connection-status');
const btnInstall = document.getElementById('btn-install');
const btnPushSubscribe = document.getElementById('btn-push-subscribe');
const btnTestNotification = document.getElementById('btn-test-notification');
const btnNewTask = document.getElementById('btn-new-task');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelTask = document.getElementById('btn-cancel-task');
const taskModal = document.getElementById('task-modal');
const taskForm = document.getElementById('task-form');

// Form Input Elements
const inputTaskId = document.getElementById('task-id');
const inputTaskTitle = document.getElementById('task-title');
const inputTaskDesc = document.getElementById('task-desc');
const inputTaskCategory = document.getElementById('task-category');
const inputTaskDate = document.getElementById('task-date');
const selectTaskStatus = document.getElementById('task-status');
const formGroupStatus = document.getElementById('form-group-status');
const modalTitle = document.getElementById('modal-title');

// Stats Elements
const countTodo = document.getElementById('count-todo');
const countProgress = document.getElementById('count-progress');
const countCompleted = document.getElementById('count-completed');
const countRatio = document.getElementById('count-ratio');

// Board Columns
const cardsTodo = document.getElementById('cards-todo');
const cardsProgress = document.getElementById('cards-progress');
const cardsCompleted = document.getElementById('cards-completed');

// Badges
const badgeTodo = document.getElementById('badge-todo');
const badgeProgress = document.getElementById('badge-progress');
const badgeCompleted = document.getElementById('badge-completed');

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

// Main Initializer
async function initApp() {
  // Set default date picker to today
  inputTaskDate.value = new Date().toISOString().split('T')[0];

  // Setup Event Listeners
  setupEventListeners();

  // Check network state
  updateOnlineStatus();

  // Load Tasks via Async JS
  await fetchTasks();

  // Register PWA Service Worker
  await registerServiceWorker();
}

// Setup Application Listeners
function setupEventListeners() {
  // Network events
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);

  // Modal controls
  btnNewTask.addEventListener('click', () => openTaskModal());
  btnCloseModal.addEventListener('click', closeTaskModal);
  btnCancelTask.addEventListener('click', closeTaskModal);
  taskForm.addEventListener('submit', handleFormSubmit);

  // Close modal when clicking outside
  taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) closeTaskModal();
  });

  // PWA Install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    btnInstall.classList.remove('hidden');
    showToast('Taskify can now be installed on your device!', 'info');
  });

  btnInstall.addEventListener('click', triggerPWAInstallation);

  // Push subscription trigger
  btnPushSubscribe.addEventListener('click', handlePushSubscribeClick);
  btnTestNotification.addEventListener('click', triggerTestNotification);
}

// ------------------- ASYNC CRUD OPERATIONS -------------------

// Fetch Tasks from server database
async function fetchTasks() {
  try {
    showBoardLoading(true);
    const response = await fetch(`${API_URL}/tasks`);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const result = await response.json();
    if (result.success) {
      tasks = result.data;
      renderBoard();
    } else {
      showToast(result.error || 'Failed to fetch tasks', 'error');
    }
  } catch (error) {
    console.error('Fetch error:', error);
    showToast('Failed to connect to server. Working with cached content (if available).', 'warning');
    // Fallback: If network is offline and service worker cached the API response, it will serve it automatically.
  } finally {
    showBoardLoading(false);
  }
}

// Save or Update task
async function handleFormSubmit(e) {
  e.preventDefault();

  const id = inputTaskId.value;
  const taskData = {
    title: inputTaskTitle.value.trim(),
    description: inputTaskDesc.value.trim(),
    category: inputTaskCategory.value,
    due_date: inputTaskDate.value,
  };

  const isEdit = !!id;

  try {
    let response;
    if (isEdit) {
      taskData.status = selectTaskStatus.value;
      response = await fetch(`${API_URL}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
    } else {
      response = await fetch(`${API_URL}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
      });
    }

    if (!response.ok) throw new Error('Saving task failed');
    
    const result = await response.json();
    if (result.success) {
      showToast(isEdit ? 'Task updated successfully!' : 'Task created successfully!', 'success');
      closeTaskModal();
      await fetchTasks();
    } else {
      showToast(result.error || 'Operation failed', 'error');
    }
  } catch (error) {
    console.error('Error saving task:', error);
    showToast('Unable to complete request. Please check connection.', 'error');
  }
}

// Move Task Status
async function moveTaskStatus(taskId, currentStatus, direction) {
  const statusOrder = ['todo', 'progress', 'completed'];
  let currentIndex = statusOrder.indexOf(currentStatus);
  let newIndex = currentIndex + direction;

  if (newIndex < 0 || newIndex >= statusOrder.length) return;

  const targetStatus = statusOrder[newIndex];
  const targetTask = tasks.find(t => t.id === parseInt(taskId) || t.id === taskId);
  
  if (!targetTask) return;

  const taskData = {
    title: targetTask.title,
    description: targetTask.description,
    category: targetTask.category,
    due_date: targetTask.due_date,
    status: targetStatus
  };

  try {
    const response = await fetch(`${API_URL}/tasks/${targetTask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskData)
    });

    if (!response.ok) throw new Error('Status migration failed');
    
    const result = await response.json();
    if (result.success) {
      showToast(`Moved to "${statusOrder[newIndex].toUpperCase()}"`, 'info');
      await fetchTasks();
    }
  } catch (error) {
    console.error('Error changing status:', error);
    showToast('Failed to shift task status.', 'error');
  }
}

// Delete Task
async function handleDeleteTask(id) {
  if (!confirm('Are you sure you want to delete this task?')) return;

  try {
    const response = await fetch(`${API_URL}/tasks/${id}`, {
      method: 'DELETE'
    });

    if (!response.ok) throw new Error('Deletion failed');

    const result = await response.json();
    if (result.success) {
      showToast('Task permanently deleted', 'success');
      await fetchTasks();
    } else {
      showToast(result.error || 'Failed to delete task', 'error');
    }
  } catch (error) {
    console.error('Error deleting task:', error);
    showToast('Failed to connect. Couldn\'t delete task.', 'error');
  }
}

// ------------------- UI RENDERING & BUILDERS -------------------

// Render Cards to Board Columns
function renderBoard() {
  // Clear columns
  cardsTodo.innerHTML = '';
  cardsProgress.innerHTML = '';
  cardsCompleted.innerHTML = '';

  let todoCount = 0;
  let progressCount = 0;
  let completedCount = 0;

  if (tasks.length === 0) {
    const emptyMsg = `<div class="loading-placeholder"><i class="fa-solid fa-folder-open"></i> No tasks found. Add a task to start!</div>`;
    cardsTodo.innerHTML = emptyMsg;
    updateStats(0, 0, 0);
    return;
  }

  tasks.forEach(task => {
    const card = createTaskCard(task);
    
    if (task.status === 'todo') {
      cardsTodo.appendChild(card);
      todoCount++;
    } else if (task.status === 'progress' || task.status === 'in_progress') {
      cardsProgress.appendChild(card);
      progressCount++;
    } else if (task.status === 'completed') {
      cardsCompleted.appendChild(card);
      completedCount++;
    }
  });

  // Handle empty columns
  if (todoCount === 0) cardsTodo.innerHTML = `<div class="loading-placeholder">No Tasks</div>`;
  if (progressCount === 0) cardsProgress.innerHTML = `<div class="loading-placeholder">No Tasks</div>`;
  if (completedCount === 0) cardsCompleted.innerHTML = `<div class="loading-placeholder">No Tasks</div>`;

  updateStats(todoCount, progressCount, completedCount);
}

// HTML Card Generator
function createTaskCard(task) {
  const card = document.createElement('div');
  card.className = 'task-card';
  card.dataset.id = task.id;
  card.dataset.status = task.status;

  const cleanCategory = (task.category || 'personal').toLowerCase();
  
  // Date status calculation (overdue check)
  const today = new Date().toISOString().split('T')[0];
  const isOverdue = task.due_date < today && task.status !== 'completed';
  const formattedDate = formatDate(task.due_date);

  card.innerHTML = `
    <div class="card-top">
      <span class="card-category ${cleanCategory}">${task.category}</span>
      <div class="card-actions">
        <button class="action-icon edit" onclick="openEditModal(${task.id})" title="Edit Task">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="action-icon delete" onclick="handleDeleteTask(${task.id})" title="Delete Task">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    </div>
    <h4 class="card-title">${escapeHTML(task.title)}</h4>
    <p class="card-desc">${escapeHTML(task.description || 'No description provided.')}</p>
    <div class="card-footer">
      <div class="card-date ${isOverdue ? 'overdue' : ''}">
        <i class="fa-regular fa-calendar-days"></i>
        <span>${formattedDate} ${isOverdue ? '(Overdue)' : ''}</span>
      </div>
      <div class="card-nav">
        ${task.status !== 'todo' ? `
          <button class="nav-arrow" onclick="moveTaskStatus(${task.id}, '${task.status}', -1)" title="Move Left">
            <i class="fa-solid fa-chevron-left"></i>
          </button>
        ` : ''}
        ${task.status !== 'completed' ? `
          <button class="nav-arrow" onclick="moveTaskStatus(${task.id}, '${task.status}', 1)" title="Move Right">
            <i class="fa-solid fa-chevron-right"></i>
          </button>
        ` : ''}
      </div>
    </div>
  `;
  return card;
}

// Show/Hide Column Loaders
function showBoardLoading(show) {
  if (show && tasks.length === 0) {
    cardsTodo.innerHTML = `<div class="loading-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching...</div>`;
    cardsProgress.innerHTML = `<div class="loading-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching...</div>`;
    cardsCompleted.innerHTML = `<div class="loading-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Fetching...</div>`;
  }
}

// Update Stats Elements
function updateStats(todo, progress, completed) {
  countTodo.textContent = todo;
  countProgress.textContent = progress;
  countCompleted.textContent = completed;
  
  badgeTodo.textContent = todo;
  badgeProgress.textContent = progress;
  badgeCompleted.textContent = completed;

  const total = todo + progress + completed;
  if (total === 0) {
    countRatio.textContent = '0%';
  } else {
    const ratio = Math.round((completed / total) * 100);
    countRatio.textContent = `${ratio}%`;
  }
}

// ------------------- MODAL UTILS -------------------

function openTaskModal() {
  modalTitle.textContent = 'Create New Task';
  inputTaskId.value = '';
  taskForm.reset();
  inputTaskDate.value = new Date().toISOString().split('T')[0];
  formGroupStatus.classList.add('hidden');
  taskModal.classList.remove('hidden');
}

function openEditModal(taskId) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return;

  modalTitle.textContent = 'Edit Task';
  inputTaskId.value = task.id;
  inputTaskTitle.value = task.title;
  inputTaskDesc.value = task.description || '';
  inputTaskCategory.value = task.category;
  inputTaskDate.value = task.due_date;
  selectTaskStatus.value = task.status;
  
  formGroupStatus.classList.remove('hidden');
  taskModal.classList.remove('hidden');
}

function closeTaskModal() {
  taskModal.classList.add('hidden');
}

// ------------------- PWA & SERVICE WORKER -------------------

async function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      console.log('Service Worker registered with scope:', reg.scope);
      swRegistration = reg;

      // Check Push Subscription Status
      await checkSubscription();
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  } else {
    console.warn('Service workers are not supported by this browser.');
    btnPushSubscribe.classList.add('hidden');
  }
}

function triggerPWAInstallation() {
  if (!deferredPrompt) return;
  
  deferredPrompt.prompt();
  deferredPrompt.userChoice.then((choiceResult) => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the PWA install prompt');
      btnInstall.classList.add('hidden');
    } else {
      console.log('User dismissed the PWA install prompt');
    }
    deferredPrompt = null;
  });
}

// ------------------- WEB PUSH NOTIFICATIONS -------------------

async function checkSubscription() {
  if (!swRegistration) return;

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    isSubscribed = !!subscription;
    updateSubscriptionButton();
  } catch (error) {
    console.error('Error checking push subscription:', error);
  }
}

async function handlePushSubscribeClick() {
  if (Notification.permission === 'denied') {
    showToast('Push Notifications are blocked. Please enable them in browser settings.', 'error');
    return;
  }

  if (isSubscribed) {
    showToast('You are already subscribed to Push Notifications!', 'info');
    return;
  }

  try {
    // Request permission first
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showToast('Notification permission was not granted.', 'warning');
      return;
    }

    // Subscribe user
    await subscribeUser();
  } catch (error) {
    console.error('Subscription error:', error);
    showToast('Failed to subscribe user to notifications.', 'error');
  }
}

async function subscribeUser() {
  try {
    // Get public VAPID key from API
    const response = await fetch(`${API_URL}/vapid-public-key`);
    const keyData = await response.json();
    const applicationServerKey = urlBase64ToUint8Array(keyData.publicKey);

    // Subscribe
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    console.log('Push subscription generated:', subscription);

    // Send subscription to backend
    const saveResponse = await fetch(`${API_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subscription)
    });

    if (saveResponse.ok) {
      isSubscribed = true;
      updateSubscriptionButton();
      showToast('Push notifications successfully configured!', 'success');
      
      // Send welcoming local notification
      new Notification('Taskify Board', {
        body: 'Welcome to Taskify! You will now receive push notifications.',
        icon: '/icons/icon-192.png'
      });
    } else {
      throw new Error('Server subscription registration failed');
    }
  } catch (error) {
    console.error('Error subscribing user:', error);
    showToast('Subscription verification failed on server.', 'error');
  }
}

function updateSubscriptionButton() {
  if (isSubscribed) {
    btnPushSubscribe.innerHTML = '<i class="fa-solid fa-bell"></i> Notifications Active';
    btnPushSubscribe.classList.remove('btn-secondary');
    btnPushSubscribe.classList.add('btn-primary');
    btnPushSubscribe.disabled = true; // Block double subscribing
  } else {
    btnPushSubscribe.innerHTML = '<i class="fa-regular fa-bell"></i> Enable Push';
    btnPushSubscribe.classList.add('btn-secondary');
    btnPushSubscribe.classList.remove('btn-primary');
    btnPushSubscribe.disabled = false;
  }
}

async function triggerTestNotification() {
  try {
    const response = await fetch(`${API_URL}/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Taskify Alert',
        message: 'Hello! This is a test notification representing a deadline update.'
      })
    });
    
    const result = await response.json();
    if (result.success) {
      showToast('Test notification command broadcasted!', 'info');
    } else {
      showToast('Test notify request failed: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('Error sending test notification:', error);
    showToast('Failed to contact notification broadcaster.', 'error');
  }
}

// ------------------- AUXILIARY HELPERS -------------------

// Update online status indicator
function updateOnlineStatus() {
  const isOnline = navigator.onLine;
  if (isOnline) {
    connectionStatus.className = 'badge status-badge online-only';
    connectionStatus.innerHTML = '<span class="status-dot green"></span> Connected';
    showToast('You are back online. Task board synchronised!', 'success');
    fetchTasks();
  } else {
    connectionStatus.className = 'badge status-badge offline-only';
    connectionStatus.innerHTML = '<span class="status-dot amber"></span> Offline Mode';
    showToast('Network disconnected. Operating in offline cache mode.', 'warning');
  }
}

// Format date nicely (e.g., 2026-06-27 -> 27 Jun 2026)
function formatDate(dateStr) {
  if (!dateStr) return 'No Date';
  const options = { day: 'numeric', month: 'short', year: 'numeric' };
  return new Date(dateStr).toLocaleDateString('en-GB', options);
}

// Escape HTML entities to prevent XSS
function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper to convert VAPID public key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Custom Toast Notification System
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconClass = 'fa-circle-info';
  if (type === 'success') iconClass = 'fa-circle-check';
  if (type === 'warning') iconClass = 'fa-triangle-exclamation';
  if (type === 'error') iconClass = 'fa-circle-exclamation';

  toast.innerHTML = `
    <i class="fa-solid ${iconClass} toast-icon"></i>
    <span class="toast-message">${message}</span>
    <div class="toast-progress"></div>
  `;

  container.appendChild(toast);

  // Auto remove toast
  setTimeout(() => {
    toast.classList.add('removing');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
  }, 4000);
}

// Window scope mapping for HTML onclick callbacks
window.openEditModal = openEditModal;
window.handleDeleteTask = handleDeleteTask;
window.moveTaskStatus = moveTaskStatus;
