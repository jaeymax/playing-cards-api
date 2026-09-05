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
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const db_1 = __importDefault(require("../config/db"));
const gameFunctions_1 = require("../utils/gameFunctions");
class ExpiredChallenges {
    constructor(serverSocket) {
        this.serverSocket = serverSocket;
        const redisConnection = new ioredis_1.default({
            maxRetriesPerRequest: null,
        });
        this.queue = new bullmq_1.Queue("expiredChallengesQueue", {
            connection: redisConnection,
        });
        console.log("Creating ExpiredChallenges worker...", process.pid, Date.now());
        this.worker = new bullmq_1.Worker("expiredChallengesQueue", (job) => __awaiter(this, void 0, void 0, function* () {
            const start = Date.now();
            yield this.processExpiredChallengeJob(job);
            console.log(`Job ${job === null || job === void 0 ? void 0 : job.id} took ${Date.now() - start}ms`);
        }), {
            connection: new ioredis_1.default({
                maxRetriesPerRequest: null,
            }),
            concurrency: 1,
        });
        this.worker.on("failed", (job, err) => {
            console.error(`Expired challenge job ${job === null || job === void 0 ? void 0 : job.id} failed: ${err.message} ❌`);
        });
        this.worker.on("ready", () => {
            console.log("ExpiredChallenges worker is ready to process jobs ✅");
        });
        this.worker.on("active", (job) => {
            console.log(`Processing expired challenge job ${job.id}...`);
        });
    }
    // --------------------------------------------------
    // PROCESS EXPIRED CHALLENGE
    // --------------------------------------------------
    processExpiredChallengeJob(job) {
        return __awaiter(this, void 0, void 0, function* () {
            const { challengeId } = job.data;
            if (!challengeId) {
                throw new Error("challengeId is required for expired challenge job");
            }
            console.log(`Checking expiration for challenge ${challengeId}...`);
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
            const challenge = yield (0, db_1.default) `select type from challenges where id = ${challengeId}`;
            console.log('challenge', challenge);
            let transactionResult = null;
            if (challenge[0].type == 'stake') {
                [transactionResult] = yield db_1.default.transaction([
                    (0, db_1.default) `
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
            }
            else if (challenge[0].type == 'friendly') {
                [transactionResult] = yield db_1.default.transaction([
                    (0, db_1.default) `
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
  
  
         expired_challenge_update AS (
  
           -- ------------------------------------------
           -- Mark challenge as expired
           -- ------------------------------------------
  
           UPDATE challenges c
  
           SET
             status = 'expired'
  
           FROM expired_challenge ec
  
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
            }
            // --------------------------------------------------
            // CHALLENGE IS NO LONGER WAITING / NOT EXPIRED
            // --------------------------------------------------
            if (!transactionResult ||
                transactionResult.length === 0) {
                console.log(`Challenge ${challengeId} does not need expiration/refund.`);
                return {
                    success: true,
                    expired: false,
                };
            }
            const result = transactionResult[0];
            console.log(`Challenge ${challengeId} expired. ` +
                `Refunded ${result.stake} to user ${result.creator_id}.`);
            // --------------------------------------------------
            // UPDATE REDIS GAME STATE
            // --------------------------------------------------
            if (result.game_code) {
                const game = yield (0, gameFunctions_1.getGameByCode)(result.game_code);
                if (game) {
                    game.status = "expired";
                    if (game.challenge) {
                        game.challenge.status = "expired";
                    }
                    yield (0, gameFunctions_1.saveGame)(result.game_code, game);
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
        });
    }
    // --------------------------------------------------
    // SCHEDULE EXPIRATION
    // --------------------------------------------------
    scheduleExpiredChallenge(challengeId, delayMs) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`Scheduling expiration for challenge ${challengeId} ` +
                `with timeout ${delayMs}ms`);
            // Cancel an existing job first
            yield this.cancelExpiredChallenge(challengeId);
            yield this.queue.add("expiredChallengeJob", {
                challengeId,
            }, {
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
            });
            console.log(`Added expiration job for challenge ${challengeId}`);
        });
    }
    // --------------------------------------------------
    // CANCEL EXPIRATION
    // --------------------------------------------------
    cancelExpiredChallenge(challengeId) {
        return __awaiter(this, void 0, void 0, function* () {
            const jobId = `challenge-${challengeId}`;
            try {
                const job = yield this.queue.getJob(jobId);
                if (job) {
                    yield job.remove();
                    console.log(`Cancelled expiration for challenge ${challengeId}`);
                }
            }
            catch (error) {
                console.error(`Error cancelling expiration for challenge ${challengeId}:`, error);
            }
        });
    }
}
exports.default = ExpiredChallenges;
