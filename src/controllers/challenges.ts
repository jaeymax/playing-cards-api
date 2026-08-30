import { Request, Response } from "express";
import sql from "../config/db";
import {
  createGamePlayer,
  getGameByCode,
  saveGame,
} from "../utils/gameFunctions";
import { expiredChallenges, mixpanel, serverSocket } from "..";
import asyncHandler from "express-async-handler";

const createChallenge = asyncHandler(async (req: Request, res: Response) => {
  const {
    opponent_id,
    match_type,
    challenge_mode,

    // Game configuration
    winPoints,
    numPlayers,
    includeSixes,
    includeAces,

    // Only required for stake games
    stake,
  } = req.body;

  // =====================================================
  // 1. AUTHENTICATED USER
  // =====================================================

  console.log(
    "opponent_id: ",
    opponent_id,
    "match_type: ",
    match_type,
    "challenge_mode: ",
    challenge_mode,
  );
  console.log(
    "win points: ",
    winPoints,
    "numplayers: ",
    numPlayers,
    "include Sixes: ",
    includeSixes,
    "include Aces: ",
    includeAces,
  );
  console.log("stake: ", stake);

  const creator_id = req.user?.userId;

  if (!creator_id) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });
    return;
  }

  // =====================================================
  // 2. BASIC VALIDATION
  // =====================================================

  if (!winPoints || !numPlayers) {
    res.status(400).json({
      success: false,
      message: "Win points and number of players are required",
    });
    return;
  }

  if (!match_type) {
    res.status(400).json({
      success: false,
      message: "Match type is required",
    });
    return;
  }

  if (!["friendly", "stake"].includes(match_type)) {
    res.status(400).json({
      success: false,
      message: "Match type must be either friendly or stake",
    });
    return;
  }

  if (!challenge_mode) {
    res.status(400).json({
      success: false,
      message: "Challenge mode is required",
    });
    return;
  }

  if (!["private", "direct", "open"].includes(challenge_mode)) {
    res.status(400).json({
      success: false,
      message: "Challenge mode must be private, direct or open",
    });
    return;
  }

  // =====================================================
  // 3. CASH GAMES ARE CURRENTLY 2 PLAYERS ONLY
  // =====================================================

  if (match_type === "stake" && Number(numPlayers) !== 2) {
    res.status(400).json({
      success: false,
      message: "Cash challenges are currently limited to 2 players",
    });
    return;
  }

  // =====================================================
  // 4. VALIDATE OPPONENT
  // =====================================================

  // Direct challenges MUST specify an opponent
  if (challenge_mode === "direct" && !opponent_id) {
    res.status(400).json({
      success: false,
      message: "An opponent is required for a direct challenge",
    });
    return;
  }

  // Open challenges don't have an opponent yet
  if (challenge_mode === "open" && opponent_id) {
    res.status(400).json({
      success: false,
      message: "Open challenges cannot specify an opponent",
    });
    return;
  }

  // Creator cannot challenge themselves
  if (opponent_id && Number(opponent_id) === Number(creator_id)) {
    res.status(400).json({
      success: false,
      message: "You cannot challenge yourself",
    });
    return;
  }

  // =====================================================
  // 5. VALIDATE STAKE
  // =====================================================

  const numericStake = Number(stake || 0);

  let platformFee = 0;
  let winnerPayout = 0;

  if (match_type === "stake") {
    if (!Number.isFinite(numericStake) || numericStake <= 0) {
      res.status(400).json({
        success: false,
        message: "Stake amount must be greater than 0",
      });
      return;
    }

    // Two-player cash game
    const totalPot = numericStake * 2;

    // 5% platform fee
    platformFee = Number((totalPot * 0.05).toFixed(2));

    winnerPayout = Number((totalPot - platformFee).toFixed(2));
  }

  try {
    // ===================================================
    // 6. VERIFY OPPONENT EXISTS
    // ===================================================

    if (opponent_id) {
      const opponent = await sql`
          SELECT id
          FROM users
          WHERE id = ${opponent_id}
          LIMIT 1
        `;

      if (opponent.length === 0) {
        res.status(404).json({
          success: false,
          message: "Opponent not found",
        });
        return;
      }
    }

    // ===================================================
    // 7. PREVENT DUPLICATE DIRECT CHALLENGES
    // ===================================================

    if (challenge_mode === "direct" && opponent_id) {
      const existingChallenge = await sql`
          SELECT id
          FROM challenges
          WHERE creator_id = ${creator_id}
            AND opponent_id = ${opponent_id}
            AND status = 'waiting'
          LIMIT 1
        `;

      if (existingChallenge.length > 0) {
        res.status(409).json({
          success: false,
          message: "You already have a pending challenge with this player",
          challenge_id: existingChallenge[0].id,
        });
        return;
      }
    }

    // ===================================================
    // 8. GET RANDOMIZED CARDS
    // ===================================================

    const cards = await sql`
        SELECT card_id
        FROM cards
        ORDER BY RANDOM()
      `;

    // ===================================================
    // 9. GENERATE GAME CODE
    // ===================================================

    const gameCode = Math.random().toString(36).substring(2, 12);

    // ===================================================
    // 10. EXPIRATION
    // ===================================================

    // You can change this to whatever duration you want.
    const expiresAt = new Date(Date.now() + 2 * 60 * 1000);

    // ===================================================
    // 11. CREATE EVERYTHING ATOMICALLY
    // ===================================================

    const transactionQueries = [
      sql`
          WITH wallet_lock AS (

            -- ===========================================
            -- LOCK CREATOR STAKE
            -- ===========================================

            UPDATE wallets
            SET
              locked_balance =
                locked_balance + ${numericStake},

              updated_at =
                CURRENT_TIMESTAMP

            WHERE
              user_id = ${creator_id}

              AND ${match_type === "stake"}

              AND (
                balance - locked_balance
              ) >= ${numericStake}

            RETURNING
              id,
              user_id
          ),

          new_game AS (

            -- ===========================================
            -- CREATE GAME
            -- ===========================================

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
              ${creator_id},
              ${numPlayers},
              ${includeSixes ?? false},
              ${includeAces ?? false},
              ${winPoints},
              'waiting'

            WHERE
              ${match_type === "friendly"}

              OR EXISTS (
                SELECT 1
                FROM wallet_lock
              )

            RETURNING *
          ),

          new_game_player AS (

            -- ===========================================
            -- ADD CREATOR TO GAME
            -- ===========================================

            INSERT INTO game_players (
              game_id,
              user_id,
              position,
              is_dealer,
              status
            )

            SELECT
              id,
              ${creator_id},
              0,
              true,
              'active'

            FROM new_game

            RETURNING *
          ),

          new_challenge AS (

            -- ===========================================
            -- CREATE CHALLENGE
            -- ===========================================

            INSERT INTO challenges (
              creator_id,
              opponent_id,
              game_id,

              type,
              challenge_mode,

              stake,
              platform_fee,
              winner_payout,

              status,
              expires_at
            )

            SELECT
              ${creator_id},
              ${opponent_id || null},
              id,

              ${match_type},
              ${challenge_mode},

              ${match_type === "stake" ? numericStake : null},

              ${platformFee},
              ${winnerPayout},

              'waiting',
              ${expiresAt}

            FROM new_game

            RETURNING *
          ),

          wallet_transaction AS (

            -- ===========================================
            -- RECORD STAKE LOCK
            -- ===========================================

            INSERT INTO wallet_transactions (
              user_id,
              type,
              amount,
              challenge_id,
              reference,
              status
            )

            SELECT
              ${creator_id},
              'challenge_lock',
              ${numericStake},
              id,
              ${gameCode},
              'completed'

            FROM new_challenge

            WHERE
              ${match_type === "stake"}

            RETURNING *
          ),

          update_game AS (

            -- ===========================================
            -- LINK CHALLENGE TO GAME
            -- ===========================================

            UPDATE games

            SET
              challenge_id =
                new_challenge.id

            FROM new_challenge

            WHERE
              games.id =
                new_challenge.game_id

            RETURNING games.*
          )

          -- =============================================
          -- RETURN GAME + PLAYER + CHALLENGE
          -- =============================================

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

                  WHERE
                    u.id = gp.user_id
                )
              )

              FROM new_game_player gp

              LIMIT 1

            ) AS player,

            (
              SELECT json_build_object(
                'id', c.id,
                'creator_id', c.creator_id,
                'opponent_id', c.opponent_id,
                'game_id', c.game_id,

                'match_type', c.type,
                'challenge_mode',
                  c.challenge_mode,

                'stake', c.stake,
                'platform_fee',
                  c.platform_fee,
                'winner_payout',
                  c.winner_payout,

                'status', c.status,
                'expires_at',
                  c.expires_at
              )

              FROM new_challenge c

              LIMIT 1

            ) AS challenge

          FROM new_game g;
        `,
    ];

    const [transactionResult] = await sql.transaction(transactionQueries);

    // ===================================================
    // 12. MAKE SURE CREATION SUCCEEDED
    // ===================================================

    if (!transactionResult || transactionResult.length === 0) {
      if (match_type === "stake") {
        res.status(400).json({
          success: false,
          message: "Insufficient available balance to cover the stake",
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "Failed to create challenge",
      });

      return;
    }

    const row = transactionResult[0];

    // ===================================================
    // 13. SCHEDULE EXPIRATION
    // ===================================================

    const challenge = row.challenge;

    if (challenge && challenge.id) {
      const expirationTime = new Date(challenge.expires_at).getTime();

      const delayMs = expirationTime - Date.now();

      await expiredChallenges.scheduleExpiredChallenge(
        challenge.id,
        Math.max(delayMs, 0),
      );
    }

    // ===================================================
    // 14. CREATE GAME CARDS
    // ===================================================

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

          unnest(
            ${cards.map((c) => c.card_id)}::integer[]
          ),

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

            WHERE
              card_id =
                game_cards.card_id

          ) AS card
      `;

    // ===================================================
    // 15. BUILD GAME OBJECT
    // ===================================================

    const game: any = {
      ...row,

      players: row.player ? [row.player] : [],

      cards: gameCards,

      challenge: row.challenge || null,

      isStakeGame: match_type === "stake",
    };

    delete game.player;

    // ===================================================
    // 16. MIXPANEL
    // ===================================================

    mixpanel.track("Challenge Created", {
      distinct_id: creator_id,

      challenge_id: challenge?.id,

      game_code: gameCode,

      match_type,

      challenge_mode,

      num_players: numPlayers,

      win_points: winPoints,

      ...(match_type === "stake" && {
        stake: numericStake,

        platform_fee: platformFee,

        winner_payout: winnerPayout,
      }),
    });

    // ===================================================
    // 17. SAVE GAME TO REDIS
    // ===================================================

    await saveGame(gameCode, game);

    console.log("Challenge created successfully:", game);

    // ===================================================
    // 18. RESPONSE
    // ===================================================

    res.status(201).json({
      success: true,
      game,
      challenge: challenge || null,
    });
  } catch (error: any) {
    console.error("Failed to create challenge:", error);

    if (
      error?.message === "INSUFFICIENT_BALANCE" ||
      error?.code === "INSUFFICIENT_BALANCE"
    ) {
      res.status(400).json({
        success: false,
        message: "Insufficient available balance to cover the stake",
      });

      return;
    }

    res.status(500).json({
      success: false,
      message: "Failed to create challenge",
      error: error.message,
    });
  }
});

const getOpenChallenges = asyncHandler(async (req: Request, res: Response) => {
  const { user_id } = req.body;

  try {
    const challenges = await sql`SELECT c.id, c.creator_id, u.image_url as creator_avatar, u.username as creator_username, c.game_id, c.stake, c.platform_fee, c.winner_payout, c.win_points, c.include_sixes, c.include_aces, c.status, c.expires_at, c.created_at, c.type, c.is_rated, c.player_count FROM challenges c JOIN users u ON c.creator_id = u.id
      WHERE status = 'waiting' and challenge_mode = 'open'`;

    res.json({ success: true, challenges });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching challenges",
      error: error.message,
    });
  }
});

const getChallenges = asyncHandler(async (req: Request, res: Response) => {
  const { user_id } = req.body;

  try {
    const challenges = await sql`
      SELECT c.id, c.creator_id, u.image_url, c.game_id, c.stake, c.platform_fee, c.winner_payout, c.win_points, c.include_sixed, c.include_aces, c.status, c.expires_at, c.created_at, c.type, c.is_rated, c.player_count FROM challenges c JOIN users u ON c.creator.id = u.id
      WHERE status = 'waiting' and challenge_mode = 'open'`;

    res.json({ success: true, challenges });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching challenges",
      error: error.message,
    });
  }
});

const acceptChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { challenge_id } = req.body;
  const user_id = req.user?.userId;

  // --------------------------------------------------
  // 1. BASIC VALIDATION
  // --------------------------------------------------

  if (!challenge_id) {
    res.status(400).json({
      success: false,
      message: "Challenge ID is required",
    });
    return;
  }



  let transactionResult = null;

  const challengeStake = await sql`select stake from challenges where id = ${challenge_id}`

  try {
    /*
     * ------------------------------------------------
     * 2. ACCEPT CHALLENGE ATOMICALLY
     * ------------------------------------------------
     *
     * Everything below happens as one PostgreSQL
     * operation:
     *
     *  - Find valid challenge
     *  - Lock opponent's stake
     *  - Accept challenge
     *  - Add opponent to game
     *  - Create wallet transaction
     *  - Start game
     *
     * If anything fails, everything rolls back.
     */

    if(challengeStake[0].stake){
      
          [transactionResult] = await sql.transaction([
            sql`
                WITH target_challenge AS (
      
                  -- ------------------------------------------
                  -- Find the challenge and lock its row
                  -- ------------------------------------------
      
                  SELECT
                    id,
                    creator_id,
                    game_id,
                    stake,
                    platform_fee,
                    winner_payout,
                    status,
                    expires_at
                  FROM challenges
                  WHERE
                    id = ${challenge_id}
                    AND status = 'waiting'
                    AND expires_at > CURRENT_TIMESTAMP
                    AND creator_id <> ${user_id}
                  FOR UPDATE
      
                ),
      
                wallet_lock AS (
      
                  -- ------------------------------------------
                  -- Lock opponent's stake
                  -- ------------------------------------------
      
                  UPDATE wallets w
                  SET
                    locked_balance =
                      w.locked_balance + tc.stake,
                    updated_at = CURRENT_TIMESTAMP
      
                  FROM target_challenge tc
      
                  WHERE
                    w.user_id = ${user_id}
                    AND (
                      w.balance - w.locked_balance
                    ) >= tc.stake
      
                  RETURNING
                    w.id,
                    w.user_id,
                    tc.id AS challenge_id,
                    tc.game_id,
                    tc.stake
      
                ),
      
                accepted_challenge AS (
      
                  -- ------------------------------------------
                  -- Accept challenge
                  -- ------------------------------------------
      
                  UPDATE challenges c
      
                  SET
                    status = 'accepted',
                    opponent_id = ${user_id}
      
                  FROM wallet_lock wl
      
                  WHERE
                    c.id = wl.challenge_id
                    AND c.status = 'waiting'
      
                  RETURNING
                    c.id,
                    c.creator_id,
                    c.opponent_id,
                    c.game_id,
                    c.stake,
                    c.platform_fee,
                    c.winner_payout,
                    c.status,
                    c.expires_at
      
                ),
      
                new_game_player AS (
      
                  -- ------------------------------------------
                  -- Add opponent to game
                  -- ------------------------------------------
      
                  INSERT INTO game_players (
                    game_id,
                    user_id,
                    position,
                    is_dealer,
                    status
                  )
      
                  SELECT
                    ac.game_id,
                    ${user_id},
      
                    -- Host is position 0,
                    -- opponent is position 1
                    1,
      
                    false,
                    'active'
      
                  FROM accepted_challenge ac
      
                  RETURNING
                    id,
                    game_id,
                    user_id,
                    score,
                    games_won,
                    position,
                    is_dealer,
                    status
      
                ),
      
                wallet_transaction AS (
      
                  -- ------------------------------------------
                  -- Record opponent's locked stake
                  -- ------------------------------------------
      
                  INSERT INTO wallet_transactions (
                    user_id,
                    type,
                    amount,
                    challenge_id,
                    reference,
                    status
                  )
      
                  SELECT
                    ${user_id},
                    'challenge_lock',
                    ac.stake,
                    ac.id,
      
                    CONCAT(
                      'CHALLENGE-',
                      ac.id
                    ),
      
                    'completed'
      
                  FROM accepted_challenge ac
      
                  RETURNING id
      
                ),
      
                updated_game AS (
      
                  -- ------------------------------------------
                  -- Start the game
                  -- ------------------------------------------
      
                  UPDATE games g
      
                  SET
                    status = 'in_progress', current_turn_user_id = ${user_id}
      
                  FROM accepted_challenge ac
      
                  WHERE
                    g.id = ac.game_id
      
                  RETURNING
                    g.*
      
                )
      
                -- --------------------------------------------
                -- Return everything needed by Node
                -- --------------------------------------------
      
                SELECT
                  ug.id AS game_id,
                  ug.code AS game_code,
                  ug.status AS game_status,
      
                  (
                    SELECT json_build_object(
                      'id', ac.id,
                      'creator_id', ac.creator_id,
                      'opponent_id', ac.opponent_id,
                      'game_id', ac.game_id,
                      'stake', ac.stake,
                      'platform_fee', ac.platform_fee,
                      'winner_payout', ac.winner_payout,
                      'status', ac.status,
                      'expires_at', ac.expires_at
                    )
                    FROM accepted_challenge ac
                    LIMIT 1
                  ) AS challenge,
      
                  (
                    SELECT json_build_object(
                      'id', gp.id,
                      'game_id', gp.game_id,
                      'user_id', gp.user_id,
                      'score', gp.score,
                      'games_won', gp.games_won,
                      'position', gp.position,
                      'is_dealer', gp.is_dealer,
                      'status', gp.status
                    )
                    FROM new_game_player gp
                    LIMIT 1
                  ) AS player
      
                FROM updated_game ug;
              `,
          ]);

    }
    else{

      [transactionResult] = await sql.transaction([
            sql`
                WITH target_challenge AS (
      
                  -- ------------------------------------------
                  -- Find the challenge and lock its row
                  -- ------------------------------------------
      
                  SELECT
                    id,
                    creator_id,
                    game_id,
                    stake,
                    platform_fee,
                    winner_payout,
                    status,
                    expires_at
                  FROM challenges
                  WHERE
                    id = ${challenge_id}
                    AND status = 'waiting'
                    AND expires_at > CURRENT_TIMESTAMP
                    AND creator_id <> ${user_id}
                  FOR UPDATE
      
                ),
      
                accepted_challenge AS (
      
                  -- ------------------------------------------
                  -- Accept challenge
                  -- ------------------------------------------
      
                  UPDATE challenges c
      
                  SET
                    status = 'accepted',
                    opponent_id = ${user_id}
      
                  FROM target_challenge tc
      
                  WHERE
                    c.id = tc.id
                    AND c.status = 'waiting'
      
                  RETURNING
                    c.id,
                    c.creator_id,
                    c.opponent_id,
                    c.game_id,
                    c.stake,
                    c.platform_fee,
                    c.winner_payout,
                    c.status,
                    c.expires_at
      
                ),
      
                new_game_player AS (
      
                  -- ------------------------------------------
                  -- Add opponent to game
                  -- ------------------------------------------
      
                  INSERT INTO game_players (
                    game_id,
                    user_id,
                    position,
                    is_dealer,
                    status
                  )
      
                  SELECT
                    ac.game_id,
                    ${user_id},
      
                    -- Host is position 0,
                    -- opponent is position 1
                    1,
      
                    false,
                    'active'
      
                  FROM accepted_challenge ac
      
                  RETURNING
                    id,
                    game_id,
                    user_id,
                    score,
                    games_won,
                    position,
                    is_dealer,
                    status
      
                ),
      
                updated_game AS (
      
                  -- ------------------------------------------
                  -- Start the game
                  -- ------------------------------------------
      
                  UPDATE games g
      
                  SET
                    status = 'in_progress', current_turn_user_id = ${user_id}
      
                  FROM accepted_challenge ac
      
                  WHERE
                    g.id = ac.game_id
      
                  RETURNING
                    g.*
      
                )
      
                -- --------------------------------------------
                -- Return everything needed by Node
                -- --------------------------------------------
      
                SELECT
                  ug.id AS game_id,
                  ug.code AS game_code,
                  ug.status AS game_status,
      
                  (
                    SELECT json_build_object(
                      'id', ac.id,
                      'creator_id', ac.creator_id,
                      'opponent_id', ac.opponent_id,
                      'game_id', ac.game_id,
                      'stake', ac.stake,
                      'platform_fee', ac.platform_fee,
                      'winner_payout', ac.winner_payout,
                      'status', ac.status,
                      'expires_at', ac.expires_at
                    )
                    FROM accepted_challenge ac
                    LIMIT 1
                  ) AS challenge,
      
                  (
                    SELECT json_build_object(
                      'id', gp.id,
                      'game_id', gp.game_id,
                      'user_id', gp.user_id,
                      'score', gp.score,
                      'games_won', gp.games_won,
                      'position', gp.position,
                      'is_dealer', gp.is_dealer,
                      'status', gp.status
                    )
                    FROM new_game_player gp
                    LIMIT 1
                  ) AS player
      
                FROM updated_game ug;
              `,
          ]);
    }


    // --------------------------------------------------
    // 3. TRANSACTION FAILED / CHALLENGE UNAVAILABLE
    // --------------------------------------------------

    if (!transactionResult || transactionResult.length === 0) {
      /*
       * We don't immediately know whether the reason
       * was:
       *
       * - challenge doesn't exist
       * - already accepted
       * - expired
       * - creator trying to accept own challenge
       * - insufficient balance
       *
       * Check those separately below.
       */

      const challengeCheck = await sql`
          SELECT
            id,
            creator_id,
            status,
            expires_at,
            stake
          FROM challenges
          WHERE id = ${challenge_id}
        `;

      if (challengeCheck.length === 0) {
        res.status(404).json({
          success: false,
          message: "Challenge not found",
        });
        return;
      }

      const existingChallenge = challengeCheck[0];

      if (existingChallenge.creator_id === user_id) {
        res.status(400).json({
          success: false,
          message: "You cannot accept your own challenge",
        });
        return;
      }
      if (
        existingChallenge.expires_at &&
        new Date(existingChallenge.expires_at) <= new Date()
      ) {
        res.status(400).json({
          success: false,
          message: "This challenge has expired",
        });
        return;
      }

      if (existingChallenge.status !== "waiting") {
        res.status(400).json({
          success: false,
          message: "This challenge has already been accepted",
        });
        return;
      }

      // Challenge is valid but wallet lock failed
      res.status(400).json({
        success: false,
        message: "Insufficient available balance to accept this challenge",
      });

      return;
    }

    // --------------------------------------------------
    // 4. GET TRANSACTION RESULT
    // --------------------------------------------------

    const result = transactionResult[0];

    const challenge = result.challenge;
    const opponentPlayer = result.player;

    // --------------------------------------------------
    // 5. GET FULL GAME FROM YOUR GAME STATE
    // --------------------------------------------------

    const gameCode = result.game_code;

    const game = await getGameByCode(gameCode);

    if (!game) {
      /*
       * The database transaction already succeeded.
       *
       * Don't try to reverse the financial transaction
       * here manually.
       *
       * This should be handled as an infrastructure /
       * Redis synchronization issue.
       */

      console.error(`Game ${gameCode} was accepted but could not be loaded`);

      res.status(500).json({
        success: false,
        message: "Challenge accepted but game could not be loaded",
      });

      return;
    }

    // cancel Challenge Expiry

    await expiredChallenges.cancelExpiredChallenge(challenge.id);

    // --------------------------------------------------
    // 6. UPDATE GAME STATE
    // --------------------------------------------------

    game.challenge = challenge;

    game.status = "in_progress";

    game.turn_started_at = Date.now();
    const turn_ends_at =
      game.turn_started_at + game.turn_timeout_seconds * 1000;
    game.turn_ends_at = turn_ends_at;

    game.isStakeGame = true;

    // Make sure players exists
    if (!Array.isArray(game.players)) {
      game.players = [];
    }

    /*
     * The host already exists in the game state.
     *
     * Add opponent.
     *
     * Avoid adding the same player twice if, for some
     * reason, this code is triggered again.
     */

    const alreadyExists = game.players.some(
      (player: any) =>
        Number(player.user_id || player.user?.id) === Number(user_id),
    );

    if (!alreadyExists) {
      /*
       * Use the player returned from the database.
       *
       * If you need the full user object, you can fetch
       * it here or modify the SQL above to include it.
       */

      const [fullPlayer] = await sql`
          SELECT
            gp.id,
            gp.game_id,
            gp.user_id,
            gp.score,
            gp.games_won,
            gp.position,
            gp.is_dealer,
            gp.status,
            json_build_object(
              'id', u.id,
              'username', u.username,
              'image_url', u.image_url
            ) AS user
          FROM game_players gp
          JOIN users u
            ON u.id = gp.user_id
          WHERE
            gp.game_id = ${result.game_id}
            AND gp.user_id = ${user_id}
          LIMIT 1
        `;

      if (fullPlayer) {
        game.players.push(fullPlayer);
      } else if (opponentPlayer) {
        game.players.push(opponentPlayer);
      }
    }

    // --------------------------------------------------
    // 7. SAVE UPDATED GAME STATE
    // --------------------------------------------------

    await saveGame(gameCode, game);

    // --------------------------------------------------
    // 8. NOTIFY BOTH PLAYERS
    // --------------------------------------------------

    serverSocket.to(gameCode).emit("gameData", game);

    // --------------------------------------------------
    // 9. MIXPANEL
    // --------------------------------------------------

    mixpanel.track("Cash Challenge Accepted", {
      distinct_id: user_id,
      challenge_id: challenge.id,
      game_code: gameCode,
      stake: Number(challenge.stake),
      platform_fee: Number(challenge.platform_fee),
      winner_payout: Number(challenge.winner_payout),
    });

    // --------------------------------------------------
    // 10. RESPONSE
    // --------------------------------------------------

    res.status(200).json({
      success: true,

      challenge,

      game: {
        id: result.game_id,
        code: gameCode,
        status: "in_progress",
      },

      player: opponentPlayer,
    });
  } catch (error: any) {
    console.error("Error accepting cash challenge:", error);

    res.status(500).json({
      success: false,
      message: "Error accepting challenge",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

const cancelChallenge = asyncHandler(async (req: Request, res: Response) => {
  const { challenge_id } = req.body;
  const user_id = req.user?.userId;

  // --------------------------------------------------
  // 1. VALIDATION
  // --------------------------------------------------

  if (!challenge_id) {
    res.status(400).json({
      success: false,
      message: "Challenge ID is required",
    });
    return;
  }

  if (!user_id) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });
    return;
  }

  try {
    /*
     * ------------------------------------------------
     * ATOMIC CANCELLATION + REFUND
     * ------------------------------------------------
     *
     * Everything financial happens together:
     *
     * 1. Find creator's waiting challenge
     * 2. Lock challenge row
     * 3. Release creator's locked stake
     * 4. Create refund transaction
     * 5. Mark challenge cancelled
     * 6. Cancel associated game
     *
     * If anything fails, PostgreSQL rolls everything back.
     */

    const [transactionResult] = await sql.transaction([
      sql`
          WITH target_challenge AS (

            -- ------------------------------------------
            -- Find creator's waiting challenge
            -- ------------------------------------------

            SELECT
              id,
              creator_id,
              game_id,
              stake,
              platform_fee,
              winner_payout,
              status,
              expires_at

            FROM challenges

            WHERE
              id = ${challenge_id}
              AND creator_id = ${user_id}
              AND status = 'waiting'

            FOR UPDATE

          ),

          release_wallet AS (

            -- ------------------------------------------
            -- Release creator's locked stake
            -- ------------------------------------------

            UPDATE wallets w

            SET
              locked_balance =
                w.locked_balance - tc.stake,

              updated_at = CURRENT_TIMESTAMP

            FROM target_challenge tc

            WHERE
              w.user_id = tc.creator_id

              -- Safety check
              AND w.locked_balance >= tc.stake

            RETURNING
              w.id,
              w.user_id,
              tc.id AS challenge_id,
              tc.stake

          ),

          refund_transaction AS (

            -- ------------------------------------------
            -- Record the refund
            -- ------------------------------------------

            INSERT INTO wallet_transactions (
              user_id,
              type,
              amount,
              challenge_id,
              reference,
              status
            )

            SELECT
              tc.creator_id,
              'refund',
              tc.stake,
              tc.id,

              CONCAT(
                'CHALLENGE-CANCEL-REFUND-',
                tc.id
              ),

              'completed'

            FROM target_challenge tc

            INNER JOIN release_wallet rw
              ON rw.challenge_id = tc.id

            RETURNING
              id

          ),

          cancelled_challenge AS (

            -- ------------------------------------------
            -- Mark challenge as cancelled
            -- ------------------------------------------

            UPDATE challenges c

            SET
              status = 'cancelled'

            FROM target_challenge tc

            INNER JOIN release_wallet rw
              ON rw.challenge_id = tc.id

            WHERE
              c.id = tc.id
              AND c.status = 'waiting'

            RETURNING
              c.id,
              c.creator_id,
              c.game_id,
              c.stake,
              c.platform_fee,
              c.winner_payout,
              c.status,
              c.expires_at

          ),

          cancelled_game AS (

            -- ------------------------------------------
            -- Cancel associated waiting game
            -- ------------------------------------------

            UPDATE games g

            SET
              status = 'cancelled'

            FROM cancelled_challenge cc

            WHERE
              g.id = cc.game_id
              AND g.status = 'waiting'

            RETURNING
              g.id,
              g.code,
              g.status

          )

          -- --------------------------------------------
          -- RETURN RESULT
          -- --------------------------------------------

          SELECT
            cc.id AS challenge_id,
            cc.creator_id,
            cc.game_id,
            cc.stake,
            cc.platform_fee,
            cc.winner_payout,
            cc.status,
            cc.expires_at,

            cg.code AS game_code,
            cg.status AS game_status

          FROM cancelled_challenge cc

          LEFT JOIN cancelled_game cg
            ON cg.id = cc.game_id;
        `,
    ]);

    // --------------------------------------------------
    // 2. CHALLENGE WAS NOT CANCELLED
    // --------------------------------------------------

    if (!transactionResult || transactionResult.length === 0) {
      const challenge = await sql`
          SELECT
            id,
            creator_id,
            game_id,
            stake,
            status,
            expires_at
          FROM challenges
          WHERE id = ${challenge_id}
        `;

      // Challenge doesn't exist
      if (challenge.length === 0) {
        res.status(404).json({
          success: false,
          message: "Challenge not found",
        });
        return;
      }

      const existingChallenge = challenge[0];

      // Someone else owns it
      if (Number(existingChallenge.creator_id) !== Number(user_id)) {
        res.status(403).json({
          success: false,
          message: "You are not authorized to cancel this challenge",
        });
        return;
      }

      // Already accepted
      if (existingChallenge.status === "accepted") {
        res.status(400).json({
          success: false,
          message:
            "You cannot cancel a challenge that has already been accepted",
        });
        return;
      }

      // Already in progress
      if (existingChallenge.status === "in_progress") {
        res.status(400).json({
          success: false,
          message: "You cannot cancel a challenge that is already in progress",
        });
        return;
      }

      // Already cancelled
      if (existingChallenge.status === "cancelled") {
        res.status(400).json({
          success: false,
          message: "This challenge has already been cancelled",
        });
        return;
      }

      // Already expired
      if (existingChallenge.status === "expired") {
        res.status(400).json({
          success: false,
          message: "This challenge has already expired",
        });
        return;
      }

      res.status(400).json({
        success: false,
        message: "Challenge cannot be cancelled",
      });

      return;
    }

    // --------------------------------------------------
    // 3. GET RESULT
    // --------------------------------------------------

    const result = transactionResult[0];

    console.log(
      `Challenge ${result.challenge_id} cancelled. ` +
        `Refunded ₵${result.stake} to user ${result.creator_id}`,
    );

    // --------------------------------------------------
    // 4. CANCEL BULLMQ EXPIRATION JOB
    // --------------------------------------------------

    /*
     * IMPORTANT:
     *
     * The database transaction above is the source
     * of truth.
     *
     * Removing the BullMQ job is just cleanup.
     */

    if (expiredChallenges) {
      await expiredChallenges.cancelExpiredChallenge(
        Number(result.challenge_id),
      );
    }

    // --------------------------------------------------
    // 5. UPDATE REDIS GAME STATE
    // --------------------------------------------------

    if (result.game_code) {
      const game = await getGameByCode(result.game_code);

      if (game) {
        game.status = "cancelled";

        if (game.challenge) {
          game.challenge.status = "cancelled";
        }

        await saveGame(result.game_code, game);

        // ------------------------------------------------
        // NOTIFY CONNECTED CLIENTS
        // ------------------------------------------------

        // serverSocket
        //   .to(result.game_code)
        //   .emit("challengeCancelled", {
        //     challengeId:
        //       result.challenge_id,

        //     gameCode:
        //       result.game_code,

        //     refundAmount:
        //       Number(result.stake),

        //     message:
        //       "The challenge was cancelled and your stake has been refunded.",
        //   });
        // serverSocket.to(result.game_code).emit("gameData", game);
      }
    }

    // --------------------------------------------------
    // 6. MIXPANEL
    // --------------------------------------------------

    mixpanel.track("Cash Challenge Cancelled", {
      distinct_id: user_id,
      challenge_id: result.challenge_id,

      game_code: result.game_code,

      stake: Number(result.stake),

      refund_amount: Number(result.stake),
    });

    // --------------------------------------------------
    // 7. RESPONSE
    // --------------------------------------------------

    res.status(200).json({
      success: true,

      message: "Challenge cancelled and stake refunded",

      challenge: {
        id: result.challenge_id,
        status: result.status,
        stake: Number(result.stake),
        expiresAt: result.expires_at,
      },

      refund: {
        amount: Number(result.stake),
        status: "completed",
      },

      game: {
        id: result.game_id,
        code: result.game_code,
        status: "cancelled",
      },
    });
  } catch (error: any) {
    console.error("Error cancelling challenge:", error);

    res.status(500).json({
      success: false,
      message: "Error cancelling challenge",

      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

const settleCashChallenge = asyncHandler(
  async (req: Request, res: Response) => {
    const { challenge_id, winner_id } = req.body;

    if (!challenge_id || !winner_id) {
      res.status(400).json({
        success: false,
        message: "Challenge ID and winner ID are required",
      });
      return;
    }

    try {
      /*
       * ==================================================
       * STEP 1
       * Get and lock the challenge
       * ==================================================
       */

      const challengeRows = await sql`
        SELECT
          id,
          creator_id,
          opponent_id,
          game_id,
          stake,
          platform_fee,
          winner_payout,
          status
        FROM challenges
        WHERE id = ${challenge_id}
        FOR UPDATE
      `;

      if (challengeRows.length === 0) {
        res.status(404).json({
          success: false,
          message: "Challenge not found",
        });
        return;
      }

      const challenge = challengeRows[0];

      /*
       * ==================================================
       * STEP 2
       * Make sure this challenge hasn't already settled
       * ==================================================
       */

      if (challenge.status === "completed") {
        res.status(400).json({
          success: false,
          message: "Challenge has already been settled",
        });
        return;
      }

      if (challenge.status !== "accepted") {
        res.status(400).json({
          success: false,
          message: `Challenge cannot be settled because its status is '${challenge.status}'`,
        });
        return;
      }

      /*
       * ==================================================
       * STEP 3
       * Verify winner
       * ==================================================
       */

      const creatorId = Number(challenge.creator_id);

      const opponentId = Number(challenge.opponent_id);

      const winnerId = Number(winner_id);

      if (winnerId !== creatorId && winnerId !== opponentId) {
        res.status(400).json({
          success: false,
          message: "Winner is not a participant in this challenge",
        });
        return;
      }

      /*
       * ==================================================
       * STEP 4
       * Get BOTH wallets and lock the rows
       * ==================================================
       */

      const wallets = await sql`
        SELECT
          id,
          user_id,
          balance,
          locked_balance
        FROM wallets
        WHERE user_id IN (
          ${creatorId},
          ${opponentId}
        )
        ORDER BY user_id
        FOR UPDATE
      `;

      if (wallets.length !== 2) {
        res.status(400).json({
          success: false,
          message: "Could not find both player wallets",
        });
        return;
      }

      const creatorWallet = wallets.find(
        (wallet) => Number(wallet.user_id) === creatorId,
      );

      const opponentWallet = wallets.find(
        (wallet) => Number(wallet.user_id) === opponentId,
      );

      if (!creatorWallet || !opponentWallet) {
        res.status(400).json({
          success: false,
          message: "Could not find both player wallets",
        });
        return;
      }

      const stake = Number(challenge.stake);

      /*
       * ==================================================
       * STEP 5
       * Verify escrow is actually locked
       * ==================================================
       */

      const creatorLocked = Number(creatorWallet.locked_balance);

      const opponentLocked = Number(opponentWallet.locked_balance);

      console.log("SETTLEMENT ESCROW CHECK:", {
        challengeId: challenge_id,
        creatorId,
        opponentId,
        stake,
        creatorLocked,
        opponentLocked,
      });

      if (creatorLocked < stake) {
        res.status(400).json({
          success: false,
          message: "Creator's locked stake is insufficient",
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  required: stake,
                  locked: creatorLocked,
                }
              : undefined,
        });
        return;
      }

      if (opponentLocked < stake) {
        res.status(400).json({
          success: false,
          message: "Opponent's locked stake is insufficient",
          debug:
            process.env.NODE_ENV === "development"
              ? {
                  required: stake,
                  locked: opponentLocked,
                }
              : undefined,
        });
        return;
      }

      /*
       * ==================================================
       * STEP 6
       * Calculate payout
       * ==================================================
       */

      const platformFee = Number(challenge.platform_fee);

      const winnerPayout = Number(challenge.winner_payout);

      /*
       * Sanity check.
       *
       * Total pot = stake * 2
       *
       * Winner payout + platform fee
       * must equal total pot.
       */

      const totalPot = stake * 2;

      const calculatedPayout = totalPot - platformFee;

      if (Math.abs(calculatedPayout - winnerPayout) > 0.01) {
        res.status(500).json({
          success: false,
          message: "Invalid challenge payout configuration",
        });
        return;
      }

      /*
       * ==================================================
       * STEP 7
       * Perform settlement atomically
       *
       * IMPORTANT:
       * We are already inside a transaction because
       * this whole controller needs to use one.
       * ==================================================
       */

      const settlementResult = await sql.transaction([
        // ================================================
        // 1. Remove creator's stake from wallet
        // ================================================

        sql`
    UPDATE wallets
    SET
      balance = balance - ${stake},
      locked_balance = locked_balance - ${stake},
      updated_at = CURRENT_TIMESTAMP
    WHERE
      user_id = ${creatorId}
      AND locked_balance >= ${stake}
      AND balance >= ${stake}
  `,

        // ================================================
        // 2. Remove opponent's stake from wallet
        // ================================================

        sql`
    UPDATE wallets
    SET
      balance = balance - ${stake},
      locked_balance = locked_balance - ${stake},
      updated_at = CURRENT_TIMESTAMP
    WHERE
      user_id = ${opponentId}
      AND locked_balance >= ${stake}
      AND balance >= ${stake}
  `,

        // ================================================
        // 3. Credit winner with the final payout
        // ================================================

        sql`
    UPDATE wallets
    SET
      balance = balance + ${winnerPayout},
      updated_at = CURRENT_TIMESTAMP
    WHERE
      user_id = ${winnerId}
  `,

        // ================================================
        // 4. Record winner payout
        // ================================================

        sql`
    INSERT INTO wallet_transactions (
      user_id,
      type,
      amount,
      challenge_id,
      reference,
      status
    )
    VALUES (
      ${winnerId},
      'challenge_win',
      ${winnerPayout},
      ${challenge_id},
      ${`CHALLENGE-SETTLEMENT-${challenge_id}`},
      'completed'
    )
  `,

        // ================================================
        // 5. Complete challenge
        // ================================================

        sql`
    UPDATE challenges
    SET
      status = 'completed',
      winner_id = ${winnerId},
      completed_at = CURRENT_TIMESTAMP
    WHERE
      id = ${challenge_id}
      AND status = 'accepted'
    RETURNING *
  `,

        // ================================================
        // 6. Complete game
        // ================================================

        sql`
    UPDATE games
    SET
      status = 'completed',
      winner_id = ${winnerId}
    WHERE
      id = ${challenge.game_id}
    RETURNING *
  `,
      ]);

      /*
       * ==================================================
       * STEP 8
       * Verify challenge was actually completed
       * ==================================================
       */

      const completedChallenge = settlementResult[4];

      if (!completedChallenge || completedChallenge.length === 0) {
        /*
         * This should never happen.
         *
         * If it does, sql.transaction() rolls back
         * all previous wallet operations.
         */

        throw new Error(
          "Challenge settlement failed while completing challenge",
        );
      }

      const completedGame = settlementResult[5]?.[0];

      /*
       * ==================================================
       * STEP 9
       * Update Redis game state
       * ==================================================
       */

      if (completedGame?.code) {
        const game = await getGameByCode(completedGame.code);

        if (game) {
          game.status = "completed";
          game.winner_id = winnerId;

          if (game.challenge) {
            game.challenge.status = "completed";

            game.challenge.winner_id = winnerId;
          }

          await saveGame(completedGame.code, game);

          /*
           * Notify both players
           */

          serverSocket.to(completedGame.code).emit("cashChallengeSettled", {
            challengeId: Number(challenge_id),

            gameCode: completedGame.code,

            winnerId,

            winnerPayout,

            platformFee,

            status: "completed",
          });
        }
      }

      /*
       * ==================================================
       * STEP 10
       * Analytics
       * ==================================================
       */

      mixpanel.track("Cash Challenge Settled", {
        distinct_id: String(winnerId),

        challenge_id: Number(challenge_id),

        game_id: Number(challenge.game_id),

        winner_id: winnerId,

        stake,

        platform_fee: platformFee,

        winner_payout: winnerPayout,
      });

      /*
       * ==================================================
       * SUCCESS
       * ==================================================
       */

      res.status(200).json({
        success: true,

        message: "Cash challenge settled successfully",

        settlement: {
          challengeId: Number(challenge_id),

          gameId: Number(challenge.game_id),

          winnerId,

          stake,

          totalPot,

          platformFee,

          winnerPayout,

          status: "completed",
        },
      });
    } catch (error: any) {
      console.error("ERROR SETTLING CASH CHALLENGE:", error);

      res.status(500).json({
        success: false,
        message: "Error settling cash challenge",

        error:
          process.env.NODE_ENV === "development" ? error.message : undefined,
      });
    }
  },
);

export {
  createChallenge,
  getChallenges,
  acceptChallenge,
  settleCashChallenge,
  cancelChallenge,
  getOpenChallenges,
};
