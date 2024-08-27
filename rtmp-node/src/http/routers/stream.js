const { Router } = require('express');
const { Handler } = require('./handler');
const { StreamController } = require('../controllers');

const router = Router();

router.post('/', Handler(StreamController.createStream));
router.get('/', Handler(StreamController.getStreams));
router.get('/:app/:stream', Handler(StreamController.getStream));
router.delete('/:app/:stream', Handler(StreamController.deleteStream));

module.exports = router;
