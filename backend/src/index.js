const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;
const schedulerService = require('./services/schedulerService');

// Start background notification scheduler (skip in Vercel/Serverless)
if (!process.env.VERCEL) {
  schedulerService.start();
}

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const projectRoutes = require('./controllers/projectController');
const taskRoutes = require('./controllers/taskController');
const dashboardRoutes = require('./controllers/dashboardController');
const teamRoutes = require('./controllers/teamController');
const reportRoutes = require('./controllers/reportController');
const chatRoutes = require('./controllers/chatController');
const authRoutes = require('./controllers/authController');
const userRoutes = require('./controllers/userController');

app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Conditionally start the server (skip in Vercel/Serverless environments)
if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\x1b[32m✓\x1b[0m Server running on http://localhost:${PORT}`);
  });
}

// Export the app for Vercel Serverless Functions
module.exports = app;
