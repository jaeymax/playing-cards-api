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
exports.sendPushNotification = void 0;
exports.getUserNotificationTokens = getUserNotificationTokens;
exports.sendNotificationToUser = sendNotificationToUser;
const messaging_1 = require("firebase-admin/messaging");
const db_1 = __importDefault(require("../config/db"));
function getUserNotificationTokens(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        const result = yield (0, db_1.default) `
    SELECT
      id,
      token,
      installation_id
    FROM user_fcm_tokens
    WHERE user_id = ${userId}
      AND permission_status = 'granted'
      AND is_active = TRUE
      AND token IS NOT NULL
  `;
        return result;
    });
}
function sendNotificationToUser(userId_1, title_1, body_1) {
    return __awaiter(this, arguments, void 0, function* (userId, title, body, link = "https://www.sparplay.com") {
        const devices = yield getUserNotificationTokens(userId);
        const results = [];
        for (const device of devices) {
            const result = yield (0, exports.sendPushNotification)(device.token, title, body, link);
            if (!result.success) {
                yield (0, db_1.default) `
      UPDATE user_fcm_tokens
      SET
        is_active = FALSE,
        updated_at = NOW()
      WHERE id = ${device.id}
    `;
            }
            results.push(Object.assign({ deviceId: device.id, token: device.token }, result));
        }
        return results;
    });
}
const sendPushNotification = (token_1, title_1, body_1, ...args_1) => __awaiter(void 0, [token_1, title_1, body_1, ...args_1], void 0, function* (token, title, body, link = "https://www.sparplay.com") {
    try {
        const message = {
            token,
            data: {
                title,
                body,
                link,
            },
        };
        const response = yield (0, messaging_1.getMessaging)().send(message);
        return {
            success: true,
            response,
        };
    }
    catch (error) {
        console.error("Error sending push notification:", error);
        return {
            success: false,
            error,
        };
    }
});
exports.sendPushNotification = sendPushNotification;
