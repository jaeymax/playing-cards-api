import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";
import { matchmaker } from "../index";
import { games } from "../index";
import type { Game } from "../../types";

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
        // Update game status
        sql`UPDATE games SET status = 'in_progress' WHERE id = ${gameId}`,
        sql`UPDATE games SET started_at = NOW() WHERE id = ${gameId}`,
        // Get players from game_players table
      //   sql`
      //   SELECT id as player_id, user_id, position 
      //   FROM game_players 
      //   WHERE game_id = ${gameId}
      //   ORDER BY position
      // `,

        // Get all cards for the game
       // sql`SELECT card_id FROM cards ORDER BY RANDOM()`,
      ])
      // .then(async ([r, k, gamePlayers, cards]) => {
      //   const cardIds = cards.map((c) => c.card_id);

      //   // Deal 5 cards to each player
      //   let cardIndex = 0;
      //   for (const player of gamePlayers) {
      //     for (let hand_position = 0; hand_position < 3; hand_position++) {
      //       await sql`
      //       INSERT INTO game_cards (game_id, card_id, player_id, status, hand_position, animation_state) 
      //       VALUES (${gameId}, ${cardIds[cardIndex]}, ${player.player_id}, 'in_hand', ${hand_position}, 'dealing')
      //     `;
      //       cardIndex++;
      //     }
      //   }

      //   for (const player of gamePlayers) {
      //     for (let hand_position = 3; hand_position < 5; hand_position++) {
      //       await sql`
      //       INSERT INTO game_cards (game_id, card_id, player_id, status, hand_position, animation_state) 
      //       VALUES (${gameId}, ${cardIds[cardIndex]}, ${player.player_id}, 'in_hand', ${hand_position}, 'dealing')
      //     `;
      //       cardIndex++;
      //     }
      //   }

      //   // Put remaining cards in draw pile
      //   const remainingCards = cardIds.slice(cardIndex);
      //   if (remainingCards.length > 0) {
      //     await sql`
      //     INSERT INTO game_cards (game_id, card_id, player_id, status)
      //     SELECT 
      //       ${gameId},
      //       card_id,
      //       ${gamePlayers[0].player_id}, -- Assign to dealer (first player)
      //       'in_drawpile'
      //     FROM unnest(${remainingCards}::integer[]) AS card_id
      //   `;
      //   }
      // });

    // After dealing cards, fetch complete game data
    const gameData = await sql`
      SELECT 
        g.id,
        g.code,
        g.created_by,
        g.status,
        g.player_count,
        g.current_player_position,
        g.current_lead_suit,
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

    //console.log("Game started:", game);
    // Store game in the games map
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
