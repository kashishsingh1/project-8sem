const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5001;

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

app.use('/api/projects', projectRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`\x1b[32m✓\x1b[0m Server running on http://localhost:${PORT}`);
});
