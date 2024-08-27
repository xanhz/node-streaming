const { Router } = require('express');
const { Handler } = require('./handler');
const { ServerController } = require('../controllers');

const router = Router();

router.get('/', Handler(ServerController.info));

module.exports = router;
