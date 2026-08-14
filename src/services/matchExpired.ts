import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import sql from "../config/db";
import { getGameByCode, saveGame } from "../utils/gameFunctions";

export default class ExpiredChallenges {
  private queue: Queue;
  private worker: Worker;
  private serverSocket: any;

  constructor(serverSocket: any) {
    this.serverSocket = serverSocket;

    const redisConnection = new Redis({
      maxRetriesPerRequest: null,
    });

    this.queue = new Queue("expiredChallengesQueue", {
      connection: redisConnection,
    });

    console.log(
      "Creating ExpiredChallenges worker...",
      process.pid,
      Date.now()
    );

    this.worker = new Worker(
      "expiredChallengesQueue",

      async (job: Job) => {
        const start = Date.now();

        await this.processExpiredChallengeJob(job);

        console.log(
          `Job ${job?.id} took ${Date.now() - start}ms`
        );
      },

      {
        connection: new Redis({
          maxRetriesPerRequest: null,
        }),
        concurrency: 1,
      }
    );

    this.worker.on("failed", (job, err) => {
      console.error(
        `Expired challenge job ${job?.id} failed: ${err.message} ❌`
      );
    });

    this.worker.on("ready", () => {
      console.log(
        "ExpiredChallenges worker is ready to process jobs ✅"
      );
    });

    this.worker.on("active", (job) => {
      console.log(
        `Processing expired challenge job ${job.id}...`
      );
    });
  }

  // --------------------------------------------------
  // PROCESS EXPIRED CHALLENGE
  // --------------------------------------------------

  public async processExpiredChallengeJob(job: Job) {
    const { challengeId } = job.data;

    if (!challengeId) {
      throw new Error(
        "challengeId is required for expired challenge job"
      );
    }

    console.log(
      `Checking expiration for challenge ${challengeId}...`
    );

    /*
     * ------------------------------------------------
     * ATOMIC REFUND
     * ------------------------------------------------
     *
     * Only a challenge that is:
     *
     *   status = waiting
     *   expires_at <= NOW()
     *
     * can enter this transaction.
     *
     * This makes the operation safe even if:
     *
     * - the job runs twice
     * - the user manually triggers expiration
     * - another server processes the same job
     */

    const [transactionResult] = await sql.transaction([
      sql`
        WITH expired_challenge AS (

          -- ------------------------------------------
          -- Find expired waiting challenge
          -- ------------------------------------------

          SELECT
            id,
            creator_id,
            game_id,
            stake,
            status,
            expires_at

          FROM challenges

          WHERE
            id = ${challengeId}
            AND status = 'waiting'
            AND expires_at <= CURRENT_TIMESTAMP

          FOR UPDATE

        ),

        release_wallet AS (

          -- ------------------------------------------
          -- Release creator's locked stake
          -- ------------------------------------------

          UPDATE wallets w

          SET
            locked_balance =
              w.locked_balance - ec.stake,

            updated_at = CURRENT_TIMESTAMP

          FROM expired_challenge ec

          WHERE
            w.user_id = ec.creator_id
            AND w.locked_balance >= ec.stake

          RETURNING
            w.id,
            w.user_id,
            ec.id AS challenge_id,
            ec.stake

        ),

        refund_transaction AS (

          -- ------------------------------------------
          -- Create refund transaction
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
            ec.creator_id,
            'refund',
            ec.stake,
            ec.id,
            CONCAT(
              'CHALLENGE-REFUND-',
              ec.id
            ),
            'completed'

          FROM expired_challenge ec

          INNER JOIN release_wallet rw
            ON rw.challenge_id = ec.id

          RETURNING id

        ),

        expired_challenge_update AS (

          -- ------------------------------------------
          -- Mark challenge as expired
          -- ------------------------------------------

          UPDATE challenges c

          SET
            status = 'expired'

          FROM expired_challenge ec

          INNER JOIN release_wallet rw
            ON rw.challenge_id = ec.id

          WHERE
            c.id = ec.id
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

        updated_game AS (

          -- ------------------------------------------
          -- Cancel associated game
          -- ------------------------------------------

          UPDATE games g

          SET
            status = 'expired'

          FROM expired_challenge_update ec

          WHERE
            g.id = ec.game_id
            AND g.status = 'waiting'

          RETURNING
            g.id,
            g.code,
            g.status

        )

        -- --------------------------------------------
        -- Return useful information
        -- --------------------------------------------

        SELECT
          ec.id AS challenge_id,
          ec.creator_id,
          ec.game_id,
          ec.stake,
          ec.platform_fee,
          ec.winner_payout,
          ec.status,
          ec.expires_at,

          ug.code AS game_code,
          ug.status AS game_status

        FROM expired_challenge_update ec

        LEFT JOIN updated_game ug
          ON ug.id = ec.game_id;
      `,
    ]);

    // --------------------------------------------------
    // CHALLENGE IS NO LONGER WAITING / NOT EXPIRED
    // --------------------------------------------------

    if (
      !transactionResult ||
      transactionResult.length === 0
    ) {
      console.log(
        `Challenge ${challengeId} does not need expiration/refund.`
      );

      return {
        success: true,
        expired: false,
      };
    }

    const result = transactionResult[0];

    console.log(
      `Challenge ${challengeId} expired. ` +
      `Refunded ${result.stake} to user ${result.creator_id}.`
    );

    // --------------------------------------------------
    // UPDATE REDIS GAME STATE
    // --------------------------------------------------

    if (result.game_code) {
      const game = await getGameByCode(
        result.game_code
      );

      if (game) {
        game.status = "expired";

        if (game.challenge) {
          game.challenge.status = "expired";
        }

        await saveGame(
          result.game_code,
          game
        );

        // ------------------------------------------------
        // NOTIFY CLIENTS
        // ------------------------------------------------

        //this.serverSocket.to(result.game_code).emit('gameData', game);

        // this.serverSocket
        //   .to(result.game_code)
        //   .emit("challengeExpired", {
        //     challengeId: result.challenge_id,
        //     gameCode: result.game_code,
        //     stake: Number(result.stake),
        //     refundAmount: Number(result.stake),
        //     message:
        //       "This challenge expired and your stake has been refunded.",
        //   });
      }
    }

    return {
      success: true,
      expired: true,
      challengeId: result.challenge_id,
      gameCode: result.game_code,
      refundAmount: Number(result.stake),
    };
  }

  // --------------------------------------------------
  // SCHEDULE EXPIRATION
  // --------------------------------------------------

  public async scheduleExpiredChallenge(
    challengeId: number,
    delayMs: number
  ) {
    console.log(
      `Scheduling expiration for challenge ${challengeId} ` +
      `with timeout ${delayMs}ms`
    );

    // Cancel an existing job first
    await this.cancelExpiredChallenge(challengeId);

    await this.queue.add(
      "expiredChallengeJob",
      {
        challengeId,
      },
      {
        delay: delayMs,

        /*
         * The job has already done its job once
         * completed, so remove it.
         */
        removeOnComplete: true,

        /*
         * Retry temporary failures.
         */
        attempts: 3,

        /*
         * Keep failed jobs for debugging.
         */
        removeOnFail: 500,

        /*
         * One challenge = one BullMQ job.
         */
        jobId: `challenge-${challengeId}`,
      }
    );

    console.log(
      `Added expiration job for challenge ${challengeId}`
    );
  }

  // --------------------------------------------------
  // CANCEL EXPIRATION
  // --------------------------------------------------

  public async cancelExpiredChallenge(
    challengeId: number
  ) {
    const jobId = `challenge-${challengeId}`;

    try {
      const job = await this.queue.getJob(jobId);

      if (job) {
        await job.remove();

        console.log(
          `Cancelled expiration for challenge ${challengeId}`
        );
      }
    } catch (error) {
      console.error(
        `Error cancelling expiration for challenge ${challengeId}:`,
        error
      );
    }
  }
}

