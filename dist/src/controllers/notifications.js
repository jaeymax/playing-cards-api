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
exports.deleteAllNotifications = exports.deleteNotification = exports.markAllNotificationsAsRead = exports.markNotificationAsRead = exports.getUserNotifications = void 0;
const db_1 = __importDefault(require("../config/db"));
const getUserNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    const notifications = yield (0, db_1.default) `
        SELECT 
            n.id,
            n.type,
            n.title,
            n.message,
            n.is_read,
            n.action,
            n.created_at as timestamp
        FROM notifications n
        WHERE n.user_id = ${userId}
        ORDER BY n.created_at DESC
    `;
    res.json(notifications);
});
exports.getUserNotifications = getUserNotifications;
const markNotificationAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { notificationId } = req.params;
    yield (0, db_1.default) `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ${notificationId}
    `;
    res.status(200).json({ message: "Notification marked as read." });
});
exports.markNotificationAsRead = markNotificationAsRead;
const markAllNotificationsAsRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    yield (0, db_1.default) `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = ${userId}
    `;
    res.status(200).json({ message: "All notifications marked as read." });
});
exports.markAllNotificationsAsRead = markAllNotificationsAsRead;
const deleteNotification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { notificationId } = req.params;
    yield (0, db_1.default) `
        DELETE FROM notifications
        WHERE id = ${notificationId}
    `;
    res.status(200).json({ message: "Notification deleted." });
});
exports.deleteNotification = deleteNotification;
const deleteAllNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    yield (0, db_1.default) `
        DELETE FROM notifications
        WHERE user_id = ${userId}
    `;
    res.status(200).json({ message: "All notifications deleted." });
});
exports.deleteAllNotifications = deleteAllNotifications;
