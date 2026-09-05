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
Object.defineProperty(exports, "__esModule", { value: true });
exports.forfeitQueue = void 0;
const bullmq_1 = require("bullmq");
const connection = {
    host: 'localhost',
    port: 6379,
};
exports.forfeitQueue = new bullmq_1.Queue('forfeitQueue', { connection });
function startTurn(gameCode, timeoutMs) {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(`Starting turn for game ${gameCode} with timeout ${timeoutMs}ms`);
        // Add a job that will fire after the timeout
        yield exports.forfeitQueue.add('forfeitJob', { matchId: gameCode, playerId: 'player1' }, { delay: timeoutMs, jobId: gameCode });
    });
}
function processForfeitJob(job) {
    return __awaiter(this, void 0, void 0, function* () {
        const { matchId, playerId } = job.data;
        console.log(`Processing forfeit for match ${matchId} by player ${playerId}`);
        // Add your forfeit logic here
    });
}
function onPlayerMove(gameCode) {
    return __awaiter(this, void 0, void 0, function* () {
        // Remove the existing forfeit job if it exists
        const job = yield exports.forfeitQueue.getJob(gameCode);
        if (job) {
            yield job.remove();
            console.log(`Removed forfeit job for game ${gameCode}`);
        }
        // Start a new turn with a fresh timeout
        yield startTurn(gameCode, 30000); // e.g., 30 seconds timeout
    });
}
// Worker to process forfeit jobs
const forfeitWorker = new bullmq_1.Worker('forfeitQueue', (job) => __awaiter(void 0, void 0, void 0, function* () {
    yield processForfeitJob(job);
}), { connection });
