
// create a function for settling cash challenges after it is completed

import { mixpanel, serverSocket } from "..";
import sql from "../config/db";
import { getGameByCode, saveGame } from "../utils/gameFunctions";

export const settleCashChallenge = async(challenge_id:number, winner_id: number) =>{
    console.log('challenge_id', challenge_id, 'winner_id', winner_id)


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
         throw new Error("Challenge not found")
      }

      const challenge = challengeRows[0];

      /*
       * ==================================================
       * STEP 2
       * Make sure this challenge hasn't already settled
       * ==================================================
       */

      if (challenge.status === "completed") {
        throw new Error('Challenge has already been settled')
      }

      if (challenge.status !== "accepted") {
         throw new Error(`Challenge cannot be settled because its status is '${challenge.status}'`,)
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
        throw new Error("Winner is not a participant in this challenge")
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
        throw new Error("Could not find both player's wallets")
      }

      const creatorWallet = wallets.find(
        (wallet) => Number(wallet.user_id) === creatorId,
      );

      const opponentWallet = wallets.find(
        (wallet) => Number(wallet.user_id) === opponentId,
      );

      if (!creatorWallet || !opponentWallet) {
        throw new Error("Could not find player wallets")
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
        throw new Error("Creator's locked stake is insufficient",)
      }

      if (opponentLocked < stake) {
        throw new Error("Opponent's locked stake is insufficient")
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
        throw new Error("Invalid challenge payout configuration",)
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

      console.log({
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

    }
}