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
exports.getOnlineUserCountController = exports.getOnlineUsersWithStatusController = exports.getOnlineUsers = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const presenceService_1 = require("../services/presenceService");
const db_1 = __importDefault(require("../config/db"));
const users_1 = require("./users");
exports.getOnlineUsers = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userIds = yield (0, presenceService_1.getOnlineUserIds)();
    if (userIds.length === 0) {
        res.status(200).json({
            success: true,
            players: [],
            count: 0,
        });
        return;
    }
    const players = yield (0, db_1.default) `
      SELECT
        id,
        username,
        image_url,
        rating,
        online_status
      FROM users
      WHERE id = ANY(${userIds.map(Number)})
      ORDER BY rating DESC
    `;
    res.status(200).json({
        success: true,
        players,
        count: players.length,
    });
}));
exports.getOnlineUsersWithStatusController = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userIds = yield (0, presenceService_1.getOnlineUsersWithStatus)();
    const currentUserId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    console.log("userIds", userIds);
    if (userIds.length === 0) {
        res.status(200).json({
            success: true,
            players: [],
            count: 0,
        });
        return;
    }
    const players = yield (0, db_1.default) `
      SELECT
        id,
        username,
        image_url,
        rating,
        online_status
      FROM users
      WHERE id = ANY(${userIds.filter((user) => user.userId != currentUserId).map((user) => Number(user.userId))})
      ORDER BY rating DESC
    `;
    const playersWithStatus = players.map((player) => {
        const userStatus = userIds.find((user) => Number(user.userId) === player.id);
        return Object.assign(Object.assign(Object.assign({}, player), (0, users_1.getDivisionInfo)(player.rating)), { status: userStatus === null || userStatus === void 0 ? void 0 : userStatus.status });
    });
    res.status(200).json({
        success: true,
        players: playersWithStatus,
        count: playersWithStatus.length,
    });
}));
exports.getOnlineUserCountController = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const count = yield (0, presenceService_1.getOnlineUserCount)();
    res.status(200).json({
        success: true,
        count,
    });
}));
