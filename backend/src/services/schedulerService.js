const db = require('../config/db');
const mailService = require('./mailService');

/**
 * Custom background scheduler to handle daily and weekly notifications.
 * Runs every hour to check for overdue tasks, deadline warnings, and recaps.
 */
class SchedulerService {
  constructor() {
    this.interval = null;
    this.lastRunHour = -1;
  }

  start() {
    console.log('🕒 Notification Scheduler started (running hourly checks)...');
    
    // Run every hour
    this.interval = setInterval(() => this.checkAndRun(), 1000 * 60 * 60);
    
    // Also run immediately on start for any missed checks
    this.checkAndRun();
  }

  async checkAndRun() {
    const now = new Date();
    const currentHour = now.getHours(); // 0-23
    const currentDay = now.getDay();    // 0 = Sunday, 1 = Monday, ...

    // Prevent running multiple times in the same hour
    if (currentHour === this.lastRunHour) return;
    this.lastRunHour = currentHour;

    // Trigger daily tasks at 9:00 AM
    if (currentHour === 9) {
      console.log('📅 Running daily notification checks...');
      await this.runOverdueChecks();
      await this.runDeadlineWarnings();

      // Trigger weekly tasks on Monday at 9:00 AM
      if (currentDay === 1) {
        console.log('📊 Running weekly portfolio recap...');
        await this.runWeeklyRecap();
      }
    }
  }

  /**
   * Find overdue tasks and notify assignees
   */
  async runOverdueChecks() {
    try {
      const result = await db.query(`
        SELECT t.title, t.due_date, p.name as project_name, tm.name as member_name, tm.email
        FROM tasks t
        JOIN projects p ON t.project_id = p.id
        JOIN team_members tm ON t.assigned_to = tm.id
        WHERE t.due_date < CURRENT_DATE 
        AND t.status != 'done'
        AND tm.email IS NOT NULL
      `);

      const tasksByEmail = result.rows.reduce((acc, task) => {
        if (!acc[task.email]) acc[task.email] = { member: { name: task.member_name, email: task.email }, tasks: [] };
        acc[task.email].tasks.push(task);
        return acc;
      }, {});

      for (const email of Object.keys(tasksByEmail)) {
        const { member, tasks } = tasksByEmail[email];
        await mailService.sendOverdueReminderEmail(member, tasks);
      }
    } catch (err) {
      console.error('Overdue check failed:', err);
    }
  }

  /**
   * Find projects ending in 48 hours and notify managers
   */
  async runDeadlineWarnings() {
    try {
      const result = await db.query(`
        SELECT p.id, p.name, p.end_date, u.name as owner_name, u.email
        FROM projects p
        JOIN users u ON p.owner_id = u.id
        WHERE p.end_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + interval '2 days')
        AND p.status != 'completed'
      `);

      for (const project of result.rows) {
        // Find incomplete tasks for this project
        const tasksRes = await db.query('SELECT COUNT(*) FROM tasks WHERE project_id = $1 AND status != "done"', [project.id]);
        if (parseInt(tasksRes.rows[0].count) > 0) {
          await mailService.sendEmail({
            to: project.email,
            subject: `⚠️ DEADLINE WARNING: ${project.name}`,
            html: `
              <div style="font-family: sans-serif; padding: 20px; border: 1px solid #f97316; border-radius: 10px;">
                <h3 style="color: #f97316;">Approaching Deadline</h3>
                <p>Hello <strong>${project.owner_name}</strong>, your project <strong>${project.name}</strong> is scheduled to end on <strong>${new Date(project.end_date).toLocaleDateString()}</strong> (within 48 hours).</p>
                <p>There are still <strong>${tasksRes.rows[0].count}</strong> incomplete tasks in this project.</p>
                <p>Please review and adjust assignments to meet the deadline.</p>
              </div>
            `
          });
        }
      }
    } catch (err) {
      console.error('Deadline warning failed:', err);
    }
  }

  /**
   * Weekly portfolio summary for all managers
   */
  async runWeeklyRecap() {
    try {
      const usersRes = await db.query('SELECT id, name, email FROM users');
      
      for (const user of usersRes.rows) {
        const projectsRes = await db.query(`
          SELECT p.id, p.name, p.status,
            COUNT(t.id) as total_tasks,
            COUNT(t.id) FILTER (WHERE t.status = 'done') as completed_tasks,
            COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'done') as overdue_tasks
          FROM projects p
          LEFT JOIN tasks t ON t.project_id = p.id
          WHERE p.owner_id = $1
          GROUP BY p.id
        `, [user.id]);

        if (projectsRes.rows.length > 0) {
          const stats = {
            totalProjects: projectsRes.rows.length,
            completedTasks: projectsRes.rows.reduce((sum, p) => sum + parseInt(p.completed_tasks), 0),
            projectSummaries: projectsRes.rows.map(p => ({
              name: p.name,
              completion: p.total_tasks > 0 ? Math.round((parseInt(p.completed_tasks) / parseInt(p.total_tasks)) * 100) : 0,
              overdueCount: parseInt(p.overdue_tasks)
            }))
          };

          await mailService.sendWeeklyRecapEmail(user, stats);
        }
      }
    } catch (err) {
      console.error('Weekly recap failed:', err);
    }
  }
}

module.exports = new SchedulerService();
