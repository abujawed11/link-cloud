const router = require('express').Router();
const c = require('../controllers/jobController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
router.post('/', c.create);
router.get('/', c.list);
router.get('/:id', c.get);

module.exports = router;
