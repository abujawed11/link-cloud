const router = require('express').Router();
const c = require('../controllers/jobController');
const { requireAuth } = require('../middleware/auth');
const { jobLimiter } = require('../middleware/rateLimit');

router.use(requireAuth);
router.post('/', jobLimiter, c.create);
router.get('/', c.list);
router.delete('/finished', c.clearFinished); // must come before /:id
router.get('/usage', c.usage);
router.get('/events', c.eventsAll); // must come before /:id
router.get('/:id', c.get);
router.get('/:id/events', c.eventsOne);
router.post('/:id/cancel', c.cancel);
router.post('/:id/pause', c.pause);
router.post('/:id/resume', jobLimiter, c.resume);
router.post('/:id/retry', jobLimiter, c.retry);
router.delete('/:id', c.remove);

module.exports = router;
