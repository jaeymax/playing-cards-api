import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";
import { games } from "../index";
import { saveGame } from "../utils/gameFunctions";
import { mixpanel } from "..";

const createGame = asyncHandler(async (req: Request, res: Response) => {
  const { userId, winPoints, numPlayers, includeSixes, includeAces } = req.body;

  if (!userId || !numPlayers || !winPoints) {
    res.status(400).json({
      error: "User ID, number of players, and win points are required",
    });
    return;
  }

  try {
    const gameCode = Math.random().toString(36).substring(2, 12);
    const cards = await sql`SELECT card_id FROM cards ORDER BY RANDOM()`;


    const [newGame] = await sql`
      INSERT INTO games (
        code, 
        created_by, 
        player_count,
        include_sixes,
        include_aces,
        win_points,
        status
      ) 
      VALUES (
        ${gameCode}, 
        ${userId},
        ${numPlayers},
        ${includeSixes},
        ${includeAces},
        ${winPoints},
        'waiting'
      ) 
      RETURNING *
    `;

    const result = await sql.transaction((sql) => [
      sql`
        INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
        VALUES (
          ${newGame.id}, 
          ${userId}, 
          0, 
          true,
          'active'
        )
        RETURNING 
          id,
          game_id,
          score,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url
          ) FROM users WHERE id = user_id) as user
      `,
    ]);


    const humanPlayerId = result[0][0].id;

    const gameCards = await sql`
      INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
      SELECT 
        ${newGame.id},
        unnest(${cards.map((c) => c.card_id)}::integer[]),
        ${humanPlayerId},
        -1,
        'in_deck'
      RETURNING 
          id,
          game_id,
          player_id,
          status,
          hand_position,
          trick_number,
          pos_x,
          pos_y,
          rotation,
          z_index,
          animation_state,
          (SELECT json_build_object(
           'card_id', card_id,
            'suit', suit,
            'value', value,
            'rank', rank,
            'image_url', image_url
          ) FROM cards WHERE card_id = game_cards.card_id) as card
    `;


    const game = {
      ...newGame,
      players: [result[0][0]],
      cards: gameCards,
    };

    mixpanel.track("Game Created", {
      distinct_id: userId,
      game_code: gameCode,
      num_players: numPlayers,
      win_points: winPoints,
      "game_type":"invite friend"
    });

    console.log('game created successfully:', game);
    await saveGame(gameCode, game);

    res.status(201).json({
      success: true,
      game,
    });
  } catch (error) {
    console.error("Failed to create game:", error);
    res.status(500).json({ error: "Failed to create game" });
  }
});

const createBotGame = asyncHandler(async (req: Request, res: Response) => {
  const {
    userId,
    winPoints,
    numBots = 1,
    includeSixes = true,
    includeAces = false,
  } = req.body;

  if (!userId) {
    res.status(400).json({ error: "User ID is required" });
    return;
  }

  try {
    const gameCode = Math.random().toString(36).substring(2, 12);
    const cards = await sql`SELECT card_id FROM cards ORDER BY RANDOM()`;
    const botNumber = Math.floor(1000 + Math.random() * 9000);
    const botUsername = `Bot${botNumber}`;

    // Create bot user
    const bot = await sql`
      INSERT INTO users (username, email, is_bot, rating)
      VALUES (
        ${botUsername}, 
        ${`bot_${Date.now()}_${botNumber}@example.com`},
        true,
        1000
      )
      RETURNING id, username, image_url, rating
    `;

    // Create game first and get its ID
    const [newGame] = await sql`
      INSERT INTO games (
        code, 
        created_by, 
        player_count,
        include_sixes,
        include_aces,
        win_points,
        status,
        is_bot_game
      ) 
      VALUES (
        ${gameCode}, 
        ${userId},
        ${numBots + 1},
        ${includeSixes},
        ${includeAces},
        ${winPoints || 10},
        'in_progress',
        true
      ) 
      RETURNING *
    `;

    
    const result = await sql.transaction((sql) => [
      // Add human player as dealer
      sql`
        INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
        VALUES (
          ${newGame.id}, 
          ${userId}, 
          0, 
          true,
          'active'
        )
        RETURNING 
          id,
          game_id,
          score,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url,
            'is_bot', is_bot
          ) FROM users WHERE id = user_id) as user
      `,
      // Add bot player
      sql`
        INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
        VALUES (
          ${newGame.id}, 
          ${bot[0].id}, 
          1, 
          false,
          'active'
        )
        RETURNING 
          id,
          game_id,
          score,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url,
            'is_bot', is_bot
          ) FROM users WHERE id = user_id) as user
      `,
    ]);

    
    const humanPlayerId = result[0][0].id;
    const gameCards = await sql`
      INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
      SELECT 
        ${newGame.id},
        unnest(${cards.map((c) => c.card_id)}::integer[]),
        ${humanPlayerId},
        -1,
        'in_deck'
      RETURNING 
          id,
          game_id,
          player_id,
          status,
          hand_position,
          trick_number,
          pos_x,
          pos_y,
          rotation,
          z_index,
          animation_state,
          (SELECT json_build_object(
           'card_id', card_id,
            'suit', suit,
            'value', value,
            'rank', rank,
            'image_url', image_url
          ) FROM cards WHERE card_id = game_cards.card_id) as card
    `;



    const game = {
      ...newGame,
      players: [result[0][0], result[1][0]],
      cards: gameCards,
    };

    mixpanel.track("Game Created", {
      distinct_id: userId,
      game_code: gameCode,
      num_players: numBots + 1,
      win_points: winPoints,
      "game_type":"bot game"
    });
    
    //console.log("Game created successfully:", game);
    await saveGame(gameCode, game);
    console.log("game saved to memory", gameCode);

    res.status(201).json({
      success: true,
      game,
    });
  } catch (error) {
    console.error("Failed to create bot game:", error);
    res.status(500).json({ error: "Failed to create bot game" });
  }
});

const joinGame = async (req: Request, res: Response) => {
  res.json({ message: "join Game controller" });
};

export { createGame, createBotGame, joinGame };
