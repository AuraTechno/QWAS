// Email sender. SMTP не настроен — логируем.
const logger = require("./logger");

async function sendEmail(job) {
  if (!job || !job.to) {
    logger.warn("sendEmail: missing 'to'");
    return;
  }
  if (process.env.SMTP_HOST) {
    // TODO: nodemailer transport
    logger.info(`[email] would send to ${job.to}: ${job.subject || "(no subject)"}`);
  } else {
    logger.info(`[email stub] to=${job.to} subject="${job.subject || ''}" preview="${(job.text || '').slice(0, 80)}…"`);
  }
}

module.exports = { sendEmail };
