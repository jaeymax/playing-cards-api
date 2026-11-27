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
const express_async_handler_1 = __importDefault(require("express-async-handler"));
exports.getUserNotifications = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    console.log("Fetching notifications for user ID:", id);
    if (!id) {
        res.status(400).json({ message: "User ID is required." });
        return;
    }
    const notifications = yield (0, db_1.default) `
    SELECT 
        n.id,
        n.type,
        n.title,
        n.message,
        n.is_read,
        n.action,
        n.reference_id,
        n.actor_id,
        n.created_at,

        CASE
            WHEN n.type = 'friend' THEN
                json_build_object(
                    'id', u.id,
                    'username', u.username,
                    'image_url', u.image_url
                )
            ELSE NULL
        END AS actor,

        CASE
            WHEN n.type = 'achievement' THEN
                json_build_object(
                    'id', a.id,
                    'name', a.name,
                    'description', a.description,
                    'icon', a.icon
                )
            ELSE NULL
        END AS reference

    FROM notifications n

    LEFT JOIN users u
        ON u.id = n.actor_id
        AND n.type = 'friend'

    LEFT JOIN achievements a
        ON a.id = n.reference_id
        AND n.type = 'achievement'

    WHERE n.user_id = ${id}

    ORDER BY n.created_at DESC
`;
    res.json(notifications);
}));
exports.markNotificationAsRead = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { notificationId } = req.params;
    yield (0, db_1.default) `
        UPDATE notifications
        SET is_read = TRUE
        WHERE id = ${notificationId}
    `;
    res.status(200).json({ message: "Notification marked as read." });
}));
exports.markAllNotificationsAsRead = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    yield (0, db_1.default) `
        UPDATE notifications
        SET is_read = TRUE
        WHERE user_id = ${userId}
    `;
    res.status(200).json({ message: "All notifications marked as read." });
}));
exports.deleteNotification = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { notificationId } = req.params;
    yield (0, db_1.default) `
        DELETE FROM notifications
        WHERE id = ${notificationId}
    `;
    res.status(200).json({ message: "Notification deleted." });
}));
exports.deleteAllNotifications = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.params;
    yield (0, db_1.default) `
        DELETE FROM notifications
        WHERE user_id = ${userId}
    `;
    res.status(200).json({ message: "All notifications deleted." });
}));
