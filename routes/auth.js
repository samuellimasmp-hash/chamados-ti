const express = require('express');
const auth = require('../controllers/authController');

const router = express.Router();

router.get('/login', auth.loginPage);
router.post('/auth/session', auth.createSession);
router.post('/auth/logout', auth.logout);

module.exports = router;
