const db = require('../config/db');

class GanttService {
  async computeGanttData(projectId) {
    const [projectResult, tasksResult] = await Promise.all([
      db.query('SELECT start_date, end_date FROM projects WHERE id = $1', [projectId]),
      db.query(`
        SELECT t.id, t.title, t.status, t.estimated_hours, t.actual_hours,
               tm.name as assigned_to_name,
               COALESCE(
                 json_agg(td.depends_on_task_id) FILTER (WHERE td.depends_on_task_id IS NOT NULL),
                 '[]'
               ) as dependencies
        FROM tasks t
        LEFT JOIN team_members tm ON t.assigned_to = tm.id
        LEFT JOIN task_dependencies td ON td.task_id = t.id
        WHERE t.project_id = $1
        GROUP BY t.id, tm.name
      `, [projectId])
    ]);

    if (projectResult.rows.length === 0) return [];
    
    // Default project start to today if missing
    let projectStart = projectResult.rows[0].start_date ? new Date(projectResult.rows[0].start_date) : new Date();
    // Normalize to start of day
    projectStart.setHours(0, 0, 0, 0);

    const tasks = tasksResult.rows;
    if (tasks.length === 0) return [];

    const taskMap = new Map();
    tasks.forEach(t => {
      taskMap.set(t.id, {
        ...t,
        startDate: null,
        endDate: null,
        durationDays: Math.ceil((t.estimated_hours || 8) / 8), // Assuming 8h workday
        computed: false
      });
    });

    const computeTaskDates = (taskId) => {
      const task = taskMap.get(taskId);
      if (task.computed) return task.endDate;
      if (task.computing) {
          // Circular dependency fallback
          console.warn('Circular dependency detected for task', taskId);
          return projectStart;
      }
      task.computing = true;

      let maxDependencyEndDate = new Date(projectStart);

      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(depId => {
           if (taskMap.has(depId)) {
               const depEndDate = computeTaskDates(depId);
               if (depEndDate > maxDependencyEndDate) {
                   maxDependencyEndDate = new Date(depEndDate);
               }
           }
        });
      }

      // Start date is right after the latest dependency ends (or project start)
      task.startDate = new Date(maxDependencyEndDate);
      
      // End date based on duration (skip weekends logic could go here, keeping simple for now)
      task.endDate = new Date(task.startDate);
      // Rough conversion of days to ms.
      task.endDate.setDate(task.endDate.getDate() + task.durationDays);

      task.computed = true;
      task.computing = false;
      return task.endDate;
    };

    tasks.forEach(t => computeTaskDates(t.id));

    return Array.from(taskMap.values()).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assigned_to_name: t.assigned_to_name,
      estimated_hours: t.estimated_hours,
      dependencies: t.dependencies,
      startDate: t.startDate,
      endDate: t.endDate
    })).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  }
}

module.exports = new GanttService();
