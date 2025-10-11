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
const getTopPlayers = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    //res.json({message:"get Leaderboard controller"});
    // select * from users where is_guest = false AND is_bot = false ORDER by rating DESC;
    const topPlayers = yield (0, db_1.default) `
          SELECT username, image_url, rating FROM users 
          WHERE is_guest = false 
          AND is_bot = false 
          ORDER BY rating DESC
          LIMIT 5
      `;
    res.json(topPlayers);
}));
exports.getTopPlayers = getTopPlayers;
const getLeaderboard = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    // select * from users where is_guest = false AND is_bot = false ORDER by rating DESC;
    const leaderboard = yield (0, db_1.default) `
        SELECT * FROM users 
        WHERE is_guest = false 
        AND is_bot = false 
        ORDER BY rating DESC
    `;
    res.json(leaderboard);
}));
exports.getLeaderboard = getLeaderboard;
