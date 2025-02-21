"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const game_1 = require("../controllers/game");
const router = (0, express_1.Router)();
router.post('/create', game_1.createGame);
router.get('/join', game_1.joinGame);
exports.default = router;
