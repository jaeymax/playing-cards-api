import sql from "../config/db";
import { games, mixpanel, redis } from "../index";
import { serverSocket } from "../index";
import { updateRatings } from "../utils/rating";

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
  game.current_player_position = (game.current_player_position + 1) % game.player_count;
  game.current_turn_user_id = game.players.find((player:any)=>player.position == game.current_player_position)?.user?.id;
  await redis.zadd('forfeit:index', game.turn_ends_at, game.code);
};

export const shuffleDeck = async (game: any) => {
  game.cards.forEach((card: any) => {
    card.player_id = 0; // Reset player_id for shuffling
    card.status = "in_deck";
    card.hand_position = -1;
    card.animation_state = "shuffling";
  });

  game.cards.sort(() => Math.random() - 0.5);
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
  game.turn_ends_at = turn_ends_at

  await redis.zadd('forfeit:index', game.turn_ends_at, game.code);
  // Move to next player or complete trick if needed
  if (game.current_trick.cards.length === game.players.length) {
    completeTrick(game);
  } else {
    getNextPlayerPosition(game);
  }


  const before_player = game.players.find((p:any)=>p.user.id == game.current_turn_user_id)?.user.username;
  //console.log('before', game.current_turn_user_id, before_player)

  const current_turn_user_id = game.players.find(
    (p: any) => p.position === game.current_player_position
  )?.user.id;

  game.current_turn_user_id = current_turn_user_id;

  const after_player = game.players.find((p:any)=>p.user.id == game.current_turn_user_id).user.username;
  //console.log('after', game.current_turn_user_id, after_player)
  await saveGame(game.code, game);
  // await sql`UPDATE games SET current_turn_user_id = ${current_turn_user_id}, turn_started_at = NOW() WHERE id = ${game.id}`;

  // serverSocket.to(game.code).emit("turnStarted", {
  //   current_turn_user_id,
  //   turn_ends_at,
  // });
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

  const winner = game.players.find(
    (player: any) => player.position === final_trick.leader_position
  );
  winner.score += points;

  if (winner.score >= game.win_points) {
    // new line to increment games_won

    const entry = await redis.zrem("forfeit:index", game.code);
    // console.log("Removed from forfeit index: first", entry, game.code);
    // const entry2 = await redis.zrem('forfeit:index', game.code);
    // const entry3 = await redis.zrem("forfeit:index", game.code);    
    // console.log("Redis test first", entry2)
    // console.log("Redis test aftermath", entry3)
    winner.games_won += 1;
    setTimeout(() => {
      serverSocket.to(game.code).emit("gameOver", {
        winner: { ...winner, points, hand_number: game.current_hand_number },
      });
    }, 1000);


    // Update game status
    await sql`UPDATE games SET status = 'completed', ended_at = NOW() WHERE id = ${game.id}`;

    // Update all players scores and games_played in the database
    for (const player of game.players) {
      await sql`
        UPDATE game_players 
        SET score = ${player.score}
        WHERE game_id = ${game.id} AND user_id = ${player.user.id}
      `;

      // update games_played for each user
      await sql`
        UPDATE users 
        SET games_played = games_played + 1
        WHERE id = ${player.user.id}
      `;
    }

    // Update user's game_wons count
    await sql`
      UPDATE users 
      SET games_won = games_won + 1
      WHERE id = ${winner.user.id}
    `;

    if (game.is_rated) {
      const tournament_id = await sql`
      SELECT tournament_id 
      FROM tournament_matches 
      WHERE game_id = ${game.id}
    `;

      await reportMatchResult(
        game.id,
        winner.user.id,
        tournament_id[0].tournament_id
      );

      const current_round_number = await sql`
      SELECT tr.round_number
      FROM tournament_matches tm
      JOIN tournament_rounds tr ON tm.round_id = tr.id
      WHERE tm.game_id = ${game.id}
    `;

      console.log("current_round_number", current_round_number[0].round_number);

      // count all matches in progress for the current tournament's round
      const ongoingMatches = await sql`
        SELECT COUNT(*) AS ongoing_count
        FROM tournament_matches tm
        JOIN tournament_rounds tr ON tm.round_id = tr.id
        WHERE tm.tournament_id = ${tournament_id[0].tournament_id}
        AND tr.round_number = ${current_round_number[0].round_number}
        AND (tm.status = 'in_progress' OR tm.status = 'pending')
      `;

      console.log("ongoingMatches", ongoingMatches[0].ongoing_count);

      // if no ongoing matches remain, check active participants
      console.log("type", typeof ongoingMatches[0].ongoing_count);
      if (ongoingMatches[0].ongoing_count == 0) {
        // proceed to check active participants
        // count all active participants in the tournament
        const activeParticipants = await sql`
          SELECT COUNT(*) AS active_count
          FROM tournament_participants
          WHERE tournament_id = ${tournament_id[0].tournament_id} AND status = 'qualified'
        `;

        console.log("activeParticipants", activeParticipants[0].active_count);

        if (activeParticipants[0].active_count <= 1) {
          // if only one active participant remains, mark the tournament as completed
          await sql`
            UPDATE tournaments
            SET status = 'completed', end_date = NOW()
            WHERE id = ${tournament_id[0].tournament_id}
          `;

          // set tournament winner to the last active participant
          const winnerParticipant = await sql`
            SELECT user_id
            FROM tournament_participants
            WHERE tournament_id = ${tournament_id[0].tournament_id} AND status = 'qualified'
            LIMIT 1
          `;

          if (winnerParticipant.length > 0) {
            await sql`
              UPDATE tournaments
              SET winner_id = ${winnerParticipant[0].user_id}
              WHERE id = ${tournament_id[0].tournament_id}
            `;
          }

          // send a notification message to the winner in db
         await sql`
            INSERT INTO notifications (user_id, type, title, message, action)
            VALUES (
              ${winnerParticipant[0].user_id},
              'tournament',
              'Tournament Champion 🏆',
              'Congratulations! You won the Weekend Tournament. Your skill and strategy paid off — enjoy your rewards!',
              'Claim Prize'
            )
          `;

        } else if (activeParticipants[0].active_count > 1) {
          // advance to next round
          await advanceToNextRound(
            game.id,
            current_round_number[0].round_number + 1,
            tournament_id[0].tournament_id
          );
        }
      } else {
        // exit if there are still ongoing matches
      }

      //update ratings
      const players = updateRatings(game.players, winner.user.id);
      for (let player of players) {
        await sql`UPDATE users SET rating = ${player.user.rating} WHERE id = ${player.user.id}`;
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

  if (winning_card_rank == "6"){
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

  if (winning_card_rank == "7"){
    // check if the 7 was used to counter a six
    console.log('trick cards', trick.cards)
    let sameSuitCards = trick.cards.filter((card:any)=>card.card.suit == trick.leading_suit)
    console.log('same suit cards', sameSuitCards)
    let isaSix = sameSuitCards.find((card:any)=> card.card.rank == '6');
    console.log('isaSix', isaSix)

    if(isaSix){
       let indexOfSix = trick.cards.findIndex((card:any)=>card.card.rank == '6' && card.card.suit == trick.leading_suit);
       let indexOfSeven = trick.cards.findIndex((card:any)=>card.card.rank == '7' && card.card.suit == trick.leading_suit)
       if(indexOfSeven < indexOfSix){
        console.log('the seven was played before the six')
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
       else{
         console.log('7 was used to counter a six')
         if(trick_number == last_trick_index)return  1;
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
  tournament_id: number
) => {
  try {
    // update match with winner

    await sql`
      UPDATE tournament_matches 
      SET winner_id = ${winnerId}, status = 'completed'
      WHERE game_id = ${gameId}
    `;

    // update the loser's participant status to 'eliminated'
    const loserParticipant = await sql`
    SELECT 
      CASE 
        WHEN player1_id = ${winnerId} 
        THEN player2_id 
        ELSE player1_id 
      END AS loser_id
    FROM tournament_matches 
    WHERE game_id = ${gameId}
  `;

    await sql`
    UPDATE tournament_participants
    SET status = 'eliminated'
    WHERE tournament_id = ${tournament_id}
    AND user_id = ${loserParticipant[0].loser_id}
  `;

    const lobbyData = await getTournamentLobbyData(tournament_id);
    serverSocket.to(`tournament_${tournament_id}`).emit("lobbyUpdate", lobbyData);


  } catch (error) {
    console.error("Error reporting match result:", error);
    throw error;
  }
};

export const advanceToNextRound = async (
  gameId: number,
  nextRoundNumber: number,
  tournament_id: number
) => {
  try {
    // create a new round entry for the tournament if it doesn't exist
    const existingRound = await sql`
      SELECT id 
      FROM tournament_rounds 
      WHERE tournament_id = ${tournament_id} 
      AND round_number = ${nextRoundNumber}
    `;

    let roundId;
    if (existingRound.length === 0) {
      const newRound = await sql`
        INSERT INTO tournament_rounds (tournament_id, round_number) 
        VALUES (${tournament_id}, ${nextRoundNumber})
        RETURNING id
      `;
      roundId = newRound[0].id;
    } else {
      roundId = existingRound[0].id;
    }

    // create new matches for the next round
    const participants = await sql`
      SELECT u.id, u.username, u.image_url
      FROM users u
      JOIN tournament_participants tp ON u.id = tp.user_id
      WHERE tp.tournament_id = ${tournament_id} AND status = 'qualified'
      ORDER BY u.username
    `;

    // Shuffle participants
    const shuffled = participants.sort(() => Math.random() - 0.5);

    // Pair players and create matches
    for (let i = 0; i < shuffled.length; i += 2) {
      const player1 = shuffled[i];
      const player2 = shuffled[i + 1];

      if (!player2) {
        // Handle odd number of players - auto-advance
        const game = await sql`
            INSERT INTO games (
              code,
              created_by,
              player_count,
              status,
              current_turn_user_id,
              is_rated
            ) VALUES (
              ${Math.random().toString(36).substring(2, 12)},
              ${player1.id},
              2,
              'completed',
              ${player1.id},
              true
            )
            RETURNING *
          `;

        // create game player
        const result = await sql`
            INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
            VALUES (
              ${game[0].id}, 
              ${player1.id}, 
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
          `;

        // create tournament match
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
              ${tournament_id},
              ${game[0].id},
              ${roundId},
              ${player1.id},
              NULL,
              'completed',
              ${player1.id},
              ${Math.floor(i / 2) + 1}
            )
            RETURNING id, status
          `;

        continue;
      }

      const cards = await sql`SELECT card_id FROM cards ORDER BY RANDOM()`;

      const is_final_match = participants.length == 2;

      // Create game
      const game = await sql`
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
          ${player1.id},
          2,
          'waiting',
          ${player2.id},
          true,
          ${is_final_match}
        )
        RETURNING *
      `;

      // Create game players
      const result = await sql.transaction((sql) => [
        sql`
          INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
          VALUES (
            ${game[0].id}, 
            ${player1.id}, 
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
            ${game[0].id}, 
            ${player2.id}, 
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

      // Create game cards
      const gameCards = await sql`
        INSERT INTO game_cards (game_id, card_id, player_id, hand_position, status)
        SELECT 
          ${game[0].id},
          unnest(${cards.map((c) => c.card_id)}::integer[]),
          ${result[0][0].id},
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

      // Create match
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
          ${tournament_id},
          ${game[0].id},
          ${roundId},
          ${player1.id},
          ${player2.id},
          'in_progress',
          ${Math.floor(i / 2) + 1}
        )
        RETURNING id, status
      `;

      // update tournaments current round number
      await sql`
        UPDATE tournaments 
        SET current_round_number = ${nextRoundNumber} 
        WHERE id = ${tournament_id}
      `;

      // Prepare and save game to Redis
      const newGame = {
        ...game[0],
        players: [result[0][0], result[1][0]],
        cards: gameCards,
      };

      await saveGame(game[0].code, newGame);
      console.log("game saved to memory successfully", game[0].code);

      const lobbyData = await getTournamentLobbyData(tournament_id);

      serverSocket.to(`tournament_${tournament_id}`).emit("lobbyUpdate", lobbyData);
      //
    }
  } catch (error) {
    console.error("Error advancing to next round:", error);
    throw error;
  }
};

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

export async function saveGame(gameCode: string, gameData: object) {
  try {
    await redis.set(gameCode, JSON.stringify(gameData), "EX", 3600); // Set expiration time to 1 hour
  } catch (error) {
    console.error("Error saving game to Redis:", error);
  }
}

export async function getGameByCode(gameCode: string) {
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
