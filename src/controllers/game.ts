import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";
import { games } from "../index";
import { saveGame } from "../utils/gameFunctions";

const createGame = asyncHandler(async (req: Request, res: Response) => {
  const {
    userId,
    winPoints,
    numPlayers,
    includeSixes = true,
    includeAces = false,
  } = req.body;

  if (!userId || !numPlayers || !winPoints) {
    res.status(400).json({
      error: "User ID, number of players, and win points are required",
    });
    return;
  }

  try {
    // Generate unique game code
    const gameCode = Math.random().toString(36).substring(2, 12);
    const cards = await sql`SELECT card_id FROM cards ORDER BY RANDOM()`;

    const result = await sql.transaction((sql) => [
      // Create new game
      sql`
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
      `,
      // Add creator as first player and dealer
      sql`
        INSERT INTO game_players (
          game_id, 
          user_id, 
          position, 
          is_dealer,
          status
        )
        VALUES (
          (SELECT lastval()), 
          ${userId}, 
          0, 
          true,
          'active'
        )
        RETURNING 
          id,
          game_id,
          user_id,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url
          ) FROM users WHERE id = user_id) as user
      `,
      // Add all cards to the game, assigned to dealer
      sql`
        INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
        SELECT 
          (SELECT lastval()),
          unnest(${cards.map((c) => c.card_id)}::integer[]),
          (SELECT id FROM game_players WHERE game_id = (SELECT lastval()) AND is_dealer = true),
          -1,
          'in_deck'
        RETURNING *
      `,
    ]);

    const game = {
      ...result[0][0],
      players: [result[1][0]],
      cards: result[2],
    };

    // Store game in memory
    //await saveGame(gameCode, game);

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

    // Now use the actual game ID for related inserts
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
          user_id,
          position,
          is_dealer,
          status,
          (SELECT json_build_object(
            'id', id,
            'username', username,
            'image_url', image_url
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
          user_id,
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

    // After players are created, add cards
    const humanPlayerId = result[0][0].id;
    const gameCards = await sql`
      INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
      SELECT 
        ${newGame.id},
        unnest(${cards.map((c) => c.card_id)}::integer[]),
        ${humanPlayerId},
        -1,
        'in_deck'
      RETURNING *
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
    WHERE gp.game_id = ${newGame.id}
    ORDER BY gp.position
  `;

  const carrds = await sql`
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
  WHERE gc.game_id = ${newGame.id}
`;

    const game = {
      ...newGame,
      players: players,
      cards: carrds,
    };

    console.log("Game created successfully:", game);
    await saveGame(gameCode, game);
    console.log('game saved to memeory', gameCode)


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
