const router = require('express').Router();
const c = require('../controllers/fileController');
const { requireAuth, requireAuthQueryOrCookie } = require('../middleware/auth');

router.get('/', requireAuth, c.list);
router.get('/:id/download', requireAuth, c.download);
// Accepts ?token= as well as the cookie - see requireAuthQueryOrCookie's
// comment in middleware/auth.js for why this one route is different.
router.get('/:id/stream', requireAuthQueryOrCookie, c.stream);
router.delete('/:id', requireAuth, c.remove);

module.exports = router;
