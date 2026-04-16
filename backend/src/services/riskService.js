const db = require('../config/db');
const mailService = require('./mailService');

/**
 * Service to calculate project risk scores based on historical and current task data.
 */
class RiskService {
  /**
   * Calculates the risk score and predicted delay for a project.
   * @param {string} projectId UUID of the project
   * @returns {Promise<{riskScore: number, predictedDelayDays: number, reason: string}>}
   */
  async predictRisk(projectId) {
    // 1. Fetch all tasks for the project
    const tasksResult = await db.query(
      'SELECT id, estimated_hours, actual_hours, status, due_date FROM tasks WHERE project_id = $1',
      [projectId]
    );

    const tasks = tasksResult.rows;

    if (tasks.length === 0) {
      return { riskScore: 0, predictedDelayDays: 0, reason: 'No tasks to analyze.' };
    }

    let totalEstimatedCompleted = 0;
    let totalActualCompleted = 0;
    let totalEstimatedRemaining = 0;
    let overdueTasksCount = 0;

    const now = new Date();

    tasks.forEach(task => {
      // Completed Tasks
      if (task.status === 'done') {
        const est = Number(task.estimated_hours) || 0;
        const act = Number(task.actual_hours) || 0;
        totalEstimatedCompleted += est;
        totalActualCompleted += act;
      } else {
        // Incomplete Tasks
        const est = Number(task.estimated_hours) || 0;
        totalEstimatedRemaining += est;

        // Overdue Check
        if (task.due_date && new Date(task.due_date) < now) {
          overdueTasksCount += 1;
        }
      }
    });

    // 2. Calculate Efficiency Factor (E = Actual / Estimated)
    let efficiencyFactor = 1.0; 
    if (totalEstimatedCompleted > 0) {
      // Cap efficiency to avoid wild swings from outliers, or handle zero division gracefully
      efficiencyFactor = totalActualCompleted / totalEstimatedCompleted;
    }

    // 3. Predict Delay 
    // Delay = (E * RemainingHours) - RemainingHours
    // If E > 1, we are slower than expected.
    let predictedAdditionalHours = (efficiencyFactor * totalEstimatedRemaining) - totalEstimatedRemaining;
    if (predictedAdditionalHours < 0) predictedAdditionalHours = 0; // We don't predict early finishes for risk

    // Convert hours to standard 8-hour workdays
    let predictedDelayDays = predictedAdditionalHours / 8;

    // 4. Overdue Penalty (e.g., add 0.5 days perceived delay weight per overdue task)
    predictedDelayDays += (overdueTasksCount * 0.5);

    // 5. Calculate normalized Risk Score (0.0 to 1.0)
    // Formula: sigmoid-like function or linear capping
    // Let's say 10+ days delay is max risk (1.0)
    let riskScore = predictedDelayDays / 10;
    if (riskScore > 1.0) riskScore = 1.0;
    if (riskScore < 0.0) riskScore = 0.0;

    // 6. Generate explainable reason
    let reasonParts = [];
    if (efficiencyFactor > 1.1) {
      reasonParts.push(`Completed tasks took ${((efficiencyFactor - 1) * 100).toFixed(0)}% longer than estimated.`);
    }
    if (overdueTasksCount > 0) {
      reasonParts.push(`There are ${overdueTasksCount} overdue task(s).`);
    }

    if (reasonParts.length === 0 && predictedDelayDays > 0) {
      reasonParts.push('Predicted delay based on standard baseline.');
    } else if (reasonParts.length === 0) {
      reasonParts.push('Project is tracking well against estimates.');
    }

    return {
      riskScore: Number(riskScore.toFixed(2)),
      predictedDelayDays: Number(predictedDelayDays.toFixed(1)),
      reason: reasonParts.join(' ')
    };
  }

  /**
   * Updates the project table with the latest calculated risk score
   */
  async updateProjectRiskScore(projectId) {
    const riskData = await this.predictRisk(projectId);
    
    await db.query(
      'UPDATE projects SET risk_score = $1 WHERE id = $2',
      [riskData.riskScore, projectId]
    );
    
    await db.query(
      'INSERT INTO risk_snapshots (project_id, risk_score, predicted_delay_days) VALUES ($1, $2, $3)',
      [projectId, riskData.riskScore, riskData.predictedDelayDays]
    );

    // High Risk Notification
    if (riskData.riskScore >= 0.6) {
      (async () => {
        try {
          const projectRes = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
          if (projectRes.rows[0]) {
            await mailService.sendRiskAlertEmail(projectRes.rows[0], riskData);
          }
        } catch (err) {
          console.error('Failed to send risk alert email:', err);
        }
      })();
    }

    return riskData;
  }
}

module.exports = new RiskService();
