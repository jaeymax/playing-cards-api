"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const users_1 = require("../controllers/users");
const router = (0, express_1.Router)();
router.get('/:id', users_1.getUserProfile);
router.put('/:id', users_1.updateUserProfile);
exports.default = router;
