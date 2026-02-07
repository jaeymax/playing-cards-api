import { matchForfeiter } from "..";
import sql from "../config/db";
import { fisherYatesShuffle, getSingleEliminationTournamentLobbyData, saveGame } from "./gameFunctions";
import { markTournamentAsEndedAndCompleted } from "./utils";

const createNextSingleEliminationRoundMatches = async (
  roundNumber: number,
  tournamentId:number,
  serverSocket:any
) => {
  // Implementation for creating the next round in a single elimination tournament
  
  try {
    const round = await createSingleEliminationRound(
      tournamentId,
      roundNumber
    );

    const participants =
      await getSingleEliminationTournamentParticipantsByStatus(
        tournamentId,
        "qualified"
      );
    const is_final_match = participants.length == 2;

    fisherYatesShuffle(participants);

    // Pair players and create matches
    for (let i = 0; i < participants.length; i += 2) {
      const player1 = participants[i];
      const player2 = participants[i + 1];

      if (!player2) {
        // Handle odd number of players - auto-advance
        const game = await createByeMatch(player1.id);

        const gameplayer = await createMatchGamePlayer(
          game.id,
          player1.id,
          0,
          true
        );

        await createSingleEliminationByeMatch(
          tournamentId,
          game.id,
          round.id,
          player1.id,
          Math.floor(i / 2) + 1
        );
        console.log(`created match for only ${player1.username}`);

        const newGame = {
          ...game,
          players: [gameplayer],
          cards: null,
        };

        await saveGame(game.code, newGame);
        console.log("game saved to memory", game.code);
        break;
      }

      const game = await createTwoPlayerMatch(
        player1.id,
        "waiting",
        is_final_match,
        true
      );

      const { gameplayer1, gameplayer2 } =
        await createTwoPlayerMatchGamePlayers(game.id, player1.id, player2.id);

      const gameCards = await createGameCardsForMatch(game.id, gameplayer1.id);
      // Create match
      await createSingleEliminationMatch(
        tournamentId,
        game.id,
        round.id,
        player1.id,
        player2.id,
        "in_progress",
        Math.floor(i / 2) + 1
      );

      // update tournaments current round number
      await sql`
        UPDATE tournaments 
        SET current_round_number = ${roundNumber} 
        WHERE id = ${tournamentId}
      `;

      game.turn_started_at = Date.now();
      game.turn_ends_at =
        game.turn_started_at + (game.turn_timeout_seconds + 0) * 1000;

      await matchForfeiter.scheduleForfeit(
        game.code,
        (game.turn_timeout_seconds + 0) * 1000
      );

      // Prepare and save game to Redis
      const newGame = {
        ...game,
        players: [gameplayer1, gameplayer2],
        cards: gameCards,
      };

      await saveGame(game.code, newGame);
      console.log("game saved to memory successfully", game.code);

      const lobbyData = await getSingleEliminationTournamentLobbyData(tournamentId);

      serverSocket
        .to(`tournament_${tournamentId}`)
        .emit("lobbyUpdate", lobbyData);
    }
  } catch (error) {
    console.error("Error advancing to next round:", error);
    throw error;
  }
};

const getSingleEliminationTournamentParticipants = async (
  tournamentId: number
) => {
  const participants = await sql`
    SELECT u.id, u.username, u.image_url, tp.status
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId}
    ORDER BY u.username
  `;
  return participants;
};

const getSingleEliminationTournamentParticipantsByStatus = async (
  tournamentId: number,
  status: string
) => {
  const participants = await sql`
    SELECT u.id, tp.user_id, u.username, u.image_url, tp.status
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId} AND status = ${status}
    ORDER BY u.username
  `;
  return participants;
};

const createSingleEliminationRound = async (
  tournamentId: number,
  roundNumber: number
) => {
  const round = await sql`
      INSERT INTO tournament_rounds (tournament_id, round_number)
      VALUES (${tournamentId}, ${roundNumber}) ON CONFLICT (tournament_id, round_number) DO NOTHING
      RETURNING id
    `;
  return round[0];
};

const createSingleEliminationByeMatch = async (
  tournamentId: number,
  matchId: number,
  roundId: number,
  playerId: number,
  matchOrder: number
) => {
  const match = await sql`
          INSERT INTO tournament_matches (
            tournament_id,
            game_id,
            round_id,
            player1_id,
            player2_id,
            status,
            winner_id,
            match_order
          ) VALUES (
            ${tournamentId},
            ${matchId},
            ${roundId},
            ${playerId},
            NULL,
            'completed',
            ${playerId},
            ${matchOrder}
          )
          RETURNING id, status
        `;
  return match[0];
};

const createSingleEliminationMatch = async (
  tournamentId: number,
  matchId: number,
  roundId: number,
  player1Id: number,
  player2Id: number,
  status: string,
  matchOrder: number
) => {
  const match = await sql`
          INSERT INTO tournament_matches (
            tournament_id,
            game_id,
            round_id,
            player1_id,
            player2_id,
            status,
            match_order
          ) VALUES (
            ${tournamentId},
            ${matchId},
            ${roundId},
            ${player1Id},
            ${player2Id},
            ${status},
            ${matchOrder}
          )
          RETURNING id, status
        `;
  return match[0];
};

const createTwoPlayerMatch = async (
  player1Id: number,
  status: string,
  isFinalRound: boolean,
  is_rated: boolean
) => {
  const match = await sql`
      INSERT INTO games (
        code,
        created_by,
        player_count,
        status,
        current_turn_user_id,
        is_rated,
        is_final_match
      ) VALUES (
        ${Math.random().toString(36).substring(2, 12)},
        ${player1Id},
        2,
        ${status},
        ${player1Id},
        ${is_rated},
        ${isFinalRound}
      )
      RETURNING *
    `;
  return match[0];
};

const createByeMatch = async (playerId: number) => {
  const match = await sql`
          INSERT INTO games (
            code,
            created_by,
            player_count,
            status,
            current_turn_user_id,
            is_rated
          ) VALUES (
            ${Math.random().toString(36).substring(2, 12)},
            ${playerId},
            2,
            'completed',
            ${playerId},
            true
          )
          RETURNING *
        `;
  return match[0];
};

const createTwoPlayerMatchGamePlayers = async (
  matchId: number,
  player1Id: number,
  player2Id: number
) => {
  const gameplayers = await sql.transaction((sql) => [
    sql`
          INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
          VALUES (
            ${matchId}, 
            ${player1Id}, 
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
              'rating', rating
            ) FROM users WHERE id = user_id) as user
        `,
    sql`
          INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
          VALUES (
            ${matchId}, 
            ${player2Id}, 
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
              'rating', rating
            ) FROM users WHERE id = user_id) as user
        `,
  ]);

  return {
    gameplayer1: gameplayers[0][0],
    gameplayer2: gameplayers[1][0],
  };
};

const createGameCardsForMatch = async (
  matchId: number,
  player1GamePlayerId: number
) => {
  const cards = await sql`SELECT card_id FROM cards ORDER BY RANDOM()`;
  const gameCards = await sql`
      INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
      SELECT 
        ${matchId},
        unnest(${cards.map((c) => c.card_id)}::integer[]),
        ${player1GamePlayerId},
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

  return gameCards;
};

const createMatchGamePlayer = async (
  matchId: number,
  playerId: number,
  player_position: number,
  is_dealer: boolean
) => {
  const gameplayer = await sql`
          INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
          VALUES (
            ${matchId}, 
            ${playerId}, 
            ${player_position}, 
            ${is_dealer}, 
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
              'rating', rating
            ) FROM users WHERE id = user_id) as user
        `;

  return { gameplayer: gameplayer[0] };
};

// function to update singleElimination match Results like match status and eliminated players
const updateSingleEliminationMatchResults = async (
  matchId: number,
  winnerId: number,
  loserId: number,
  tournamentId: number
) => {
  await sql`
  UPDATE tournament_matches 
  SET winner_id = ${winnerId}, status = 'completed'
  WHERE game_id = ${matchId}
`;

  await sql`
UPDATE tournament_participants
SET status = 'eliminated'
WHERE tournament_id = ${tournamentId}
AND user_id = ${loserId}
`;
};

// function to advance single elimination tournament to the next round, it will check if there are any matches that are completed in the current round, if all matches are completed, it will create the next round matches
const advanceSingleEliminationTournamentToNextRound = async (
  tournamentId: number,
  currentRoundNumber: number,
  serverSocket:any
) => {
  const matches = await getSingleEliminationTournamentMatches(
    tournamentId,
    currentRoundNumber
  );

  const allMatchesCompleted = matches.every(
    (match) => match.winner_id != null
  );

  const active_participants =
    await getSingleEliminationTournamentParticipantsByStatus(
      tournamentId,
      "qualified"
    );

  const isLastRound = active_participants.length == 1;
  console.log("isLastRound", isLastRound);

  if (allMatchesCompleted && !isLastRound) {
    await createNextSingleEliminationRoundMatches(
      currentRoundNumber + 1,
      tournamentId,
      serverSocket
    );
  } else if (isLastRound) {
    // tournament has ended
    console.log("this is the last round and match");
    await markTournamentAsEndedAndCompleted(tournamentId);
    const winnerParticipant = active_participants.find(
      (p: any) => p.status == "qualified"
    );

    serverSocket
      .to(`tournament_${tournamentId}`)
      .emit("tournamentEnded");

    if (winnerParticipant) {
      await sql`
              UPDATE tournaments
              SET winner_id = ${winnerParticipant.user_id}
              WHERE id = ${tournamentId}
            `;

      // send a notification message to the winner in db
      await sql`
              INSERT INTO notifications (user_id, type, title, message, action)
              VALUES (
                ${winnerParticipant.user_id},
                'tournament',
                'Tournament Champion 🏆',
                'Congratulations! You won the Weekend Tournament. Your skill and strategy paid off — enjoy your rewards!',
                'Claim Prize'
              )
            `;
    }
  }

};



// get the winner in a single elimination tournament
const getSingleEliminationTournamentWinner = async (tournamentId: number) => {
  const winner = await sql`
      SELECT user_id
      FROM tournament_participants
      WHERE tournament_id = ${tournamentId} AND status = 'qualified' 
      LIMIT 1
  `;
  return winner[0];
};

// get all matches with status inprogress in a single elimination tournament
 const getSingleElimationTournamentOngoingMatches = async (tournamentId:number, currentRoundNumber:number) =>{
  const ongoingMatches = await sql`
  SELECT tm.id
  FROM tournament_matches tm
  JOIN tournament_rounds tr ON tm.round_id = tr.id
  WHERE tm.tournament_id = ${tournamentId}
  AND tr.round_number = ${currentRoundNumber}
  AND (tm.status = 'in_progress' OR tm.status = 'pending')
`;
  return ongoingMatches
 }

 const getSingleEliminationTournamentMatches = async (tournamentId:number, currentRoundNumber:number) =>{
  const matches = await sql`
  SELECT id, winner_id, player1_id, player2_id
  FROM tournament_matches
  WHERE tournament_id = ${tournamentId}
  AND round_id = (SELECT id FROM tournament_rounds WHERE tournament_id = ${tournamentId} AND round_number = ${currentRoundNumber})
`;
 return matches;
 }

export {
  createNextSingleEliminationRoundMatches,
  createSingleEliminationRound,
  createGameCardsForMatch,
  getSingleEliminationTournamentParticipantsByStatus,
  getSingleEliminationTournamentParticipants,
  createSingleEliminationByeMatch,
  createSingleEliminationMatch,
  createTwoPlayerMatch,
  createByeMatch,
  createMatchGamePlayer,
  createTwoPlayerMatchGamePlayers,
  updateSingleEliminationMatchResults,
  advanceSingleEliminationTournamentToNextRound,
  getSingleEliminationTournamentWinner,
  getSingleElimationTournamentOngoingMatches,
  getSingleEliminationTournamentMatches
};
