const express = require('express');
const harnessRoutes = require('./routes/harness');

const router = express.Router();

// Mount harness profile CRUD routes at /api/custom-harness/
router.use('/', harnessRoutes);

module.exports = router;
