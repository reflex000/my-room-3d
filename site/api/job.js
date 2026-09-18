/* GET /api/job?token=… → current status of a signed job token (works from any device: the token is the ticket). */
const { verifyJob, jobStatus } = require('./_lib.js');

module.exports = (req, res) => {
  const job = verifyJob(req.query && req.query.token);
  if (!job) { res.status(404).json({ error: 'unknown or tampered ticket' }); return; }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json(jobStatus(job));
};
