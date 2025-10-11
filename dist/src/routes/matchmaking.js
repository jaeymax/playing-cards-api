"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const matchmaking_1 = require("../controllers/matchmaking");
const router = (0, express_1.Router)();
router.post("/join", matchmaking_1.joinQueue);
router.post("/leave", matchmaking_1.leaveQueue);
router.post("/games/:id/start", matchmaking_1.startGame);
exports.default = router;
