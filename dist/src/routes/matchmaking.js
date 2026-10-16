"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const matchmaking_1 = require("../controllers/matchmaking");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const router = (0, express_1.Router)();
router.post("/join", authMiddleware_1.default, matchmaking_1.joinQueue);
router.post("/leave", authMiddleware_1.default, matchmaking_1.leaveQueue);
router.post("/games/:id/start", authMiddleware_1.default, matchmaking_1.startGame);
exports.default = router;
