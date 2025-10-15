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
exports.startGame = exports.leaveQueue = exports.joinQueue = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const db_1 = __importDefault(require("../config/db"));
const index_1 = require("../index");
const index_2 = require("../index");
const gameFunctions_1 = require("../utils/gameFunctions");
const __1 = require("..");
exports.joinQueue = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId, rating } = req.body;
    if (!userId || !rating) {
        res.status(400).json({ error: "User ID and rating are required" });
        return;
    }
    yield index_1.matchmaker.addToQueue(userId, rating || 1000);
    res.json({ success: true });
}));
exports.leaveQueue = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { userId } = req.body;
    yield index_1.matchmaker.removeFromQueue(userId);
    res.json({ success: true });
}));
exports.startGame = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const gameId = req.params.id;
    // get gamecode from games by id
    const gameCode = yield (0, db_1.default) `SELECT code FROM games WHERE id = ${gameId}`;
    if (gameCode.length === 0) {
        res.status(404).json({ error: "Game not found" });
        return;
    }
    console.log(gameCode);
    try {
        yield db_1.default
            .transaction((sql) => [
            sql `UPDATE games SET status = 'in_progress' WHERE id = ${gameId}`,
            sql `UPDATE games SET started_at = NOW() WHERE id = ${gameId}`,
        ]);
        const gameData = yield (0, db_1.default) `
      SELECT 
        g.id,
        g.code,
        g.created_by,
        g.status,
        g.win_points,
        g.player_count,
        g.current_hand_number,
        g.current_player_position,
        g.round_number,
        g.created_at,
        g.started_at,
        g.is_rated,
        g.ended_at
      FROM games g
      WHERE g.id = ${gameId}
    `;
        const players = yield (0, db_1.default) `
      SELECT 
        gp.id,
        gp.game_id,
        gp.score,
        gp.games_won,
        gp.position,
        gp.is_dealer,
        gp.status,
        json_build_object(
          'id', u.id,
          'username', u.username,
          'image_url', u.image_url,
          'rating', u.rating
        ) as user
      FROM game_players gp
      JOIN users u ON u.id = gp.user_id
      WHERE gp.game_id = ${gameId}
      ORDER BY gp.position
    `;
        const cards = yield (0, db_1.default) `
      SELECT 
        gc.id,
        gc.game_id,
        gc.player_id,
        gc.status,
        gc.hand_position,
        gc.trick_number,
        gc.pos_x,
        gc.pos_y,
        gc.rotation,
        gc.z_index,
        gc.animation_state,
        json_build_object(
          'card_id', c.card_id,
          'suit', c.suit,
          'value', c.value,
          'rank', c.rank,
          'image_url', c.image_url
        ) as card
      FROM game_cards gc
      JOIN cards c ON c.card_id = gc.card_id
      WHERE gc.game_id = ${gameId}
    `;
        const game = Object.assign(Object.assign({}, gameData[0]), { players: players, cards: cards });
        __1.mixpanel.track("Game Started", {
            distinct_id: gameData[0].created_by,
            game_code: gameCode[0].code,
            num_players: players.length,
            "game_type": "play now"
        });
        yield (0, gameFunctions_1.saveGame)(gameCode[0].code, game);
        index_2.games.set(gameCode[0].code, game);
        res.json({
            success: true,
            gameId,
            message: "Game started successfully",
        });
        index_1.matchmaker.emit("gameStarted", {
            gameCode: gameCode[0].code,
        });
    }
    catch (error) {
        console.error("Failed to start game:", error);
        res.status(500).json({ error: "Failed to start game" });
    }
}));
