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
exports.getUsers = exports.updateUserProfile = exports.getUserProfile = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const db_1 = __importDefault(require("../config/db"));
const getUserProfile = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    console.log("request", req.user);
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId) {
        res.status(401);
        throw new Error("Not authorized");
    }
    const users = yield (0, db_1.default) `
    WITH UserRank AS (
      SELECT id, username, email, image_url, games_played, games_won, rating, location, created_at, updated_at,
             RANK() OVER (ORDER BY rating DESC) as rank
      FROM users Where is_guest = false and is_bot = false
    )
    SELECT *
    FROM UserRank
    WHERE id = ${userId}
  `;
    if (users.length === 0) {
        res.status(404);
        throw new Error("User not found");
    }
    res.status(200).json(users[0]);
}));
exports.getUserProfile = getUserProfile;
const updateUserProfile = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.status(200).json({ message: "update user profile controller" });
});
exports.updateUserProfile = updateUserProfile;
const getUsers = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    const users = yield (0, db_1.default) `
    SELECT 
      id, 
      username, 
      image_url, 
      rating, 
      location, 
      games_played, 
      games_won, 
      created_at
    FROM users
    ORDER BY rating DESC
    LIMIT ${limit} OFFSET ${offset}
  `;
    const totalUsers = yield (0, db_1.default) `SELECT COUNT(*) FROM users`;
    const total = totalUsers[0].count;
    res.status(200).json({
        success: true,
        users,
        pagination: {
            total,
            page,
            pages: Math.ceil(total / limit),
        },
    });
}));
exports.getUsers = getUsers;
