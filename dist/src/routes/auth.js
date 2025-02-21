"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../controllers/auth");
const router = (0, express_1.Router)();
router.post('/', auth_1.registerUser);
router.post('/login', auth_1.loginUser);
//router.get('/', authMiddleware, getUsers);
exports.default = router;
