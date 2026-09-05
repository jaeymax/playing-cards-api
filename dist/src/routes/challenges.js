"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const challenges_1 = require("../controllers/challenges");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const router = (0, express_1.Router)();
router.post('/', authMiddleware_1.default, challenges_1.createChallenge);
router.get('/', challenges_1.getChallenges);
router.get('/open', challenges_1.getOpenChallenges);
router.post('/accept', authMiddleware_1.default, challenges_1.acceptChallenge);
router.post('/cancel', authMiddleware_1.default, challenges_1.cancelChallenge);
router.post('/settle', challenges_1.settleCashChallenge);
exports.default = router;
