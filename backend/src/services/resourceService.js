const db = require('../config/db');

/**
 * Service to manage resource allocation and workload analysis.
 */
class ResourceService {
  /**
   * Get all team members along with their current workload and skills.
   */
  async getTeamWorkload() {
    const query = `
      SELECT 
        tm.id, 
        tm.name, 
        tm.email, 
        tm.role, 
        tm.availability_hours,
        COALESCE((
          SELECT SUM(t.estimated_hours) 
          FROM tasks t 
          WHERE t.assigned_to = tm.id AND t.status != 'done'
        ), 0) as current_workload_hours,
        COALESCE((
          SELECT json_agg(s.name) 
          FROM member_skills ms 
          JOIN skills s ON ms.skill_id = s.id 
          WHERE ms.member_id = tm.id
        ), '[]') as skills
      FROM team_members tm
      ORDER BY tm.name ASC
    `;

    const result = await db.query(query);
    return result.rows;
  }

  /**
   * Assign a task to a team member.
   */
  async assignTask(taskId, memberId) {
    await db.query(
      'UPDATE tasks SET assigned_to = $1 WHERE id = $2',
      [memberId, taskId]
    );
    return { success: true };
  }

  /**
   * Get tasks assigned to a specific member across all projects.
   * Includes basic task fields + project name + assignee display name.
   */
  async getTasksByMember(memberId) {
    const query = `
      SELECT
        t.*,
        p.name AS project_name,
        tm.name AS assigned_to_name,
        COALESCE(dep.dependencies, '[]') AS dependencies
      FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      LEFT JOIN team_members tm ON t.assigned_to = tm.id
      LEFT JOIN (
        SELECT
          td.task_id,
          json_agg(
            json_build_object('depends_on', td.depends_on_task_id)
          ) FILTER (WHERE td.depends_on_task_id IS NOT NULL) AS dependencies
        FROM task_dependencies td
        GROUP BY td.task_id
      ) dep ON dep.task_id = t.id
      WHERE t.assigned_to = $1
      ORDER BY t.created_at ASC
    `;

    const result = await db.query(query, [memberId]);
    return result.rows;
  }

  /**
   * Set skills for a member (replaces existing skills).
   * @param {string} memberId 
   * @param {string[]} skillsArray 
   */
  async upsertMemberSkills(memberId, skillsArray) {
    if (!Array.isArray(skillsArray)) return;

    // 1. Remove current skills
    await db.query('DELETE FROM member_skills WHERE member_id = $1', [memberId]);

    for (const skillName of skillsArray) {
      const trimmedName = skillName.trim().toLowerCase();
      if (!trimmedName) continue;

      // 2. Upsert skill into 'skills' table
      const skillResult = await db.query(
        'INSERT INTO skills (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id',
        [trimmedName]
      );
      const skillId = skillResult.rows[0].id;

      // 3. Link skill to member
      await db.query(
        'INSERT INTO member_skills (member_id, skill_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [memberId, skillId]
      );
    }
  }
}

module.exports = new ResourceService();
