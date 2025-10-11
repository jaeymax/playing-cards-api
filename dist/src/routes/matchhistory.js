"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const matchhistory_1 = require("../controllers/matchhistory");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.default, matchhistory_1.getMatchHistory);
router.get('/recent', authMiddleware_1.default, matchhistory_1.getRecentMatchHistory);
exports.default = router;
