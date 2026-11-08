const router = require('express').Router();
const pool = require('../config/db');

router.get('/', async (req, res) => {
  let db = 'ok';
  try {
    await pool.query('SELECT 1');
  } catch {
    db = 'down';
  }
  res.json({ status: 'ok', db, uptime: process.uptime() });
});

module.exports = router;
