const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  }
});

/**
 * Send an email
 */
async function sendEmail({ to, subject, html }) {
  try {
    const info = await transporter.sendMail({
      from: `"PlanAI" <${process.env.SMTP_FROM}>`,
      to,
      subject,
      html,
    });
    console.log('✅ Email sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('❌ Email failed:', error);
    // Don't throw, just log to prevent breaking main flow
    return null;
  }
}

/**
 * Notify member of a new task assignment
 */
async function sendTaskAssignmentEmail(member, task, project) {
  if (!member.email) return;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
      <h2 style="color: #6366f1;">New Task Assigned! 🚀</h2>
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
 * Notify stakeholders of high project risk
 */
async function sendRiskAlertEmail(project, riskData) {
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ef4444; border-radius: 10px;">
      <h2 style="color: #ef4444;">⚠️ Project Risk Alert</h2>
      <p>The AI system has detected a high risk for project: <strong>${project.name}</strong>.</p>
      
      <div style="background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border: 1px solid #fee2e2;">
        <p><strong>🔥 Risk Score:</strong> ${(riskData.riskScore * 100).toFixed(0)}%</p>
        <p><strong>⏳ Predicted Delay:</strong> ${riskData.predictedDelayDays} days</p>
        <p><strong>📝 Reason:</strong> ${riskData.reason}</p>
      </div>

      <p>Please review the project status and consider re-allocating resources.</p>
      <div style="font-size: 12px; color: #999; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
        Sent via AI Project Management System.
      </div>
    </div>
  `;

  return sendEmail({
    to: process.env.SMTP_USER, // Sending to the lead/admin email for now
    subject: `⚠️ HIGH RISK: ${project.name}`,
    html
  });
}

module.exports = {
  sendEmail,
  sendTaskAssignmentEmail,
  sendRiskAlertEmail
};
