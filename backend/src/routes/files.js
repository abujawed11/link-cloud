const router = require('express').Router();
const c = require('../controllers/fileController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);
router.get('/', c.list);
router.get('/:id/download', c.download);
router.delete('/:id', c.remove);

module.exports = router;
