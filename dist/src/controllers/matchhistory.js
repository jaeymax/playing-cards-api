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
exports.getRecentMatchHistory = exports.getMatchHistory = void 0;
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const db_1 = __importDefault(require("../config/db"));
const getRecentMatchHistory = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const userId = req.params.userId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId);
    console.log('user id', (_b = req.user) === null || _b === void 0 ? void 0 : _b.userId);
    const recentGames = yield (0, db_1.default) `
   SELECT
      opp_user.username AS opponent_name,
      opp_gp.score AS opponent_score,
      me_gp.score AS player_score,
      g.ended_at,
      g.is_rated,
      (me_gp.score > opp_gp.score) AS winner,
      COALESCE(rc.rating_change, NULL) AS rating_change
  FROM games g
  JOIN game_players me_gp
      ON me_gp.game_id = g.id
     AND me_gp.user_id = ${userId}
  JOIN game_players opp_gp
      ON opp_gp.game_id = g.id
     AND opp_gp.user_id <> ${userId}
  JOIN users opp_user
      ON opp_user.id = opp_gp.user_id
  LEFT JOIN tournament_matches tm
      ON tm.game_id = g.id
  LEFT JOIN rating_changes rc
      ON rc.user_id = ${userId}
     AND rc.tournament_id = tm.tournament_id
  WHERE g.status = 'completed'
  ORDER BY g.ended_at DESC
    LIMIT 3
  `;
    res.json(recentGames);
}));
exports.getRecentMatchHistory = getRecentMatchHistory;
const getMatchHistory = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const userId = req.params.userId || ((_a = req.user) === null || _a === void 0 ? void 0 : _a.userId);
    // const games = await sql`
    //   SELECT 
    //     g.id,
    //     g.code,
    //     g.status,
    //     g.ended_at,
    //     g.player_count,
    //     g.is_rated,
    //     gp.score,
    //     json_agg(json_build_object(
    //       'username', u.username,
    //       'score', gp2.score
    //     )) as players
    //   FROM games g
    //   JOIN game_players gp ON g.id = gp.game_id
    //   JOIN game_players gp2 ON g.id = gp2.game_id
    //   JOIN users u ON gp2.user_id = u.id
    //   WHERE gp.user_id = ${userId}
    //   AND g.status = 'completed'
    //   GROUP BY g.id, gp.score
    //   ORDER BY g.ended_at DESC
    // `;
    const games = yield (0, db_1.default) `SELECT
      opp_user.username AS opponent_name,
      opp_gp.score AS opponent_score,
      me_gp.score AS player_score,
      g.ended_at,
      g.is_rated,
      (me_gp.score > opp_gp.score) AS winner,
      COALESCE(rc.rating_change, NULL) AS rating_change
  FROM games g
  JOIN game_players me_gp
      ON me_gp.game_id = g.id
     AND me_gp.user_id = ${userId}
  JOIN game_players opp_gp
      ON opp_gp.game_id = g.id
     AND opp_gp.user_id <> ${userId}
  JOIN users opp_user
      ON opp_user.id = opp_gp.user_id
  LEFT JOIN tournament_matches tm
      ON tm.game_id = g.id
  LEFT JOIN rating_changes rc
      ON rc.user_id = ${userId}
     AND rc.tournament_id = tm.tournament_id
  WHERE g.status = 'completed'
  ORDER BY g.ended_at DESC;`;
    res.json(games);
}));
exports.getMatchHistory = getMatchHistory;
