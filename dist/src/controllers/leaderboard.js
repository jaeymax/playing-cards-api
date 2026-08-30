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
exports.getTopPlayers = exports.getLeaderboard = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const db_1 = __importDefault(require("../config/db"));
const users_1 = require("./users");
const getTopPlayers = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    //res.json({message:"get Leaderboard controller"});
    // select * from users where is_guest = false AND is_bot = false ORDER by rating DESC;
    const topPlayers = yield (0, db_1.default) `
          SELECT username, image_url, rating,
          RANK() OVER (ORDER BY rating DESC) as global_rank
          FROM users 
          WHERE is_guest = false 
          AND is_bot = false 
          AND is_rated = true
          ORDER BY rating DESC
          LIMIT 5
      `;
    const enrichedTopPlayers = topPlayers.map((player) => {
        return Object.assign(Object.assign({}, player), (0, users_1.getDivisionInfo)(player.rating));
    });
    res.json(enrichedTopPlayers);
}));
exports.getTopPlayers = getTopPlayers;
const getLeaderboard = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const leaderboard = yield (0, db_1.default) `
        SELECT 
            username, 
            image_url, 
            rating,
            CASE
                WHEN games_played = 0 THEN 0
                ELSE ROUND((games_won::decimal / games_played) * 100, 2)
            END as win_rate,
            RANK() OVER (ORDER BY rating DESC) as global_rank
        FROM users 
        WHERE is_guest = false 
        AND is_bot = false 
        AND is_rated = true
        ORDER BY rating DESC
    `;
    // enrich the leaderboard data with player_rank and rank_color data
    const enrichedLeaderboard = leaderboard.map((player) => {
        return Object.assign(Object.assign({}, player), (0, users_1.getDivisionInfo)(player.rating));
    });
    res.json(enrichedLeaderboard);
}));
exports.getLeaderboard = getLeaderboard;
