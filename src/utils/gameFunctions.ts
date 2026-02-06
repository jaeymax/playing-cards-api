import { create, get } from "axios";
import { Game, GamePlayer } from "../../types";
import sql from "../config/db";
import { mixpanel, redis, matchForfeiter } from "../index";
import { serverSocket } from "../index";
import { updateRatings } from "../utils/rating";
import {
  advanceSingleEliminationTournamentToNextRound,
  updateSingleEliminationMatchResults,
} from "./tournament";
import {
  getMatchLoser,
  getMatchWinner,
  isTournamentMatch,
  markGameAsEndedAndCompleted,
  updateGamePlayersScores,
  updateGamesPlayedForGamePlayers,
  updateWinnerWonCount,
} from "./utils";

export const getDealingSequence = (game: any) => {
  const dealingSequence: any[] = [];

  const dealerPosition = game.players.find(
    (player: any) => player.is_dealer == true
  )?.position;

  let currentPlayerPosition = dealerPosition;

  while (true) {
    let nextPlayerPosition = (currentPlayerPosition + 1) % game.player_count;
    const player = game.players.find(
      (player: any) => player.position == nextPlayerPosition
    ).id;
    dealingSequence.push(player);
    currentPlayerPosition = nextPlayerPosition;
    if (nextPlayerPosition == dealerPosition) break;
  }

  return dealingSequence;
};

export const dealCards = async (game: any) => {
  const gamePlayers = getDealingSequence(game);
  console.log("dealing_sequence", getDealingSequence(game));
  let cardIndex = 0;

  for (let player of gamePlayers) {
    // player here represents a player's id
    for (let hand_position = 0; hand_position < 3; hand_position++) {
      game.cards[cardIndex].player_id = player; // Assign cards to players
      game.cards[cardIndex].status = "in_hand"; // Set status to in_hand
      game.cards[cardIndex].animation_state = "dealing";
      game.cards[cardIndex].hand_position = hand_position;
      cardIndex++;
    }
  }

  for (let player of gamePlayers) {
    for (let hand_position = 3; hand_position < 5; hand_position++) {
      game.cards[cardIndex].player_id = player; // Assign cards to players
      game.cards[cardIndex].status = "in_hand"; // Set status to in_hand
      game.cards[cardIndex].animation_state = "dealing";
      game.cards[cardIndex].hand_position = hand_position; // Set hand position
      cardIndex++;
    }
  }

  const remainingCards = game.cards.slice(cardIndex);
  if (remainingCards.length > 0) {
    remainingCards.forEach((card: any) => {
      card.player_id =
        game.players.find((player: any) => player.is_dealer)?.id || 0; // Assign to dealer (first player)
      card.status = "in_drawpile"; // Set status to in_drawpile
      // card.hand_position = -1;
      card.animation_state = "idle";
    });
  }

  game.turn_started_at = Date.now();
  game.turn_ends_at = game.turn_started_at + game.turn_timeout_seconds * 1000;
  game.current_player_position =
    (game.current_player_position + 1) % game.player_count;
  game.current_turn_user_id = game.players.find(
    (player: any) => player.position == game.current_player_position
  )?.user?.id;
  await matchForfeiter.scheduleForfeit(
    game.code,
    game.turn_timeout_seconds * 1000
  );
  //await redis.zadd('forfeit:index', game.turn_ends_at, game.code);
};

export const fisherYatesShuffle = (array: any[]) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
};

export const shuffleDeck = async (game: any) => {
  game.cards.forEach((card: any) => {
    card.player_id = 0; // Reset player_id for shuffling
    card.status = "in_deck";
    card.hand_position = -1;
    card.animation_state = "shuffling";
  });

  fisherYatesShuffle(game.cards);
  console.log("shuffled deck");
};

export const playCard = async (
  game: any,
  card_id: number,
  player_id: number,
  socket: any
) => {
  const player = game.players.find((player: any) => player.id === player_id);
  if (player.position !== game.current_player_position) {
    console.log(`${player.user.username} it is not your turn to play`);
    socket.emit("gameMessage", "It's not your turn to play");
    return;
  }
  const played_card = game.cards.find((card: any) => card.id === card_id);

  if (played_card.player_id !== player_id) {
    console.log(`${player.user.username} you can't play that card`);
    socket.emit("gameMessage", "You can't play that card");
    return;
  }

  if (played_card.status !== "in_hand") {
    console.log(`${player.user.username} you can't play that card`);
    socket.emit("gameMessage", "You can't play that card");
    return;
  }

  const player_hand = getPlayerHand(game, player_id);
  const card = player_hand.find((card: { id: number }) => card.id === card_id);

  if (!game.current_trick) {
    game.current_trick = {
      cards: [],
      leading_suit: "",
      leader_position: 0,
    };

    game.completed_tricks = [];
  }
  // first card of the trick
  if (game.current_trick.cards.length === 0) {
    game.current_trick.leading_suit = getSuit(card);
    game.current_trick.leader_position = player.position;
  } else {
    const leading_suit = game.current_trick.leading_suit;
    if (hasSuit(player_hand, leading_suit) && getSuit(card) != leading_suit) {
      socket.emit(
        "gameMessage",
        `The leading suit of the current trick is ${leading_suit.toLowerCase()}, you have a ${leading_suit
          .toLowerCase()
          .slice(0, -1)} you must follow suit`
      );
      return;
    }
  }

  played_card.status = "played";
  played_card.trick_number = game.round_number;
  game.current_trick.cards.push({
    ...card,
    player_position: player.position,
  });

  if (isHigherCard(card, game.current_trick)) {
    game.current_trick.leader_position = player.position;
  }

  console.log(
    `Room ${game.code} has ${
      serverSocket.sockets.adapter.rooms.get(game.code)?.size
    } players connected`
  );

  serverSocket.to(game.code).emit("playedCard", {
    card_id,
    player_id,
    trick_number: game.round_number,
  });

  game.turn_started_at = Date.now();
  const turn_ends_at = game.turn_started_at + game.turn_timeout_seconds * 1000;
  game.turn_ends_at = turn_ends_at;

  await matchForfeiter.scheduleForfeit(
    game.code,
    game.turn_timeout_seconds * 1000
  );

  if (game.current_trick.cards.length === game.players.length) {
    completeTrick(game);
  } else {
    getNextPlayerPosition(game);
  }

  const before_player = game.players.find(
    (p: any) => p.user.id == game.current_turn_user_id
  )?.user.username;

  const current_turn_user_id = game.players.find(
    (p: any) => p.position === game.current_player_position
  )?.user.id;

  game.current_turn_user_id = current_turn_user_id;

  const after_player = game.players.find(
    (p: any) => p.user.id == game.current_turn_user_id
  ).user.username;
  
  await saveGame(game.code, game);

  serverSocket.to(game.code).emit("updatedGameData", game);
};

const computeTurnEndsAt = (
  turnStartedAt: string,
  turnTimeoutSeconds: number
) => {
  const start = new Date(turnStartedAt);
  return new Date(start.getTime() + turnTimeoutSeconds * 1000);
};

const isHigherCard = (card: any, current_trick: any) => {
  if (current_trick.cards.length === 0) {
    return true;
  }

  const leading_suit = current_trick.leading_suit;
  const current_card_suit = getSuit(card);

  if (current_card_suit !== leading_suit) return false;

  const current_winning_card = current_trick.cards.find(
    (card: any) => card.player_position === current_trick.leader_position
  );
  const current_winning_card_value = getCardValue(current_winning_card);
  const card_value = getCardValue(card);

  return card_value > current_winning_card_value;
};

const completeTrick = async (game: any) => {
  const { current_trick } = game;
  game.completed_tricks.push(current_trick);
  //console.log('completed tricks', game.completed_tricks);

  if (allCardsPlayed(game)) {
    endGame(game);
    return;
  }

  game.current_trick = {
    cards: [],
    leading_suit: current_trick.leading_suit,
    leader_position: current_trick.leader_position,
  };

  game.current_player_position = current_trick.leader_position;
  game.round_number++;
};

const endGame = async (game: any) => {
  const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
  const winning_card = final_trick.cards.find(
    (card: any) => card.player_position === final_trick.leader_position
  );

  let points = 1;

  game.status = "ended";
  game.ended_at = new Date();

  mixpanel.track("game_completed", {
    distinct_id: game.id,
    game_code: game.code,
    num_players: game.players.length,
  });

  if (winning_card.card.rank == "6" || winning_card.card.rank == "7") {
    points = calculateSpecialPoints(
      game.completed_tricks,
      game.completed_tricks.length - 1,
      "",
      game.completed_tricks.length - 1
    );
  }

  const winner = getMatchWinner(game) as GamePlayer;
  winner.score += points;

  if (winner.score >= game.win_points) {
    await matchForfeiter.cancelForfeit(game.code);

    winner.games_won += 1;
    setTimeout(() => {
      serverSocket.to(game.code).emit("gameOver", {
        winner: { ...winner, points, hand_number: game.current_hand_number },
      });
    }, 1000);

    markGameAsEndedAndCompleted(game.id);
    updateGamePlayersScores(game);
    updateGamesPlayedForGamePlayers(game.id);
    updateWinnerWonCount(winner.user.id);

    const tournament = await isTournamentMatch(game.id);
    console.log("tournamentData", tournament);

    if (tournament) {
      console.log(
        "this game is part of a tournament match, reporting result to tournament system"
      );
      const tournamentFormat = "Single Elimination"; // for now we only have single elimination tournaments, but this can be dynamic based on the tournament the match belongs to
      if (tournamentFormat == "Single Elimination") {
        const loser = getMatchLoser(game) as GamePlayer;

        await updateSingleEliminationMatchResults(
          game.id,
          winner.user.id,
          loser.user.id,
          tournament.id
        );

        const lobbyData = await getTournamentLobbyData(tournament.id);

        serverSocket
          .to(`tournament_${tournament.id}`)
          .emit("lobbyUpdate", lobbyData);

        advanceSingleEliminationTournamentToNextRound(tournament.id, tournament.current_round_number, serverSocket);

        // const matches = await getSingleEliminationTournamentMatches(
        //   tournament.id,
        //   tournament.current_round_number
        // );

        // const allMatchesCompleted = matches.every(
        //   (match) => match.winner_id != null
        // );

        // const active_participants =
        //   await getSingleEliminationTournamentParticipantsByStatus(
        //     tournament.id,
        //     "qualified"
        //   );

        // const isLastRound = active_participants.length == 1;
        // console.log("isLastRound", isLastRound);

        // if (allMatchesCompleted && !isLastRound) {
        //   await createNextSingleEliminationRoundMatches(
        //     tournament.current_round_number + 1,
        //     tournament.id
        //   );
        // } else if (isLastRound) {
        //   // tournament has ended
        //   console.log("this is the last round and match");
        //   await markTournamentAsEndedAndCompleted(tournament.id);
        //   const winnerParticipant = active_participants.find(
        //     (p: any) => p.status == "qualified"
        //   );

        //   serverSocket
        //     .to(`tournament_${tournament.id}`)
        //     .emit("tournamentEnded");

        //   if (winnerParticipant) {
        //     await sql`
        //             UPDATE tournaments
        //             SET winner_id = ${winnerParticipant.user_id}
        //             WHERE id = ${tournament.id}
        //           `;

        //     // send a notification message to the winner in db
        //     await sql`
        //             INSERT INTO notifications (user_id, type, title, message, action)
        //             VALUES (
        //               ${winnerParticipant.user_id},
        //               'tournament',
        //               'Tournament Champion 🏆',
        //               'Congratulations! You won the Weekend Tournament. Your skill and strategy paid off — enjoy your rewards!',
        //               'Claim Prize'
        //             )
        //           `;
        //   }
        // }

        // if (ongoingMatches.length == 0) {

        //   if (active_participants.length <= 1) {
        //     await markTournamentAsEndedAndCompleted(tournament.id);
        //     //const winnerParticipant = await getSingleEliminationTournamentWinner(tournament.id);
        //     const winnerParticipant = active_participants.find(
        //       (p: any) => p.status == "qualified"
        //     );

        //     serverSocket
        //       .to(`tournament_${tournament.id}`)
        //       .emit("tournamentEnded");

        //     if (winnerParticipant) {
        //       await sql`
        //             UPDATE tournaments
        //             SET winner_id = ${winnerParticipant.user_id}
        //             WHERE id = ${tournament.id}
        //           `;

        //       // send a notification message to the winner in db
        //       await sql`
        //             INSERT INTO notifications (user_id, type, title, message, action)
        //             VALUES (
        //               ${winnerParticipant.user_id},
        //               'tournament',
        //               'Tournament Champion 🏆',
        //               'Congratulations! You won the Weekend Tournament. Your skill and strategy paid off — enjoy your rewards!',
        //               'Claim Prize'
        //             )
        //           `;
        //     }
        //   } else if (active_participants.length > 1) {
        //     // advance to next round
        //     await createNextSingleEliminationRoundMatches(
        //       tournament.current_round_number + 1,
        //       tournament.id
        //     );
        //   }
        // } else {
        //   // exit if there are still ongoing matches
        // }
      }
    }

    if (game.is_rated) {
      const tournament_id = await sql`
      SELECT tournament_id 
      FROM tournament_matches 
      WHERE game_id = ${game.id}
    `;

      //update ratings
      const players = updateRatings(game.players, winner.user.id);
      for (let player of players) {
        const oldRating =
          await sql`SELECT rating from users WHERE id = ${player.user.id}`;
        const newRating = player.user.rating;
        console.log(
          `player ${player.user.username} old rating ${oldRating[0].rating} new rating ${newRating}`
        );
        await sql`UPDATE users SET rating = ${newRating} WHERE id = ${player.user.id}`;
        const ratingChange = newRating - oldRating[0].rating;
        // character suit there question //
        await sql`INSERT INTO rating_changes (user_id, tournament_id, rating_change) VALUES (${player.user.id}, ${tournament_id[0].tournament_id}, ${ratingChange})`;
      }
    }
  } else {
    setTimeout(() => {
      serverSocket.to(game.code).emit("gameEnded", {
        winner: { ...winner, points, hand_number: game.current_hand_number },
      });
    }, 1000);
  }

  await saveGame(game.code, game);
};

const allCardsPlayed = (game: any) => {
  const dealt_cards = game.cards.filter(
    (card: any) => card.status !== "in_drawpile"
  );
  return dealt_cards.every((card: any) => card.status === "played");
};

export const getPlayerHand = (game: any, player_id: number) => {
  const hand = game.cards.filter(
    (card: any) => card.player_id === player_id && card.status === "in_hand"
  );
  return hand;
};

export const getNextPlayerPosition = (game: any) => {
  game.current_player_position =
    (game.current_player_position + 1) % game.players.length;
  return game.current_player_position;
};

export const hasSuit = (player_hand: any, suit: string) => {
  return player_hand.some((card: any) => getSuit(card) === suit);
};

const getSuit = (card: any) => {
  return card.card.suit;
};

const getRank = (card: any) => {
  return card.card.rank;
};

const getCardValue = (card: any) => {
  return card.card.value;
};

const calculateSpecialPoints = (
  completed_tricks: any,
  trick_number: number,
  next_card_suit: string,
  last_trick_index: number
): number => {
  if (trick_number <= 0) return 0;

  const trick = completed_tricks[trick_number];

  const winning_card = trick.cards.find(
    (card: any) => card.player_position === trick.leader_position
  );
  const winning_card_suit = getSuit(winning_card);
  const winning_card_rank = getRank(winning_card);

  if (winning_card_suit === next_card_suit) {
    return 0;
  }

  if (winning_card_rank == "6") {
    return (
      3 +
      calculateSpecialPoints(
        completed_tricks,
        trick_number - 1,
        winning_card_suit,
        last_trick_index
      )
    );
  }

  if (winning_card_rank == "7") {
    // check if the 7 was used to counter a six
    console.log("trick cards", trick.cards);
    let sameSuitCards = trick.cards.filter(
      (card: any) => card.card.suit == trick.leading_suit
    );
    console.log("same suit cards", sameSuitCards);
    let isaSix = sameSuitCards.find((card: any) => card.card.rank == "6");
    console.log("isaSix", isaSix);

    if (isaSix) {
      let indexOfSix = trick.cards.findIndex(
        (card: any) =>
          card.card.rank == "6" && card.card.suit == trick.leading_suit
      );
      let indexOfSeven = trick.cards.findIndex(
        (card: any) =>
          card.card.rank == "7" && card.card.suit == trick.leading_suit
      );
      if (indexOfSeven < indexOfSix) {
        console.log("the seven was played before the six");
        return (
          2 +
          calculateSpecialPoints(
            completed_tricks,
            trick_number - 1,
            winning_card_suit,
            last_trick_index
          )
        );
      } else {
        console.log("7 was used to counter a six");
        if (trick_number == last_trick_index) return 1;
        return 0;
      }
    }
    // if the seven was used to counter a six?
    // if its the last trick card score only one point and return
    //  else it doesn't score so return zero
    return (
      2 +
      calculateSpecialPoints(
        completed_tricks,
        trick_number - 1,
        winning_card_suit,
        last_trick_index
      )
    );
  }

  return 0;
};

export const reportMatchResult = async (
  gameId: number,
  winnerId: number,
  loserId: number,
  tournament_id: number
) => {
  try {
    // update match with winner

    await sql`
      UPDATE tournament_matches 
      SET winner_id = ${winnerId}, status = 'completed'
      WHERE game_id = ${gameId}
    `;

    await sql`
    UPDATE tournament_participants
    SET status = 'eliminated'
    WHERE tournament_id = ${tournament_id}
    AND user_id = ${loserId}
  `;

    const lobbyData = await getTournamentLobbyData(tournament_id);
    serverSocket
      .to(`tournament_${tournament_id}`)
      .emit("lobbyUpdate", lobbyData);
  } catch (error) {
    console.error("Error reporting match result:", error);
    throw error;
  }
};

// export const createNextSingleEliminationRoundMatches = async (
//   nextRoundNumber: number,
//   tournament_id: number
// ) => {
//   try {
//     const round = await createSingleEliminationRound(
//       tournament_id,
//       nextRoundNumber
//     );

//     const participants =
//       await getSingleEliminationTournamentParticipantsByStatus(
//         tournament_id,
//         "qualified"
//       );
//     const is_final_match = participants.length == 2;

//     fisherYatesShuffle(participants);

//     // Pair players and create matches
//     for (let i = 0; i < participants.length; i += 2) {
//       const player1 = participants[i];
//       const player2 = participants[i + 1];

//       if (!player2) {
//         // Handle odd number of players - auto-advance
//         const game = await createByeMatch(player1.id);

//         const gameplayer = await createMatchGamePlayer(
//           game.id,
//           player1.id,
//           0,
//           true
//         );

//         await createSingleEliminationByeMatch(
//           tournament_id,
//           game.id,
//           round.id,
//           player1.id,
//           Math.floor(i / 2) + 1
//         );
//         console.log(`created match for only ${player1.username}`);

//         const newGame = {
//           ...game,
//           players: [gameplayer],
//           cards: null,
//         };

//         await saveGame(game.code, newGame);
//         console.log("game saved to memory", game.code);
//         break;
//       }

//       const game = await createTwoPlayerMatch(
//         player1.id,
//         "waiting",
//         is_final_match,
//         true
//       );

//       const { gameplayer1, gameplayer2 } =
//         await createTwoPlayerMatchGamePlayers(game.id, player1.id, player2.id);

//       const gameCards = await createGameCardsForMatch(game.id, gameplayer1.id);
//       // Create match
//       await createSingleEliminationMatch(
//         tournament_id,
//         game.id,
//         round.id,
//         player1.id,
//         player2.id,
//         "in_progress",
//         Math.floor(i / 2) + 1
//       );

//       // update tournaments current round number
//       await sql`
//         UPDATE tournaments 
//         SET current_round_number = ${nextRoundNumber} 
//         WHERE id = ${tournament_id}
//       `;

//       game.turn_started_at = Date.now();
//       game.turn_ends_at =
//         game.turn_started_at + (game.turn_timeout_seconds + 0) * 1000;

//       await matchForfeiter.scheduleForfeit(
//         game.code,
//         (game.turn_timeout_seconds + 0) * 1000
//       );

//       // Prepare and save game to Redis
//       const newGame = {
//         ...game,
//         players: [gameplayer1, gameplayer2],
//         cards: gameCards,
//       };

//       await saveGame(game.code, newGame);
//       console.log("game saved to memory successfully", game.code);

//       const lobbyData = await getTournamentLobbyData(tournament_id);

//       serverSocket
//         .to(`tournament_${tournament_id}`)
//         .emit("lobbyUpdate", lobbyData);
//     }
//   } catch (error) {
//     console.error("Error advancing to next round:", error);
//     throw error;
//   }
// };

export const getTournamentLobbyData = async (tournamentId: number) => {
  // Fetch tournament details
  const tournament = await sql`
  SELECT * FROM tournaments WHERE id = ${tournamentId}
`;
  // Fetch participants with their global ranking
  const participants = await sql`
   SELECT 
     u.id, 
     u.username, 
     u.image_url, 
     u.rating,
     tp.status,
     RANK() OVER (ORDER BY u.rating DESC) as rank
   FROM users u
   JOIN tournament_participants tp ON u.id = tp.user_id
   WHERE tp.tournament_id = ${tournamentId}
 `;

  // Fetch current round matches with player details and scores
  const matches = await sql`
   SELECT 
     tr.round_number,
     tm.id,
     tm.game_id,
     tm.status,
     tm.winner_id,
     g.code,
     u1.id as player1_id,
     u2.id as player2_id,
     u1.username as player1_name,
     u1.image_url as player1_image,
     gp1.score as player1_score,
     u2.username as player2_name,
     u2.image_url as player2_image,
     gp2.score as player2_score
   FROM tournament_matches tm
   JOIN tournament_rounds tr ON tm.round_id = tr.id
   JOIN users u1 ON tm.player1_id = u1.id
   LEFT JOIN users u2 ON tm.player2_id = u2.id
   JOIN games g ON tm.game_id = g.id
   LEFT JOIN game_players gp1 ON g.id = gp1.game_id AND u1.id = gp1.user_id
   LEFT JOIN game_players gp2 ON g.id = gp2.game_id AND u2.id = gp2.user_id
   WHERE tm.tournament_id = ${tournamentId}
   ORDER BY tr.round_number ASC, tm.match_order ASC
 `;

  const games =
    await sql`SELECT code as gamecode from games where id = ANY(${matches.map((m) => m.game_id)}::integer[])`;

  const gamesMap: Record<string, any> = {};
  for (const gameData of games) {
    const gamecode = gameData.gamecode;
    const game = await getGameByCode(gamecode);
    gamesMap[gamecode] = game;
  }

  // Format rounds with aggregated player data
  const roundsMap: Record<number, any[]> = {};
  matches.forEach((match) => {
    if (!roundsMap[match.round_number]) {
      roundsMap[match.round_number] = [];
    }
    roundsMap[match.round_number].push({
      id: match.id,
      player1: {
        id: match.player1_id,
        name: match.player1_name,
        image_url: match.player1_image,
        score: match.player1_score || 0,
        winner: match.winner_id === match.player1_id ? true : false,
      },
      player2: {
        id: match.player2_id,
        name: match.player2_name,
        image_url: match.player2_image,
        score: match.player2_score || 0,
        winner: match.winner_id === match.player2_id ? true : false,
      },
      status: match.status,
      game_id: match.game_id,
      game_code: match.code,
      winner_id: match.winner_id,
      turn_ends_at: gamesMap[match.code]?.turn_ends_at,
      forfeiter_user_id: gamesMap[match.code]?.forfeited_by,
    });
  });

  const rounds = Object.entries(roundsMap).map(([round, matches]) => ({
    round: parseInt(round),
    matches,
  }));

  return {
    success: true,
    tournament: tournament[0],
    participants,
    rounds,
  };
};

export const gameExists = async (gameCode: string) => {
  const value = await redis.exists(gameCode);
  return value === 1; // Redis returns 1 if the key exists, 0 if it does not
};

export async function saveGame(gameCode: string, gameData: any) {
  try {
    await redis.set(gameCode, JSON.stringify(gameData), "EX", 3600); // Set expiration time to 1 hour
  } catch (error) {
    console.error("Error saving game to Redis:", error);
  }
}

export async function getGameByCode(gameCode: string): Promise<any> {
  try {
    const gameData = await redis.get(gameCode);
    if (gameData) {
      return JSON.parse(gameData);
    }
    return null;
  } catch (error) {
    console.error("Error loading game from Redis:", error);
    return null;
  }
}

export async function createGamePlayer(
  gameId: number,
  userId: number,
  position: number
) {
  try {
    const player =
      await sql`INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
         VALUES (
           ${gameId}, 
           ${userId}, 
           ${position}, 
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
             'image_url', image_url
           ) FROM users WHERE id = user_id) as user`;

    return player[0];
  } catch (error) {
    console.log("Failed to create game player", error);
    return null;
  }
}
