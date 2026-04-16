const nodemailer = require('nodemailer');

/**
 * Get nodemailer transporter
 */
const getTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_PORT === '465',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    // Serverless optimization: lower timeouts and pooled connections
    connectionTimeout: 10000, 
    greetingTimeout: 5000,
    socketTimeout: 15000,
    tls: {
      rejectUnauthorized: false
    }
  });
};

/**
 * Send an email
 */
async function sendEmail({ to, subject, html }) {
  if (!to) return null;
  const transporter = getTransporter();
  
  try {
    // Verify connection before sending in production
    if (process.env.NODE_ENV === 'production') {
      await transporter.verify();
    }
    
    const info = await transporter.sendMail({
      from: `"PlanAI" <${process.env.SMTP_FROM || 'no-reply@planai.com'}>`,
      to,
      subject,
      html,
    });
    console.log('✅ Email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Email failed:', error);
    // Log more detail for debugging on Vercel
    if (error.code) console.error('Error Code:', error.code);
    if (error.command) console.error('Error Command:', error.command);
    return null;
  }
}

/**
 * Notify manager of project creation
 */
async function sendProjectConfirmationEmail(manager, project) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #6366f1;">Project Started! 🚀</h2>
      <p>Hello <strong>${manager.name}</strong>,</p>
      <p>Your new project <strong>${project.name}</strong> has been successfully created in the system.</p>
      
      <div style="background: #f0fdf4; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #dcfce7;">
        <h3 style="margin-top: 0; color: #166534;">${project.name}</h3>
        <p style="color: #666;">${project.description || 'No description provided.'}</p>
        <hr style="border: none; border-top: 1px solid #dcfce7;" />
        <p><strong>📅 Timeline:</strong> ${project.start_date || 'N/A'} to ${project.end_date || 'N/A'}</p>
      </div>

      <p>The AI system is now monitoring this project for risks and performance.</p>
      <div style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Sent via AI Project Management System.
      </div>
    </div>
  `;

  return sendEmail({
    to: manager.email,
    subject: `Project Confirmed: ${project.name}`,
    html
  });
}

/**
 * Notify member of a new task assignment
 */
async function sendTaskAssignmentEmail(member, task, project) {
  if (!member.email) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #6366f1;">New Task Assigned! 🎯</h2>
      <p>Hello <strong>${member.name}</strong>,</p>
      <p>A new task has been assigned to you in project: <strong>${project.name}</strong>.</p>
      
      <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; margin: 20px 0;">
        <h3 style="margin-top: 0;">${task.title}</h3>
        <p style="color: #666;">${task.description || 'No description provided.'}</p>
        <hr style="border: none; border-top: 1px solid #ddd;" />
        <p><strong>⏱️ Estimated:</strong> ${task.estimated_hours}h</p>
        <p><strong>📅 Due Date:</strong> ${task.due_date ? new Date(task.due_date).toLocaleDateString() : 'None set'}</p>
      </div>

      <p>Good luck!</p>
      <div style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Sent via AI Project Management System.
      </div>
    </div>
  `;

  return sendEmail({
    to: member.email,
    subject: `New Task: ${task.title}`,
    html
  });
}

/**
 * Notify member of task updates
 */
async function sendTaskUpdateEmail(member, task, project, changes) {
  if (!member.email) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h3 style="color: #f59e0b;">Task Updated ⚙️</h3>
      <p>Hello <strong>${member.name}</strong>,</p>
      <p>Your assigned task <strong>${task.title}</strong> in project <strong>${project.name}</strong> has been updated.</p>
      
      <div style="background: #fffbeb; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fef3c7;">
        <p style="margin: 0;"><strong>Updates:</strong> ${changes}</p>
      </div>

      <div style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Sent via AI Project Management System.
      </div>
    </div>
  `;

  return sendEmail({
    to: member.email,
    subject: `Update on Task: ${task.title}`,
    html
  });
}

/**
 * Daily reminder for overdue tasks
 */
async function sendOverdueReminderEmail(member, tasks) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #fecaca; border-radius: 10px;">
      <h2 style="color: #dc2626;">Overdue Task Reminder ⚠️</h2>
      <p>Hello <strong>${member.name}</strong>,</p>
      <p>You have items that require immediate attention:</p>
      
      ${tasks.map(t => `
        <div style="background: #fef2f2; padding: 12px; border-radius: 6px; margin: 10px 0; border: 1px solid #fee2e2;">
          <strong style="display: block;">${t.title}</strong>
          <span style="font-size: 12px; color: #7f1d1d;">Project: ${t.project_name} | Due: ${new Date(t.due_date).toLocaleDateString()}</span>
        </div>
      `).join('')}

      <p>Please update their status or request an extension if needed.</p>
    </div>
  `;

  return sendEmail({
    to: member.email,
    subject: `Overdue Tasks: ${tasks.length} items need attention`,
    html
  });
}

/**
 * Notify stakeholders of high project risk
 */
async function sendRiskAlertEmail(to, project, riskData) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ef4444; border-radius: 10px;">
      <h2 style="color: #ef4444;">🚨 High Risk Alert</h2>
      <p>AI analysis has detected critical risks for project: <strong>${project.name}</strong>.</p>
      
      <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fee2e2;">
        <p><strong>🔥 Risk Score:</strong> ${(riskData.riskScore * 100).toFixed(0)}%</p>
        <p><strong>⏳ Expected Delay:</strong> ${riskData.predictedDelayDays} days</p>
        <p><strong>📝 AI Analysis:</strong> ${riskData.reason}</p>
      </div>

      <p><strong>Action Required:</strong> Please review resources and task dependencies to mitigate these risks.</p>
    </div>
  `;

  return sendEmail({
    to,
    subject: `⚠️ URGENT: High Risk for ${project.name}`,
    html
  });
}

/**
 * Monday morning portfolio summary for managers
 */
async function sendWeeklyRecapEmail(manager, stats) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
      <h2 style="color: #6366f1;">Your Weekly Portfolio Recap 📊</h2>
      <p>Hello <strong>${manager.name}</strong>, here is how your projects are tracking this week:</p>
      
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 20px 0;">
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
          <span style="display: block; font-size: 24px; font-weight: bold; color: #6366f1;">${stats.totalProjects}</span>
          <span style="font-size: 12px; color: #64748b;">Active Projects</span>
        </div>
        <div style="background: #f8fafc; padding: 15px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
          <span style="display: block; font-size: 24px; font-weight: bold; color: #10b981;">${stats.completedTasks}</span>
          <span style="font-size: 12px; color: #64748b;">Tasks Finished</span>
        </div>
      </div>

      <h3 style="border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">Project Highlights</h3>
      ${stats.projectSummaries.map(p => `
        <div style="margin-bottom: 15px;">
          <strong>${p.name}</strong> — ${p.completion}% complete
          <div style="height: 6px; background: #e2e8f0; border-radius: 3px; margin: 5px 0;">
            <div style="height: 100%; width: ${p.completion}%; background: #6366f1; border-radius: 3px;"></div>
          </div>
          ${p.overdueCount > 0 ? `<span style="font-size: 11px; color: #ef4444;">⚠️ ${p.overdueCount} tasks overdue</span>` : ''}
        </div>
      `).join('')}

      <p style="margin-top: 25px;">Log in to the dashboard for a full breakdown.</p>
    </div>
  `;

  return sendEmail({
    to: manager.email,
    subject: `Weekly Portfolio Recap: ${stats.totalProjects} Active Projects`,
    html
  });
}

module.exports = {
  sendEmail,
  sendProjectConfirmationEmail,
  sendTaskAssignmentEmail,
  sendTaskUpdateEmail,
  sendOverdueReminderEmail,
  sendRiskAlertEmail,
  sendWeeklyRecapEmail
};
