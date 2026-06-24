"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const notifications_1 = require("../controllers/notifications");
const db_1 = __importDefault(require("../config/db"));
const router = express_1.default.Router();
router.get("/user/:id", authMiddleware_1.default, notifications_1.getUserNotifications);
router.post("/mark-as-read/:notificationId", authMiddleware_1.default, notifications_1.markNotificationAsRead);
router.post("/register", authMiddleware_1.default, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // Placeholder for notification registration logic
    const userId = req.user.id; // Assuming user ID is available in the request object after authentication
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ message: "Token is required" });
    }
    // update the user's push_token and notification_enabled in the database
    yield (0, db_1.default) `UPDATE users SET push_token = ${token}, notification_enabled = 'true' WHERE id = ${userId}`;
    res.status(200).json({ message: "Notification registered successfully" });
}));
exports.default = router;
