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

// const getUserGames = asyncHandler(async (req: Request, res: Response) => {
//   res.json([
//     {
//     id: 128,
//     code: "SPX72K",
//     status: "in_progress",

//     is_stake_game: true,
//     is_rated: false,

//     stake: 20,
//     prize: 38,
//     platform_fee: 2,

//     opponent_name: "Kwame",
//     opponent_score: 7,
//     player_score: 8,

//     winner: null,
//     winner_name: null,

//     created_at: "2026-08-14T20:10:00Z",
//     started_at: "2026-08-14T20:15:00Z",
//     ended_at: null,

//     forfeit_at: "2026-08-14T20:25:00Z"
//   },

//   {
//     id: 127,
//     code: "AB92KD",
//     status: "completed",

//     is_stake_game: false,
//     is_rated: true,

//     stake: null,
//     prize: null,
//     platform_fee: null,

//     opponent_name: "Yaw",
//     opponent_score: 6,
//     player_score: 10,

//     winner: true,
//     winner_name: "You",

//     created_at: "2026-08-14T18:30:00Z",
//     started_at: "2026-08-14T18:35:00Z",
//     ended_at: "2026-08-14T18:48:00Z",

//     forfeit_at: null
//   },
//   {
//   id: 126,
//   code: "CX81PL",
//   status: "waiting",

//   is_stake_game: true,
//   is_rated: false,

//   stake: 50,
//   prize: 95,
//   platform_fee: 5,

//   opponent_name: null,
//   opponent_score: null,
//   player_score: null,

//   winner: null,
//   winner_name: null,

//   created_at: "2026-08-14T17:45:00Z",
//   started_at: null,
//   ended_at: null,

//   forfeit_at: null
// },

// {
//   id: 125,
//   code: "FR55QM",
//   status: "forfeited",

//   is_stake_game: true,
//   is_rated: false,

//   stake: 20,
//   prize: 38,
//   platform_fee: 2,

//   opponent_name: "Daniel",
//   opponent_score: 4,
//   player_score: 8,

//   winner: true,
//   winner_name: "You",

//   created_at: "2026-08-14T15:20:00Z",
//   started_at: "2026-08-14T15:24:00Z",
//   ended_at: "2026-08-14T15:31:00Z",

//   forfeit_at: "2026-08-14T15:31:00Z"
// },
// {
//   id: 124,
//   code: "MN73RT",
//   status: "cancelled",

//   is_stake_game: false,
//   is_rated: true,

//   stake: null,
//   prize: null,
//   platform_fee: null,

//   opponent_name: null,
//   opponent_score: null,
//   player_score: null,

//   winner: null,
//   winner_name: null,

//   created_at: "2026-08-14T12:10:00Z",
//   started_at: null,
//   ended_at: null,

//   forfeit_at: null
// }
//   ])
// });


// const getUserGames = async (
//   req: Request,
//   res: Response
// ) => {
//   try {
//     const userId = (req as any).user?.userId;

//     if (!userId) {
//       return res.status(401).json({
//         message: "Authentication required",
//       });
//     }

//     const games = await sql`
//       SELECT
//         g.id,
//         g.code,

//         g.status,
//         g.is_rated,

//         g.created_at,
//         g.started_at,
//         g.ended_at,

//         /*
//          * Turn / timeout information
//          */
//         g.current_turn_user_id,
//         g.turn_started_at,
//         g.turn_timeout_seconds,
//         g.forfeited_by,

//         /*
//          * Calculate the exact timeout timestamp.
//          */
//         CASE
//           WHEN g.status = 'in_progress'
//             AND g.turn_started_at IS NOT NULL
//             AND g.turn_timeout_seconds IS NOT NULL
//           THEN
//             g.turn_started_at
//             + (g.turn_timeout_seconds * INTERVAL '1 second')
//           ELSE NULL
//         END AS forfeit_at,

//         /*
//          * Game settings
//          */
//         g.win_points,
//         g.include_sixes,
//         g.include_aces,
//         g.player_count,

//         /*
//          * Challenge information.
//          */
//         c.id AS challenge_id,

//         CASE
//           WHEN c.id IS NOT NULL
//             THEN true
//           ELSE false
//         END AS is_stake_game,

//         c.stake,
//         c.platform_fee,
//         c.winner_payout AS prize,

//         c.status AS challenge_status,
//         c.winner_id AS challenge_winner_id,
//         c.expires_at AS challenge_expires_at,
//         c.completed_at AS challenge_completed_at,

//         /*
//          * Opponent
//          */
//         opponent.id AS opponent_id,
//         opponent.username AS opponent_name,

//         /*
//          * Current user's score
//          */
//         me.score AS player_score,

//         /*
//          * Opponent's score
//          */
//         opponent_player.score AS opponent_score,

//         /*
//          * Winner
//          */
//         CASE
//           WHEN c.id IS NOT NULL
//             THEN c.winner_id

//           WHEN g.status IN ('completed', 'forfeited')
//             THEN (
//               SELECT gp_winner.user_id
//               FROM game_players gp_winner
//               WHERE gp_winner.game_id = g.id
//               ORDER BY gp_winner.score DESC
//               LIMIT 1
//             )

//           ELSE NULL
//         END AS winner_id

//       FROM games g

//       /*
//        * Cash challenge
//        */
//       LEFT JOIN challenges c
//         ON c.id = g.challenge_id

//       /*
//        * Current user
//        */
//       LEFT JOIN game_players me
//         ON me.game_id = g.id
//         AND me.user_id = ${userId}

//       /*
//        * Opponent
//        */
//       LEFT JOIN game_players opponent_player
//         ON opponent_player.game_id = g.id
//         AND opponent_player.user_id != ${userId}

//       LEFT JOIN users opponent
//         ON opponent.id = opponent_player.user_id

//       /*
//        * Only games CREATED by this user.
//        */
//       WHERE g.created_by = ${userId}
//       /*
//        * Newest first.
//        */
//       ORDER BY g.created_at DESC
//       LIMIT 5;
//     `;

//     const formattedGames = games.map((game: any) => {

//       let winner: boolean | null = null;

//       if (game.winner_id !== null) {
//         winner =
//           Number(game.winner_id) === Number(userId);
//       }

//       /*
//        * A challenge can expire/cancel while the
//        * game itself is still waiting.
//        */
//       let status = game.status;

//       if (
//         status === "waiting" &&
//         game.challenge_status === "expired"
//       ) {
//         status = "expired";
//       }

//       if (
//         status === "waiting" &&
//         game.challenge_status === "cancelled"
//       ) {
//         status = "cancelled";
//       }

//       return {
//         id: game.id,
//         code: game.code,

//         status,

//         is_stake_game: game.is_stake_game,
//         is_rated: game.is_rated,

//         stake:
//           game.stake !== null
//             ? Number(game.stake)
//             : null,

//         prize:
//           game.prize !== null
//             ? Number(game.prize)
//             : null,

//         platform_fee:
//           game.platform_fee !== null
//             ? Number(game.platform_fee)
//             : null,

//         opponent_id:
//           game.opponent_id || null,

//         opponent_name:
//           game.opponent_name || null,

//         player_score:
//           game.player_score !== null
//             ? Number(game.player_score)
//             : null,

//         opponent_score:
//           game.opponent_score !== null
//             ? Number(game.opponent_score)
//             : null,

//         winner,

//         winner_name:
//           game.winner_id
//             ? Number(game.winner_id) === Number(userId)
//               ? "You"
//               : game.opponent_name
//             : null,

//         created_at: game.created_at,
//         started_at: game.started_at,
//         ended_at: game.ended_at,

//         /*
//          * Countdown information
//          */
//         forfeit_at: game.forfeit_at,

//         current_turn_user_id:
//           game.current_turn_user_id || null,

//         turn_started_at:
//           game.turn_started_at || null,

//         turn_timeout_seconds:
//           game.turn_timeout_seconds || null,

//         forfeited_by:
//           game.forfeited_by || null,

//         /*
//          * Game configuration
//          */
//         win_points: game.win_points,
//         include_sixes: game.include_sixes,
//         include_aces: game.include_aces,
//         player_count: game.player_count,

//         /*
//          * Challenge information
//          */
//         challenge_id:
//           game.challenge_id || null,

//         challenge_status:
//           game.challenge_status || null,

//         challenge_expires_at:
//           game.challenge_expires_at || null,

//         challenge_completed_at:
//           game.challenge_completed_at || null,
//       };
//     });

//     return res.status(200).json({
//       games: formattedGames,
//     });

//   } catch (error) {
//     console.error(
//       "Error fetching created games:",
//       error
//     );

//     return res.status(500).json({
//       message: "Failed to fetch games",
//     });
//   }
// };

// const getUserGames = async (
//   req: Request,
//   res: Response
// ) => {
//   try {
//     const userId = (req as any).user?.userId;

//     if (!userId) {
//       return res.status(401).json({
//         message: "Authentication required",
//       });
//     }

//     /*
//      * We use JSON_AGG to collect all players belonging
//      * to each game into a single players array.
//      *
//      * This means 2, 3 and 4-player games are all handled
//      * by the same endpoint.
//      */
//     const games = await sql`
//       SELECT
//         g.id,
//         g.code,
//         g.status,
//         g.is_rated,

//         g.created_at,
//         g.started_at,
//         g.ended_at,

//         /*
//          * Game settings
//          */
//         g.win_points,
//         g.include_sixes,
//         g.include_aces,
//         g.player_count,

//         /*
//          * Turn / timeout information
//          */
//         g.current_player_position,
//         g.current_turn_user_id,
//         g.turn_started_at,
//         g.turn_timeout_seconds,
//         g.forfeited_by,

//         /*
//          * Calculate when the current turn expires.
//          */
//         CASE
//           WHEN g.status = 'in_progress'
//             AND g.turn_started_at IS NOT NULL
//             AND g.turn_timeout_seconds IS NOT NULL
//           THEN
//             g.turn_started_at
//             + (g.turn_timeout_seconds * INTERVAL '1 second')
//           ELSE NULL
//         END AS forfeit_at,

//         /*
//          * Challenge information
//          */
//         c.id AS challenge_id,

//         CASE
//           WHEN c.id IS NOT NULL
//             THEN true
//           ELSE false
//         END AS is_stake_game,

//         c.stake,
//         c.platform_fee,
//         c.winner_payout AS prize,

//         c.status AS challenge_status,
//         c.winner_id AS challenge_winner_id,
//         c.expires_at AS challenge_expires_at,
//         c.completed_at AS challenge_completed_at,

//         /*
//          * All players in the game.
//          *
//          * ORDER BY position ensures that the players
//          * always appear in game order.
//          */
//         COALESCE(
//           (
//             SELECT JSON_AGG(
//               JSON_BUILD_OBJECT(
//                 'id', gp.user_id,
//                 'username', u.username,
//                 'score', gp.score,
//                 'position', gp.position,
//                 'is_dealer', gp.is_dealer,
//                 'player_status', gp.status,
//                 'is_you', gp.user_id = ${userId}
//               )
//               ORDER BY gp.position
//             )
//             FROM game_players gp
//             INNER JOIN users u
//               ON u.id = gp.user_id
//             WHERE gp.game_id = g.id
//           ),
//           '[]'::json
//         ) AS players,

//         /*
//          * Winner
//          *
//          * For cash challenges, challenge.winner_id
//          * is authoritative.
//          *
//          * For normal completed/abandoned games,
//          * determine the player with the highest score.
//          */
//         CASE
//           WHEN c.id IS NOT NULL
//             THEN c.winner_id

//           WHEN g.status IN ('completed', 'abandoned')
//             THEN (
//               SELECT gp_winner.user_id
//               FROM game_players gp_winner
//               WHERE gp_winner.game_id = g.id
//               ORDER BY gp_winner.score DESC
//               LIMIT 1
//             )

//           ELSE NULL
//         END AS winner_id

//       FROM games g

//       /*
//        * Optional cash challenge
//        */
//       LEFT JOIN challenges c
//         ON c.id = g.challenge_id

//       /*
//        * IMPORTANT:
//        *
//        * We only return games created by the
//        * currently authenticated user.
//        */
//       WHERE g.created_by = ${userId}

//       ORDER BY g.created_at DESC

//       LIMIT 5;
//     `;

//     const formattedGames = games.map((game: any) => {

//       /*
//        * Convert abandoned → forfeited for the UI.
//        */
//       let status = game.status;



//       /*
//        * A challenge can expire or be cancelled while
//        * the associated game is still waiting.
//        */
//       if (
//         status === "waiting" &&
//         game.challenge_status === "expired"
//       ) {
//         status = "expired";
//       }

//       if (
//         status === "waiting" &&
//         game.challenge_status === "cancelled"
//       ) {
//         status = "cancelled";
//       }

//       /*
//        * Determine whether the current user won.
//        */
//       let winner: boolean | null = null;

//       if (game.winner_id !== null) {
//         winner =
//           Number(game.winner_id) === Number(userId);
//       }

//       /*
//        * Make sure numeric database values are
//        * returned as JavaScript numbers.
//        */
//       const players = Array.isArray(game.players)
//         ? game.players.map((player: any) => ({
//             id: Number(player.id),
//             username: player.username,
//             score: Number(player.score ?? 0),
//             position: Number(player.position),
//             is_dealer: Boolean(player.is_dealer),
//             player_status: player.player_status,
//             is_you: Boolean(player.is_you),
//           }))
//         : [];

//       return {
//         id: Number(game.id),
//         code: game.code,

//         status,

//         is_stake_game: Boolean(game.is_stake_game),
//         is_rated: Boolean(game.is_rated),

//         /*
//          * Players
//          */
//         players,

//         /*
//          * Winner
//          */
//         winner,
//         winner_id:
//           game.winner_id !== null
//             ? Number(game.winner_id)
//             : null,

//         /*
//          * Challenge
//          */
//         challenge_id:
//           game.challenge_id !== null
//             ? Number(game.challenge_id)
//             : null,

//         challenge_status:
//           game.challenge_status || null,

//         stake:
//           game.stake !== null
//             ? Number(game.stake)
//             : null,

//         platform_fee:
//           game.platform_fee !== null
//             ? Number(game.platform_fee)
//             : null,

//         prize:
//           game.prize !== null
//             ? Number(game.prize)
//             : null,

//         challenge_expires_at:
//           game.challenge_expires_at || null,

//         challenge_completed_at:
//           game.challenge_completed_at || null,

//         /*
//          * Game configuration
//          */
//         win_points:
//           game.win_points !== null
//             ? Number(game.win_points)
//             : null,

//         include_sixes:
//           Boolean(game.include_sixes),

//         include_aces:
//           Boolean(game.include_aces),

//         player_count:
//           Number(game.player_count),

//         /*
//          * Game timing
//          */
//         created_at: game.created_at,
//         started_at: game.started_at,
//         ended_at: game.ended_at,

//         /*
//          * Turn / countdown
//          */
//         current_player_position:
//           Number(game.current_player_position),

//         current_turn_user_id:
//           game.current_turn_user_id !== null
//             ? Number(game.current_turn_user_id)
//             : null,

//         turn_started_at:
//           game.turn_started_at || null,

//         turn_timeout_seconds:
//           game.turn_timeout_seconds !== null
//             ? Number(game.turn_timeout_seconds)
//             : null,

//         forfeit_at:
//           game.forfeit_at || null,

//         forfeited_by:
//           game.forfeited_by !== null
//             ? Number(game.forfeited_by)
//             : null,
//       };
//     });

//     return res.status(200).json({
//       games: formattedGames,
//     });

//   } catch (error) {
//     console.error(
//       "Error fetching created games:",
//       error
//     );

//     return res.status(500).json({
//       message: "Failed to fetch created games",
//     });
//   }
// };

const getUserGames = async (
  req: Request,
  res: Response
) => {
  try {
    const userId = (req as any).user?.userId;

    if (!userId) {
      return res.status(401).json({
        message: "Authentication required",
      });
    }

    /*
     * -----------------------------------------
     * PAGINATION
     * -----------------------------------------
     */

    const requestedPage =
      Number(req.query.page) || 1;

    const requestedLimit =
      Number(req.query.limit) || 3;

    const page = Math.max(
      1,
      Math.floor(requestedPage)
    );

    const limit = Math.min(
      50,
      Math.max(
        1,
        Math.floor(requestedLimit)
      )
    );

    const offset = (page - 1) * limit;


    /*
     * -----------------------------------------
     * FILTERS
     * -----------------------------------------
     *
     * status:
     * all
     * waiting
     * in_progress
     * completed
     * forfeited
     * expired
     * cancelled
     *
     * type:
     * all
     * cash
     * friendly
     * ranked
     */

    const statusFilter =
      typeof req.query.status === "string"
        ? req.query.status
        : "all";

    const typeFilter =
      typeof req.query.type === "string"
        ? req.query.type
        : "all";


    /*
     * Validate status
     */

    const allowedStatuses = [
      "all",
      "waiting",
      "in_progress",
      "completed",
      "forfeited",
      "expired",
      "cancelled",
    ];

    if (
      !allowedStatuses.includes(
        statusFilter
      )
    ) {
      return res.status(400).json({
        message: "Invalid status filter",
      });
    }


    /*
     * Validate type
     */

    const allowedTypes = [
      "all",
      "cash",
      "friendly",
      "ranked",
    ];

    if (
      !allowedTypes.includes(
        typeFilter
      )
    ) {
      return res.status(400).json({
        message: "Invalid game type filter",
      });
    }


    /*
     * -----------------------------------------
     * BUILD FILTER CONDITIONS
     * -----------------------------------------
     */

    let statusCondition = sql``;

    if (statusFilter === "waiting") {
      statusCondition = sql`
        AND g.status = 'waiting'
        AND (
          c.status IS NULL
          OR c.status NOT IN (
            'expired',
            'cancelled'
          )
        )
      `;
    }

    else if (
      statusFilter === "in_progress"
    ) {
      statusCondition = sql`
        AND g.status = 'in_progress'
      `;
    }

    else if (
      statusFilter === "completed"
    ) {
      statusCondition = sql`
        AND g.status = 'completed'
      `;
    }

    /*
     * Frontend calls it "forfeited",
     * database calls it "abandoned".
     */
    else if (
      statusFilter === "forfeited"
    ) {
      statusCondition = sql`
        AND g.status = 'forfeited'
      `;
    }

    else if (
      statusFilter === "expired"
    ) {
      statusCondition = sql`
        AND (
          g.status = 'expired'
          OR (
            g.status = 'waiting'
            AND c.status = 'expired'
          )
        )
      `;
    }

    else if (
      statusFilter === "cancelled"
    ) {
      statusCondition = sql`
        AND (
          g.status = 'cancelled'
          OR (
            g.status = 'waiting'
            AND c.status = 'cancelled'
          )
        )
      `;
    }


    /*
     * -----------------------------------------
     * TYPE FILTER
     * -----------------------------------------
     */

    let typeCondition = sql``;

    /*
     * Cash challenge
     */
    if (typeFilter === "cash") {
      typeCondition = sql`
        AND c.id IS NOT NULL
      `;
    }

    /*
     * Friendly = non-cash, non-rated
     */
    else if (
      typeFilter === "friendly"
    ) {
      typeCondition = sql`
        AND c.id IS NULL
        AND g.is_rated = false
      `;
    }

    /*
     * Ranked = non-cash, rated
     */
    else if (
      typeFilter === "ranked"
    ) {
      typeCondition = sql`
        AND c.id IS NULL
        AND g.is_rated = true
      `;
    }


    /*
     * -----------------------------------------
     * GET TOTAL
     * -----------------------------------------
     */

    const countResult = await sql`
      SELECT COUNT(*)::int AS total

      FROM games g

      LEFT JOIN challenges c
        ON c.id = g.challenge_id

      WHERE g.created_by = ${userId}

      ${statusCondition}

      ${typeCondition};
    `;

    const total = Number(
      countResult[0]?.total ?? 0
    );

    const totalPages =
      total === 0
        ? 0
        : Math.ceil(
            total / limit
          );


    /*
     * -----------------------------------------
     * FETCH GAMES
     * -----------------------------------------
     */

    const games = await sql`
      SELECT
        g.id,
        g.code,
        g.status,
        g.is_rated,

        g.created_at,
        g.started_at,
        g.ended_at,

        /*
         * Game settings
         */
        g.win_points,
        g.include_sixes,
        g.include_aces,
        g.player_count,

        /*
         * Turn information
         */
        g.current_player_position,
        g.current_turn_user_id,
        g.turn_started_at,
        g.turn_timeout_seconds,
        g.forfeited_by,

        /*
         * Calculate turn expiration
         */
        CASE
          WHEN g.status = 'in_progress'
            AND g.turn_started_at IS NOT NULL
            AND g.turn_timeout_seconds IS NOT NULL
          THEN
            g.turn_started_at
            + (
              g.turn_timeout_seconds
              * INTERVAL '1 second'
            )
          ELSE NULL
        END AS forfeit_at,

        /*
         * Challenge
         */
        c.id AS challenge_id,

        CASE
          WHEN c.id IS NOT NULL
            THEN true
          ELSE false
        END AS is_stake_game,

        c.stake,
        c.platform_fee,
        c.winner_payout AS prize,

        c.status AS challenge_status,
        c.winner_id AS challenge_winner_id,
        c.expires_at AS challenge_expires_at,
        c.completed_at AS challenge_completed_at,

        /*
         * Players
         */
        COALESCE(
          (
            SELECT JSON_AGG(
              JSON_BUILD_OBJECT(
                'id', gp.user_id,
                'username', u.username,
                'score', gp.score,
                'position', gp.position,
                'is_dealer', gp.is_dealer,
                'player_status', gp.status,
                'is_you',
                  gp.user_id = ${userId}
              )
              ORDER BY gp.position
            )

            FROM game_players gp

            INNER JOIN users u
              ON u.id = gp.user_id

            WHERE gp.game_id = g.id
          ),
          '[]'::json
        ) AS players,

        /*
         * Winner
         */
        CASE

          /*
           * Cash challenge winner
           */
          WHEN c.id IS NOT NULL
            THEN c.winner_id

          /*
           * Normal completed/abandoned game
           */
          WHEN g.status IN (
            'completed',
            'abandoned'
          )
            THEN (
              SELECT gp_winner.user_id

              FROM game_players gp_winner

              WHERE gp_winner.game_id =
                g.id

              ORDER BY
                gp_winner.score DESC,
                gp_winner.position ASC

              LIMIT 1
            )

          ELSE NULL

        END AS winner_id

      FROM games g

      LEFT JOIN challenges c
        ON c.id = g.challenge_id

      WHERE g.created_by = ${userId}

      ${statusCondition}

      ${typeCondition}

      ORDER BY
        g.created_at DESC,
        g.id DESC

      LIMIT ${limit}
      OFFSET ${offset};
    `;


    /*
     * -----------------------------------------
     * FORMAT RESULTS
     * -----------------------------------------
     */

    const formattedGames =
      games.map((game: any) => {

        /*
         * -------------------------------------
         * UI STATUS
         * -------------------------------------
         */

        let status = game.status;

        /*
         * Database:
         * abandoned
         *
         * Frontend:
         * forfeited
         */
        // if (
        //   status === "abandoned"
        // ) {
        //   status = "forfeited";
        // }

        /*
         * Challenge expired while
         * game was still waiting.
         */
        if (
          status === "waiting" &&
          game.challenge_status ===
            "expired"
        ) {
          status = "expired";
        }

        /*
         * Challenge cancelled while
         * game was still waiting.
         */
        if (
          status === "waiting" &&
          game.challenge_status ===
            "cancelled"
        ) {
          status = "cancelled";
        }


        /*
         * -------------------------------------
         * WINNER
         * -------------------------------------
         */

        let winner:
          | boolean
          | null = null;

        if (
          game.winner_id !== null
        ) {
          winner =
            Number(
              game.winner_id
            ) ===
            Number(userId);
        }


        /*
         * -------------------------------------
         * PLAYERS
         * -------------------------------------
         */

        const players =
          Array.isArray(
            game.players
          )
            ? game.players.map(
                (player: any) => ({
                  id: Number(
                    player.id
                  ),

                  username:
                    player.username,

                  score: Number(
                    player.score ?? 0
                  ),

                  position:
                    Number(
                      player.position
                    ),

                  is_dealer:
                    Boolean(
                      player.is_dealer
                    ),

                  player_status:
                    player.player_status,

                  is_you:
                    Boolean(
                      player.is_you
                    ),
                })
              )
            : [];


        /*
         * -------------------------------------
         * RETURN GAME
         * -------------------------------------
         */

        return {

          id: Number(
            game.id
          ),

          code:
            game.code,

          status,

          is_stake_game:
            Boolean(
              game.is_stake_game
            ),

          is_rated:
            Boolean(
              game.is_rated
            ),

          players,

          winner,

          winner_id:
            game.winner_id !== null
              ? Number(
                  game.winner_id
                )
              : null,

          /*
           * Challenge
           */
          challenge_id:
            game.challenge_id !== null
              ? Number(
                  game.challenge_id
                )
              : null,

          challenge_status:
            game.challenge_status ||
            null,

          stake:
            game.stake !== null
              ? Number(
                  game.stake
                )
              : null,

          platform_fee:
            game.platform_fee !== null
              ? Number(
                  game.platform_fee
                )
              : null,

          prize:
            game.prize !== null
              ? Number(
                  game.prize
                )
              : null,

          challenge_expires_at:
            game.challenge_expires_at ||
            null,

          challenge_completed_at:
            game.challenge_completed_at ||
            null,

          /*
           * Game settings
           */
          win_points:
            game.win_points !== null
              ? Number(
                  game.win_points
                )
              : null,

          include_sixes:
            Boolean(
              game.include_sixes
            ),

          include_aces:
            Boolean(
              game.include_aces
            ),

          player_count:
            Number(
              game.player_count
            ),

          /*
           * Timing
           */
          created_at:
            game.created_at,

          started_at:
            game.started_at,

          ended_at:
            game.ended_at,

          /*
           * Turn
           */
          current_player_position:
            Number(
              game.current_player_position
            ),

          current_turn_user_id:
            game.current_turn_user_id !==
            null
              ? Number(
                  game.current_turn_user_id
                )
              : null,

          turn_started_at:
            game.turn_started_at ||
            null,

          turn_timeout_seconds:
            game.turn_timeout_seconds !==
            null
              ? Number(
                  game.turn_timeout_seconds
                )
              : null,

          forfeit_at:
            game.forfeit_at ||
            null,

          forfeited_by:
            game.forfeited_by !== null
              ? Number(
                  game.forfeited_by
                )
              : null,
        };
      });


    /*
     * -----------------------------------------
     * RESPONSE
     * -----------------------------------------
     */

    return res.status(200).json({

      games: formattedGames,

      pagination: {
        page,
        limit,
        total,
        totalPages,

        hasNextPage:
          page <
          totalPages,

        hasPreviousPage:
          page > 1,
      },

      filters: {
        status: statusFilter,
        type: typeFilter,
      },

    });

  } catch (error) {

    console.error(
      "Error fetching all created games:",
      error
    );

    return res.status(500).json({
      message:
        "Failed to fetch created games",
    });
  }
};

export { createGame, createBotGame, joinGame, getUserGames};