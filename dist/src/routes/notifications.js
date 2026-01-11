"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const notifications_1 = require("../controllers/notifications");
const router = express_1.default.Router();
router.get("/user/:userId", authMiddleware_1.default, notifications_1.getUserNotifications);
router.post("/mark-as-read/:notificationId", authMiddleware_1.default, notifications_1.markNotificationAsRead);
exports.default = router;
