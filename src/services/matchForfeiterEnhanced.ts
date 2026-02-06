import { Queue, Worker, Job } from "bullmq";

import {
  getGameByCode,
  saveGame,
  getTournamentLobbyData,
} from "../utils/gameFunctions";
import Redis from "ioredis";
import sql from "../config/db";
import { isTournamentMatch } from "../utils/utils";
import { advanceSingleEliminationTournamentToNextRound } from "../utils/tournament";

export default class MatchForfeiter {
  private queue: Queue;
  private worker: Worker;
  private serverSocket: any;

  constructor(serverSocket: any) {
    this.serverSocket = serverSocket;

    this.queue = new Queue("forfeitQueue");

    this.worker = new Worker(
      "forfeitQueue",
      async (job: Job) => {
        await this.processForfeitJob(job);
      },
      { connection: new Redis({ maxRetriesPerRequest: null }) }
    );

    this.worker.on("failed", (job, err) => {
      console.error(`Job ${job?.id} failed with error: ${err.message} ❌`);
    });

    this.worker.on("ready", () => {
      console.log("Forfeit worker is ready to process jobs ✅");
    });

    this.worker.on("active", (job) => {
      console.log(`Processing job ${job.id}...`);
    });
  }

  public async scheduleForfeit(gameCode: string, delayMs: number) {
    console.log(
      `Scheduling forfeit for game ${gameCode} with timeout ${delayMs}ms`
    );
    await this.cancelForfeit(gameCode); // Cancel existing job if any
    await this.queue.add(
      "forfeitJob",
      { gameCode },
      {
        delay: delayMs,
        removeOnComplete: true,
        removeOnFail: true,
        jobId: gameCode,
      }
    );
    console.log(`added job with gamecode ${gameCode} to queue`);
  }

  public async cancelForfeit(gameCode: string) {
    const job = await this.queue.getJob(gameCode);
    if (job) {
      await job.remove();
      console.log(`Cancelled forfeit for game ${gameCode}`);
    }
  }

  private async processForfeitJob(job: Job) {
    const { gameCode } = job.data;
    console.log(`Processing forfeit for match ${gameCode}`);
    // Add your forfeit logic here

    const match = await getGameByCode(gameCode);
    if (!match || !match.is_rated) return;

    const winnerId = match.players.find(
      (p: any) => p.user.id !== match.current_turn_user_id
    )?.user.id;
    const loserId = match.current_turn_user_id;

    console.log(
      `Forfeit processed for match ${gameCode}. Winner: ${winnerId}, Loser: ${loserId}`
    );

    const tournament = await isTournamentMatch(match.id);

    if(tournament){
        const tournamentFormat = 'Single Elimination';
        if(tournamentFormat == 'Single Elimination'){
          //create sql transaction to update match and player stats
          const results = await sql.transaction((tx) => {
            // 1. Update Match Status
            const updateMatchStatus = tx`
              UPDATE tournament_matches 
              SET status = 'forfeited', winner_id = ${winnerId} 
              WHERE game_id = ${match.id} 
              RETURNING id, tournament_id
            `;
      
            const queries = [updateMatchStatus];
      
            // 2. Eliminate Loser from Tournament
            const eliminateLoser = tx`
              UPDATE tournament_participants 
              SET status = 'eliminated' 
              WHERE tournament_id = (SELECT tournament_id FROM tournament_matches WHERE game_id = ${match.id}) AND user_id = ${loserId}
            `;
      
            // 3. Update User Stats (Batch these!)
            const updateUserStats = tx`
              UPDATE users SET games_played = games_played + 1 
              WHERE id IN (${winnerId}, ${loserId})
            `;
            const updateWinnerStats = tx`UPDATE users SET games_won = games_won + 1 WHERE id = ${winnerId}`;
      
            // 4. Update Game Players
            //const updateGamePlayers = tx`UPDATE game_players SET status = 'forfeited' WHERE game_id = ${match.id} AND user_id = ${loserId}`;
      
            queries.push(
              eliminateLoser,
              updateUserStats,
              updateWinnerStats,
              
            );
      
            return queries;
          });
          
          const tournamentId = results[0][0].tournament_id;
          const lobbyData = await getTournamentLobbyData(tournamentId);
          this.serverSocket.to(`tournament_${tournamentId}`).emit("lobbyUpdate", lobbyData);
          
          advanceSingleEliminationTournamentToNextRound(tournament.id, tournament.current_round_number, this.serverSocket);          

        }
    }

   
      // Notify Game Room
      this.serverSocket
        .to(gameCode)
        .emit("matchForfeit", { winnerId, loserId });
        
      // Update Memory/Redis State
      match.winner_id = winnerId;
      match.status = "forfeited";
      match.forfeited_by = loserId;
      await saveGame(gameCode, match);

 



  }
}
