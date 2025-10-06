import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";
import { matchmaker } from "../index";
import { games } from "../index";
import type { Game } from "../../types";
import { saveGame } from "../utils/gameFunctions";
import { mixpanel } from "..";

export const joinQueue = asyncHandler(async (req: Request, res: Response) => {
  const { userId, rating } = req.body;

  if (!userId || !rating) {
    res.status(400).json({ error: "User ID and rating are required" });
    return;
  }

  await matchmaker.addToQueue(userId, rating || 1000);
  res.json({ success: true });
});

export const leaveQueue = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = req.body;
  await matchmaker.removeFromQueue(userId);
  res.json({ success: true });
});

export const startGame = asyncHandler(async (req: Request, res: Response) => {
  const gameId = req.params.id;

  // get gamecode from games by id
  const gameCode = await sql`SELECT code FROM games WHERE id = ${gameId}`;
  if (gameCode.length === 0) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  console.log(gameCode);

  try {
    await sql
      .transaction((sql) => [
        sql`UPDATE games SET status = 'in_progress' WHERE id = ${gameId}`,
        sql`UPDATE games SET started_at = NOW() WHERE id = ${gameId}`,
      ])
  
    const gameData = await sql`
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
        g.ended_at
      FROM games g
      WHERE g.id = ${gameId}
    `;

    const players = await sql`
      SELECT 
        gp.id,
        gp.game_id,
        gp.score,
        gp.position,
        gp.is_dealer,
        gp.status,
        json_build_object(
          'id', u.id,
          'username', u.username,
          'image_url', u.image_url
        ) as user
      FROM game_players gp
      JOIN users u ON u.id = gp.user_id
      WHERE gp.game_id = ${gameId}
      ORDER BY gp.position
    `;

    const cards = await sql`
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

    const game = {
      ...gameData[0],
      players: players,
      cards: cards,
    };

    mixpanel.track("Game Started", {
      distinct_id: gameData[0].created_by,
      game_code: gameCode[0].code,
      num_players: players.length,
      "game_type":"play now"
    });

    await saveGame(gameCode[0].code, game);
    games.set(gameCode[0].code, game as Game);

    res.json({
      success: true,
      gameId,
      message: "Game started successfully",
    });

    matchmaker.emit("gameStarted", {
      gameCode: gameCode[0].code,
    });
  } catch (error) {
    console.error("Failed to start game:", error);
    res.status(500).json({ error: "Failed to start game" });
  }
});
