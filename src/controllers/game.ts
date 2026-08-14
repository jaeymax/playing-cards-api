import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";
import { saveGame } from "../utils/gameFunctions";
import { expiredChallenges, mixpanel } from "..";



const createGame = asyncHandler(async (req: Request, res: Response) => {
  const {
    userId,
    winPoints,
    numPlayers,
    includeSixes,
    includeAces,
    isStakeGame,
    stake,
  } = req.body;

  // --------------------------------------------------
  // 1. VALIDATION
  // --------------------------------------------------

  if (!userId || !numPlayers || !winPoints) {
    res.status(400).json({
      error: "User ID, number of players, and win points are required",
    });
    return;
  }

  // Cash games are currently limited to 2 players
  if (isStakeGame && Number(numPlayers) !== 2) {
    res.status(400).json({
      error: "Cash challenges are limited to 2 players",
    });
    return;
  }

  const numericStake = Number(stake || 0);

  if (isStakeGame && (!Number.isFinite(numericStake) || numericStake <= 0)) {
    res.status(400).json({
      error: "Stake amount must be greater than 0 for stake games",
    });
    return;
  }

  try {
    // --------------------------------------------------
    // 2. GET CARDS
    // --------------------------------------------------

    const cards = await sql`
      SELECT card_id
      FROM cards
      ORDER BY RANDOM()
    `;

    // --------------------------------------------------
    // 3. GAME CODE
    // --------------------------------------------------

    const gameCode = Math.random()
      .toString(36)
      .substring(2, 12)

    // --------------------------------------------------
    // 4. CALCULATE CASH VALUES ON SERVER
    // --------------------------------------------------

    let platformFee = 0;
    let winnerPayout = 0;

    if (isStakeGame) {
      const totalPot = numericStake * 2;

      // 5% platform fee
      platformFee = Number((totalPot * 0.05).toFixed(2));

      winnerPayout = Number(
        (totalPot - platformFee).toFixed(2)
      );
    }

    // --------------------------------------------------
    // 5. CREATE GAME + PLAYER + CHALLENGE ATOMICALLY
    // --------------------------------------------------

    /*
     * Neon requires sql.transaction() to receive
     * an array of queries.
     *
     * Therefore, we use CTEs to make all dependent
     * operations happen inside one PostgreSQL query.
     */

    const transactionQueries = [
      sql`
        WITH wallet_lock AS (
          -- -------------------------------------------
          -- LOCK HOST'S STAKE
          -- -------------------------------------------

          UPDATE wallets
          SET
            locked_balance = locked_balance + ${numericStake},
            updated_at = CURRENT_TIMESTAMP
          WHERE
            user_id = ${userId}
            AND ${isStakeGame}
            AND (
              balance - locked_balance
            ) >= ${numericStake}
          RETURNING
            id,
            user_id
        ),

        new_game AS (
          -- -------------------------------------------
          -- CREATE GAME
          -- -------------------------------------------

          INSERT INTO games (
            code,
            created_by,
            player_count,
            include_sixes,
            include_aces,
            win_points,
            status
          )
          SELECT
            ${gameCode},
            ${userId},
            ${numPlayers},
            ${includeSixes ?? false},
            ${includeAces ?? false},
            ${winPoints},
            'waiting'
          WHERE
            ${!isStakeGame}
            OR EXISTS (
              SELECT 1
              FROM wallet_lock
            )
          RETURNING *
        ),

        new_game_player AS (
          -- -------------------------------------------
          -- ADD HOST TO GAME
          -- -------------------------------------------

          INSERT INTO game_players (
            game_id,
            user_id,
            position,
            is_dealer,
            status
          )
          SELECT
            id,
            ${userId},
            0,
            true,
            'active'
          FROM new_game
          RETURNING *
        ),

        new_challenge AS (
          -- -------------------------------------------
          -- CREATE CASH CHALLENGE
          -- -------------------------------------------

          INSERT INTO challenges (
            creator_id,
            game_id,
            stake,
            platform_fee,
            winner_payout,
            status,
            expires_at
          )
          SELECT
            ${userId},
            id,
            ${numericStake},
            ${platformFee},
            ${winnerPayout},
            'waiting',
            NOW() + INTERVAL '1 minute' -- Challenge expires in 10 minutes
          FROM new_game
          WHERE ${isStakeGame}
          RETURNING *
        ),

        wallet_transaction AS (
          -- -------------------------------------------
          -- RECORD STAKE LOCK
          -- -------------------------------------------

          INSERT INTO wallet_transactions (
            user_id,
            type,
            amount,
            challenge_id,
            reference,
            status
          )
          SELECT
            ${userId},
            'challenge_lock',
            ${numericStake},
            id,
            ${gameCode},
            'completed'
          FROM new_challenge
          RETURNING *
        ),

        update_game AS (
          -- -------------------------------------------
          -- LINK CHALLENGE TO GAME
          -- -------------------------------------------

          UPDATE games
          SET challenge_id = new_challenge.id
          FROM new_challenge
          WHERE games.id = new_challenge.game_id
          RETURNING games.*
        )

        -- ---------------------------------------------
        -- RETURN EVERYTHING WE NEED
        -- ---------------------------------------------

        SELECT
          g.*,

          (
            SELECT json_build_object(
              'id', gp.id,
              'game_id', gp.game_id,
              'user_id', gp.user_id,
              'score', gp.score,
              'games_won', gp.games_won,
              'position', gp.position,
              'is_dealer', gp.is_dealer,
              'status', gp.status,
              'user',
              (
                SELECT json_build_object(
                  'id', u.id,
                  'username', u.username,
                  'image_url', u.image_url
                )
                FROM users u
                WHERE u.id = gp.user_id
              )
            )
            FROM new_game_player gp
            LIMIT 1
          ) AS player,

          (
            SELECT json_build_object(
              'id', c.id,
              'creator_id', c.creator_id,
              'game_id', c.game_id,
              'stake', c.stake,
              'platform_fee', c.platform_fee,
              'winner_payout', c.winner_payout,
              'status', c.status,
              'expires_at', c.expires_at
            )
            FROM new_challenge c
            LIMIT 1
          ) AS challenge

        FROM new_game g;
      `,
    ];

    const [transactionResult] = await sql.transaction(
      transactionQueries
    );

    // --------------------------------------------------
    // 6. CHECK WHETHER GAME WAS CREATED
    // --------------------------------------------------

    if (!transactionResult || transactionResult.length === 0) {
      if (isStakeGame) {
        res.status(400).json({
          error: "Insufficient available balance to cover the stake",
        });
        return;
      }

      res.status(500).json({
        error: "Failed to create game",
      });
      return;
    }


    // schedule expired challenge job if it's a stake game
    if (isStakeGame) {
      const challenge = transactionResult[0].challenge;
      if (challenge && challenge.id) {
        const expiresAt = new Date(challenge.expires_at);
        const delayMs = expiresAt.getTime() - Date.now();
        await expiredChallenges.scheduleExpiredChallenge(
          challenge.id,
          Math.max(delayMs, 0)
        );
      }
    }

    const row = transactionResult[0];

    // --------------------------------------------------
    // 7. CREATE GAME CARDS
    // --------------------------------------------------

    /*
     * We do this after the financial transaction.
     *
     * Since your existing game system expects the cards
     * in Redis/game state, this keeps that logic separate.
     */

    const gameCards = await sql`
      INSERT INTO game_cards (
        game_id,
        card_id,
        player_id,
        hand_position,
        status
      )
      SELECT
        ${row.id},
        unnest(${cards.map((c) => c.card_id)}::integer[]),
        ${row.player?.id},
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
        (
          SELECT json_build_object(
            'card_id', card_id,
            'suit', suit,
            'value', value,
            'rank', rank,
            'image_url', image_url
          )
          FROM cards
          WHERE card_id = game_cards.card_id
        ) AS card
    `;

    // --------------------------------------------------
    // 8. BUILD GAME OBJECT
    // --------------------------------------------------

    const game: any = {
      ...row,

      players: row.player ? [row.player] : [],

      cards: gameCards,

      challenge: row.challenge || null,

      isStakeGame: Boolean(isStakeGame),
    };

    // Remove helper fields if you don't want them
    delete game.player;

    // --------------------------------------------------
    // 9. MIXPANEL
    // --------------------------------------------------

    mixpanel.track("Game Created", {
      distinct_id: userId,
      game_code: gameCode,
      num_players: numPlayers,
      win_points: winPoints,
      game_type: isStakeGame
        ? "cash challenge"
        : "invite friend",

      ...(isStakeGame && {
        stake: numericStake,
        platform_fee: platformFee,
        winner_payout: winnerPayout,
      }),
    });

    // --------------------------------------------------
    // 10. SAVE GAME TO REDIS
    // --------------------------------------------------

    await saveGame(gameCode, game);

    console.log("Game created successfully:", game);

    // --------------------------------------------------
    // 11. RESPONSE
    // --------------------------------------------------

    res.status(201).json({
      success: true,
      game,
    });
  } catch (error: any) {
    console.error("Failed to create game:", error);

    // PostgreSQL / application error from the wallet
    if (
      error?.message === "INSUFFICIENT_BALANCE" ||
      error?.code === "INSUFFICIENT_BALANCE"
    ) {
      res.status(400).json({
        error: "Insufficient available balance to cover the stake",
      });
      return;
    }

    res.status(500).json({
      error: "Failed to create game",
    });
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
          games_won,
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
          games_won,
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
      game_type: "bot game",
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