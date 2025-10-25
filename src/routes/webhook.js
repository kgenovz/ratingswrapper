/**
 * Webhook routes for receiving alerts and notifications
 * Handles Prometheus Alertmanager webhooks
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

/**
 * POST /api/webhook/alerts
 * Receives alerts from Prometheus Alertmanager
 *
 * Alertmanager sends POST requests with JSON body containing alerts
 * Format: { alerts: [...], status: "firing|resolved", ... }
 */
router.post('/api/webhook/alerts', (req, res) => {
  try {
    const { alerts, status, groupLabels } = req.body;

    if (!alerts || !Array.isArray(alerts)) {
      logger.warn('Invalid alert webhook payload received');
      return res.status(400).json({ error: 'Invalid payload' });
    }

    // Log each alert
    alerts.forEach(alert => {
      const { labels, annotations, status, startsAt, endsAt } = alert;

      const logData = {
        status: status || 'unknown',
        severity: labels.severity || 'unknown',
        component: labels.component || 'unknown',
        alertname: labels.alertname || 'unknown',
        summary: annotations.summary || 'No summary',
        description: annotations.description || 'No description',
        startsAt,
        endsAt: endsAt || null
      };

      if (status === 'firing') {
        logger.warn(`🚨 ALERT FIRING: ${logData.alertname}`, logData);
      } else if (status === 'resolved') {
        logger.info(`✅ ALERT RESOLVED: ${logData.alertname}`, logData);
      }
    });

    // TODO: Add integrations here
    // - Send to Slack: await sendToSlack(alerts)
    // - Send email: await sendEmail(alerts)
    // - Send to Discord: await sendToDiscord(alerts)
    // - Store in database: await storeAlerts(alerts)

    res.status(200).json({
      message: 'Alerts received',
      count: alerts.length,
      status
    });

  } catch (error) {
    logger.error('Error processing alert webhook:', error.message);
    res.status(500).json({ error: 'Failed to process alerts' });
  }
});

/**
 * GET /api/webhook/test
 * Test endpoint to verify webhook is accessible
 */
router.get('/api/webhook/test', (req, res) => {
  res.json({
    message: 'Webhook endpoint is operational',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
