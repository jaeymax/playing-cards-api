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
exports.getUsers = exports.updateUserProfile = exports.getUserProfile = exports.getDivisionInfo = exports.divisions = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const db_1 = __importDefault(require("../config/db"));
exports.divisions = [
    { name: "Rookie", minRating: 0, maxRating: 1199, color: "#9CA3AF" },
    { name: "Contender", minRating: 1200, maxRating: 1399, color: "#22C55E" },
    { name: "Strategist", minRating: 1400, maxRating: 1599, color: "#06B6D4" },
    { name: "Expert", minRating: 1600, maxRating: 1799, color: "#3B82F6" },
    { name: "Master", minRating: 1800, maxRating: 1999, color: "#8B5CF6" },
    { name: "Grandmaster", minRating: 2000, maxRating: 2199, color: "#F97316" },
    { name: "Legend", minRating: 2200, maxRating: 2399, color: "#EF4444" },
    { name: "Spar God", minRating: 2400, maxRating: Infinity, color: "#FBBF24" },
];
const getDivisionInfo = (rating) => {
    var _a, _b, _c;
    const currentIndex = exports.divisions.findIndex((d) => rating >= d.minRating && rating <= d.maxRating);
    const currentDivision = exports.divisions[currentIndex];
    const nextDivision = (_a = exports.divisions[currentIndex + 1]) !== null && _a !== void 0 ? _a : null;
    return {
        rank: currentDivision.name,
        next_rank: (_b = nextDivision === null || nextDivision === void 0 ? void 0 : nextDivision.name) !== null && _b !== void 0 ? _b : null,
        rank_color: currentDivision.color,
        current_rank_min_rating: currentDivision.minRating,
        next_rank_min_rating: (_c = nextDivision === null || nextDivision === void 0 ? void 0 : nextDivision.minRating) !== null && _c !== void 0 ? _c : null,
        rating_to_next_rank: nextDivision
            ? nextDivision.minRating - rating
            : 0,
    };
};
exports.getDivisionInfo = getDivisionInfo;
const getUserProfile = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    console.log("Fetching profile for user ID:", userId);
    if (!userId) {
        res.status(401);
        throw new Error("Not authorized");
    }
    const users = yield (0, db_1.default) `
    WITH RankedUsers AS (
      SELECT
        id,
        RANK() OVER (ORDER BY rating DESC) AS global_rank
      FROM users
      WHERE is_bot = false
        AND is_guest = false
        AND is_rated = true
    ),
    UserProfile AS (
      SELECT
        u.id,
        u.username,
        u.email,
        u.phone,
        u.is_guest,
        u.is_rated,
        u.peak_rating,
        u.max_winning_streak,
        u.podium_finishes,
        u.current_winning_streak,
        u.gold_medals,
        u.silver_medals,
        u.bronze_medals,
        u.tournaments_played,
        u.tournaments_won,
        u.image_url,
        u.games_played,
        u.games_won,
        u.rating,
        u.location,
        u.created_at,
        u.updated_at,
        r.global_rank
      FROM users u
      LEFT JOIN RankedUsers r ON u.id = r.id
      WHERE u.is_bot = false
    )
    SELECT id, username, email, phone, is_guest, is_rated, peak_rating, max_winning_streak, podium_finishes, current_winning_streak, gold_medals, silver_medals, bronze_medals, tournaments_played, tournaments_won, image_url, games_played, games_won, rating, location, created_at, updated_at, global_rank
    FROM UserProfile
    WHERE id = ${userId}
  `;
    if (users.length === 0) {
        res.status(404);
        throw new Error("User not found");
    }
    const user = users[0];
    res.status(200).json(Object.assign(Object.assign({}, user), (0, exports.getDivisionInfo)(user.rating)));
}));
exports.getUserProfile = getUserProfile;
const updateUserProfile = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    if (!userId) {
        res.status(401);
        throw new Error("Not authorized");
    }
    const { phone, location, country } = req.body;
    if (!phone && !country) {
        res.status(400);
        throw new Error("At least one field (phone or country) must be provided");
    }
    const user = yield (0, db_1.default) `
      UPDATE users
      SET 
        phone = COALESCE(${phone}, phone),
        country_code = COALESCE(${country}, country_code),
        updated_at = NOW()
      WHERE id = ${userId}
      RETURNING id, username, email, phone, is_guest, image_url, games_played, games_won, rating, location, created_at, updated_at
    `;
    if (user.length === 0) {
        res.status(404);
        throw new Error("User not found");
    }
    res.status(200).json(user[0]);
}));
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
