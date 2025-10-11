"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const leaderboard_1 = require("../controllers/leaderboard");
const router = (0, express_1.Router)();
router.get("/", leaderboard_1.getLeaderboard);
router.get('/topplayers', leaderboard_1.getTopPlayers);
exports.default = router;
