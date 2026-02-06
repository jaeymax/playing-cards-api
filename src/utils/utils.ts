import { Game } from "../../types";
import sql from "../config/db";

const updateWinnerWonCount = async (winnerId: number) => {
  await sql`
      UPDATE users
      SET games_won = games_won + 1
      WHERE id = ${winnerId}
   `;
};

const markGameAsEndedAndCompleted = async (gameId: number) => {
  await sql`
      UPDATE games
      SET status = 'completed', ended_at = NOW()
      WHERE id = ${gameId}
   `;
};

const markTournamentAsEndedAndCompleted = async (tournamentId: number) => {
  await sql`
      UPDATE tournaments
      SET status = 'completed', end_date = NOW()
      WHERE id = ${tournamentId}
   `;
}

// update games played for all players in a game
const updateGamesPlayedForGamePlayers = async (gameId: number) => {
  await sql`
      UPDATE users
      SET games_played = games_played + 1
      WHERE id IN (
         SELECT user_id FROM game_players WHERE game_id = ${gameId}
      )
   `;
};

const getMatchWinner = (game: Game) => {
  const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
  return game.players.find(
    (player) => player.position == final_trick.leader_position
  );
};

// function go return loser of a match, but only for a  two player game
const getMatchLoser = (game: Game) => {
    if(game.players.length != 2) {
        throw new Error('getMatchLoser only works for two player games');
    }
    const winner = getMatchWinner(game);
    return game.players.find(player => player.id != winner?.id);
}

// function to return losers of a match, for games with more than 2 players, it will return an array of losers
const getMatchLosers = (game: Game) => {
    const winner = getMatchWinner(game);
    return game.players.filter(player => player.id != winner?.id);
}

const updateGamePlayersScores = async (game: Game) => {
  for (const player of game.players) {
    await sql`
        UPDATE game_players 
        SET score = ${player.score}
        WHERE game_id = ${game.id} AND user_id = ${player.user.id}
    `;
  }
};

// function to determin whether a game is a tournament game
const isTournamentMatch = async (gameId: number) => {
    const result = await sql`
      SELECT tm.tournament_id, tr.round_number 
           FROM tournament_matches tm
           JOIN tournament_rounds tr ON tm.round_id = tr.id
        WHERE tm.game_id = ${gameId}
    `;
    
    return result.length > 0 ? {id:result[0].tournament_id, current_round_number:result[0].round_number} : null;
};

export {
  updateWinnerWonCount,
  markGameAsEndedAndCompleted,
  updateGamesPlayedForGamePlayers,
  getMatchWinner,
  updateGamePlayersScores,
 isTournamentMatch,
    getMatchLoser,
    markTournamentAsEndedAndCompleted
};
