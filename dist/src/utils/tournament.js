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
exports.getSwissTournamentResultsForRound = exports.getSwissTournamentLobbyData = exports.getSwissTournamentStandings = exports.getSingleEliminationTournamentStandings = exports.getSwissTournamentFinalStandings = exports.advanceSwissTournamentToNextRound = exports.getSingleEliminationTournamentMatches = exports.getSingleElimationTournamentOngoingMatches = exports.getSingleEliminationTournamentWinner = exports.advanceSingleEliminationTournamentToNextRound = exports.updateSwissMatchResults = exports.updateSingleEliminationMatchResults = exports.createTwoPlayerMatchGamePlayers = exports.createMatchGamePlayer = exports.createByeMatch = exports.createTwoPlayerMatch = exports.createSingleEliminationMatch = exports.createSingleEliminationByeMatch = exports.getSingleEliminationTournamentParticipants = exports.getSingleEliminationTournamentParticipantsByStatus = exports.createGameCardsForMatch = exports.createSingleEliminationRound = exports.createNextSingleEliminationRoundMatches = void 0;
const console_1 = require("console");
const __1 = require("..");
const db_1 = __importDefault(require("../config/db")); // Ensure sql is properly typed in the db configuration file
const gameFunctions_1 = require("./gameFunctions");
const utils_1 = require("../utils");
const createNextSwissRoundMatches = (roundNumber, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    // Implementation for creating the next round in a swiss tournament
    try {
        const round = yield createSwissRound(tournamentId, roundNumber);
        let participants = yield getSwissTournamentParticipantsByScore(tournamentId);
        let byePlayer = null;
        if (participants.length % 2 != 0) {
            // grant the lowest player who hasn't received a bye yet a bye
            for (let i = participants.length - 1; i >= 0; i--) {
                if (!participants[i].has_received_bye) {
                    byePlayer = participants[i];
                    break;
                }
            }
            if (!byePlayer) {
                byePlayer = participants[participants.length - 1];
            }
        }
        if (byePlayer) {
            participants = participants.filter((p) => p.id !== byePlayer.id);
            const game = yield createByeMatch(byePlayer.id);
            const gameplayer = yield createMatchGamePlayer(game.id, byePlayer.id, 0, true);
            yield createSingleEliminationByeMatch(tournamentId, game.id, round.id, byePlayer.id, Math.floor(participants.length / 2) + 1);
            console.log(`created match for only ${byePlayer.username}`);
            yield (0, db_1.default) `
              UPDATE tournament_participants
              SET score = score + 1
              WHERE tournament_id = ${tournamentId} AND user_id = ${byePlayer.id}
            `;
            const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer], cards: null });
            yield (0, gameFunctions_1.saveGame)(game.code, newGame);
            console.log("game saved to memory", game.code);
        }
        console.log("bye player", byePlayer);
        participants = yield pairSwissRoundParticipants(participants, tournamentId);
        console.log("swiss participants by score", participants);
        const lastRoundNumber = Math.ceil(Math.log2(participants.length));
        const isLastRound = roundNumber >= lastRoundNumber;
        for (let i = 0; i < participants.length; i += 2) {
            const player1 = participants[i];
            const player2 = participants[i + 1];
            if (!player2) {
                // Handle odd number of players - auto-advance
                const game = yield createByeMatch(player1.id);
                const gameplayer = yield createMatchGamePlayer(game.id, player1.id, 0, true);
                yield createSingleEliminationByeMatch(tournamentId, game.id, round.id, player1.id, Math.floor(i / 2) + 1);
                console.log(`created match for only ${player1.username}`);
                const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer], cards: null });
                yield (0, db_1.default) `
          UPDATE tournament_participants
          SET score = score + 1
          WHERE tournament_id = ${tournamentId}
          AND user_id = ${player1.id}
        `;
                yield (0, gameFunctions_1.saveGame)(game.code, newGame);
                console.log("game saved to memory", game.code);
                break;
            }
            const game = yield createTwoPlayerMatch(player1.id, "waiting", isLastRound, true);
            const { gameplayer1, gameplayer2 } = yield createTwoPlayerMatchGamePlayers(game.id, player1.id, player2.id);
            const gameCards = yield createGameCardsForMatch(game.id, gameplayer1.id);
            // Create match
            yield createSwissMatch(tournamentId, game.id, round.id, player1.id, player2.id, "in_progress", Math.floor(i / 2) + 1);
            // update tournaments current round number
            yield (0, db_1.default) `
          UPDATE tournaments
          SET current_round_number = ${roundNumber}
          WHERE id = ${tournamentId}
        `;
            game.turn_started_at = Date.now();
            game.turn_ends_at =
                game.turn_started_at + (game.turn_timeout_seconds + 0) * 1000;
            yield __1.matchForfeiter.scheduleForfeit(game.code, (game.turn_timeout_seconds + 0) * 1000);
            // Prepare and save game to Redis
            const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer1, gameplayer2], cards: gameCards });
            yield (0, gameFunctions_1.saveGame)(game.code, newGame);
            console.log("game saved to memory successfully", game.code);
            const link = `https://sparplay.com/tournaments/${tournamentId}`;
            if (player1.push_token) {
                const title = `${player1.username}! Your Match is Ready`;
                const body = `You vs ${player2.username}`;
                (0, __1.sendPushNotification)(player1.push_token, title, body, link);
            }
            if (player2.push_token) {
                const title = `${player2.username}! Your Match is Ready`;
                const body = `You vs ${player1.username}`;
                (0, __1.sendPushNotification)(player2.push_token, title, body, link);
            }
        }
    }
    catch (error) {
        console.error("Error advancing to next round:", error);
        throw error;
    }
});
// flag
const createSwissRound = (tournamentId, roundNumber) => __awaiter(void 0, void 0, void 0, function* () {
    const round = yield (0, db_1.default) `
      INSERT INTO tournament_rounds (tournament_id, round_number)
      VALUES (${tournamentId}, ${roundNumber}) ON CONFLICT (tournament_id, round_number) DO NOTHING
      RETURNING id
    `;
    return round[0];
});
//flag
const createSwissMatch = (tournamentId, matchId, roundId, player1Id, player2Id, status, matchOrder) => __awaiter(void 0, void 0, void 0, function* () {
    const match = yield (0, db_1.default) `
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
});
const createNextSingleEliminationRoundMatches = (roundNumber, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    // Implementation for creating the next round in a single elimination tournament
    try {
        const round = yield createSingleEliminationRound(tournamentId, roundNumber);
        let participants = yield getSingleEliminationTournamentParticipantsByStatus(tournamentId, "qualified");
        const is_final_match = participants.length == 2;
        let byePlayer = null;
        if (participants.length % 2 != 0) {
            // grant the lowest player who hasn't received a bye yet a bye
            for (let i = participants.length - 1; i >= 0; i--) {
                if (!participants[i].has_received_bye) {
                    byePlayer = participants[i];
                    break;
                }
            }
            if (!byePlayer) {
                byePlayer = participants[participants.length - 1];
            }
        }
        if (byePlayer) {
            participants = participants.filter((p) => p.id !== byePlayer.id);
            const game = yield createByeMatch(byePlayer.id);
            const gameplayer = yield createMatchGamePlayer(game.id, byePlayer.id, 0, true);
            yield createSingleEliminationByeMatch(tournamentId, game.id, round.id, byePlayer.id, Math.floor(participants.length / 2) + 1);
            console.log(`created match for only ${byePlayer.username}`);
            const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer], cards: null });
            yield (0, gameFunctions_1.saveGame)(game.code, newGame);
            console.log("game saved to memory", game.code);
        }
        console.log("bye player", byePlayer);
        (0, gameFunctions_1.fisherYatesShuffle)(participants);
        // Pair players and create matches
        for (let i = 0; i < participants.length; i += 2) {
            const player1 = participants[i];
            const player2 = participants[i + 1];
            const game = yield createTwoPlayerMatch(player1.id, "waiting", is_final_match, true);
            const { gameplayer1, gameplayer2 } = yield createTwoPlayerMatchGamePlayers(game.id, player1.id, player2.id);
            const gameCards = yield createGameCardsForMatch(game.id, gameplayer1.id);
            // Create match
            yield createSingleEliminationMatch(tournamentId, game.id, round.id, player1.id, player2.id, "in_progress", Math.floor(i / 2) + 1);
            // update tournaments current round number
            yield (0, db_1.default) `
        UPDATE tournaments
        SET current_round_number = ${roundNumber}
        WHERE id = ${tournamentId}
      `;
            game.turn_started_at = Date.now();
            game.turn_ends_at =
                game.turn_started_at + (game.turn_timeout_seconds + 0) * 1000;
            yield __1.matchForfeiter.scheduleForfeit(game.code, (game.turn_timeout_seconds + 0) * 1000);
            // Prepare and save game to Redis
            const newGame = Object.assign(Object.assign({}, game), { players: [gameplayer1, gameplayer2], cards: gameCards });
            yield (0, gameFunctions_1.saveGame)(game.code, newGame);
            console.log("game saved to memory successfully", game.code);
            const link = `https://sparplay.com/tournaments/${tournamentId}`;
            // send push notification to players
            if (player1.push_token) {
                const title = `${player1.username}! Your Match is Ready`;
                const body = `You vs ${player2.username}`;
                (0, __1.sendPushNotification)(player1.push_token, title, body, link);
            }
            if (player2.push_token) {
                const title = `${player2.username}! Your Match is Ready`;
                const body = `You vs ${player1.username}`;
                (0, __1.sendPushNotification)(player2.push_token, title, body, link);
            }
            // const lobbyData = await getSingleEliminationTournamentLobbyData(tournamentId);
            // serverSocket
            //   .to(`tournament_${tournamentId}`)
            //   .emit("lobbyUpdate", lobbyData);
        }
    }
    catch (error) {
        console.error("Error advancing to next round:", error);
        throw error;
    }
});
exports.createNextSingleEliminationRoundMatches = createNextSingleEliminationRoundMatches;
const getSwissTournamentParticipantsByScore = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const participants = yield (0, db_1.default) `
    SELECT u.id, u.username, u.is_rated, u.push_token, u.image_url, tp.score, tp.has_received_bye
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId}
    ORDER BY tp.score DESC, u.rating DESC
  `;
    return participants;
});
const getSingleEliminationTournamentParticipants = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const participants = yield (0, db_1.default) `
    SELECT u.id, u.username, u.push_token, u.rating, u.is_rated, u.image_url, tp.status, tp.has_received_bye, tp.score, tp.losses
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId}
    ORDER BY u.rating DESC
  `;
    return participants;
});
exports.getSingleEliminationTournamentParticipants = getSingleEliminationTournamentParticipants;
const getSingleEliminationTournamentParticipantsByStatus = (tournamentId, status) => __awaiter(void 0, void 0, void 0, function* () {
    const participants = yield (0, db_1.default) `
    SELECT u.id, tp.user_id, tp.has_received_bye, u.username, u.image_url, u.push_token, tp.status, tp.score, tp.losses
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId} AND status = ${status}
    ORDER BY u.username
  `;
    return participants;
});
exports.getSingleEliminationTournamentParticipantsByStatus = getSingleEliminationTournamentParticipantsByStatus;
const createSingleEliminationRound = (tournamentId, roundNumber) => __awaiter(void 0, void 0, void 0, function* () {
    const round = yield (0, db_1.default) `
      INSERT INTO tournament_rounds (tournament_id, round_number)
      VALUES (${tournamentId}, ${roundNumber}) ON CONFLICT (tournament_id, round_number) DO NOTHING
      RETURNING id
    `;
    return round[0];
});
exports.createSingleEliminationRound = createSingleEliminationRound;
const createSingleEliminationByeMatch = (tournamentId, matchId, roundId, playerId, matchOrder) => __awaiter(void 0, void 0, void 0, function* () {
    const match = yield (0, db_1.default) `
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
    yield (0, db_1.default) `UPDATE tournament_participants SET has_received_bye = TRUE where user_id = ${playerId} AND tournament_id = ${tournamentId}`;
    return match[0];
});
exports.createSingleEliminationByeMatch = createSingleEliminationByeMatch;
const createSingleEliminationMatch = (tournamentId, matchId, roundId, player1Id, player2Id, status, matchOrder) => __awaiter(void 0, void 0, void 0, function* () {
    const match = yield (0, db_1.default) `
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
});
exports.createSingleEliminationMatch = createSingleEliminationMatch;
const createTwoPlayerMatch = (player1Id, status, isFinalRound, is_rated) => __awaiter(void 0, void 0, void 0, function* () {
    const match = yield (0, db_1.default) `
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
});
exports.createTwoPlayerMatch = createTwoPlayerMatch;
const createByeMatch = (playerId) => __awaiter(void 0, void 0, void 0, function* () {
    const match = yield (0, db_1.default) `
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
});
exports.createByeMatch = createByeMatch;
const createTwoPlayerMatchGamePlayers = (matchId, player1Id, player2Id) => __awaiter(void 0, void 0, void 0, function* () {
    const gameplayers = yield db_1.default.transaction((sql) => [
        sql `
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
        sql `
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
});
exports.createTwoPlayerMatchGamePlayers = createTwoPlayerMatchGamePlayers;
const createGameCardsForMatch = (matchId, player1GamePlayerId) => __awaiter(void 0, void 0, void 0, function* () {
    const cards = yield (0, db_1.default) `SELECT card_id FROM cards ORDER BY RANDOM()`;
    const gameCards = yield (0, db_1.default) `
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
});
exports.createGameCardsForMatch = createGameCardsForMatch;
const createMatchGamePlayer = (matchId, playerId, player_position, is_dealer) => __awaiter(void 0, void 0, void 0, function* () {
    const gameplayer = yield (0, db_1.default) `
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
});
exports.createMatchGamePlayer = createMatchGamePlayer;
// function to update singleElimination match Results like match status and eliminated players
const updateSingleEliminationMatchResults = (matchId, winnerId, loserId, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
  UPDATE tournament_matches
  SET winner_id = ${winnerId}, status = 'completed'
  WHERE game_id = ${matchId}
`;
    yield (0, db_1.default) `
UPDATE tournament_participants
SET status = 'eliminated'
WHERE tournament_id = ${tournamentId}
AND user_id = ${loserId}
`;
});
exports.updateSingleEliminationMatchResults = updateSingleEliminationMatchResults;
const updateSwissMatchResults = (matchId, winnerId, loserId, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    yield (0, db_1.default) `
  UPDATE tournament_matches
  SET winner_id = ${winnerId}, status = 'completed'
  WHERE game_id = ${matchId}
`;
    // Update the winners score by 1
    yield (0, db_1.default) `
     UPDATE tournament_participants
     SET score = score + 1
     WHERE tournament_id = ${tournamentId}
     AND user_id = ${winnerId}
 `;
    // update the losers score by 1
    yield (0, db_1.default) `
      UPDATE tournament_participants
      SET losses = losses + 1
      WHERE tournament_id = ${tournamentId}
      AND user_id = ${loserId}
      `;
});
exports.updateSwissMatchResults = updateSwissMatchResults;
const calculateBuchholzScoresForSwissRound = (tournamentId, participants) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    for (let participant of participants) {
        const buchholzResult = yield (0, db_1.default) `
      SELECT COALESCE(SUM(op_tp.score), 0) AS buchholz_score
      FROM tournament_matches tm
      JOIN tournament_participants op_tp
        ON op_tp.user_id =
             CASE
               WHEN tm.player1_id = ${participant.id} THEN tm.player2_id
               ELSE tm.player1_id
             END
        AND op_tp.tournament_id = ${tournamentId}
      WHERE tm.tournament_id = ${tournamentId}
        AND (tm.player1_id = ${participant.id} OR tm.player2_id = ${participant.id})
        AND tm.winner_id IS NOT NULL
    `;
        const buchholzScore = ((_a = buchholzResult[0]) === null || _a === void 0 ? void 0 : _a.buchholz_score) || 0;
        yield (0, db_1.default) `
      UPDATE tournament_participants
      SET buchholz_score = ${buchholzScore}
      WHERE tournament_id = ${tournamentId}
      AND user_id = ${participant.id}
    `;
    }
});
const calculateSonneBornBergerScoresForSwissRound = (tournamentId, participants) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    for (let participant of participants) {
        const sonneBornBergerResult = yield (0, db_1.default) `
        SELECT COALESCE(SUM(op_tp.score), 0) AS sonneborn_berger_score
        FROM tournament_matches tm
        JOIN tournament_participants op_tp ON
         op_tp.user_id = tm.player2_id
         OR op_tp.user_id = tm.player1_id
         WHERE tm.tournament_id = ${tournamentId} 
         AND op_tp.tournament_id = ${tournamentId}
         AND tm.winner_id = ${participant.id}
         AND op_tp.user_id != ${participant.id}
      `;
        const sonneBornBergerScore = ((_a = sonneBornBergerResult[0]) === null || _a === void 0 ? void 0 : _a.sonneborn_berger_score) || 0;
        yield (0, db_1.default) `UPDATE tournament_participants SET sonneborn_berger_score = ${sonneBornBergerScore}
      WHERE tournament_id = ${tournamentId} AND user_id = ${participant.id}
      `;
    }
});
const pairSwissRoundParticipants = (participants, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const pairedParticipants = [];
    const used = new Set();
    for (let i = 0; i < participants.length; i++) {
        if (used.has(participants[i].id))
            continue;
        let player1 = participants[i];
        let opponent = null;
        // Try to find a valid opponent for player1
        for (let j = i + 1; j < participants.length; j++) {
            if (used.has(participants[j].id))
                continue;
            // const test = !(await hasPlayedBefore(player1.id, participants[j].id, tournamentId))
            // console.log('test',player1.username, participants[j].username, test);
            if (!(yield hasPlayedBefore(player1.id, participants[j].id, tournamentId))) {
                opponent = participants[j];
                console.log("found valid match for", player1.username, "and", opponent.username);
                break;
            }
        }
        // If no valid opponent is found, pair with the next available participant (last resort)
        if (!opponent) {
            console.log("allowing rematch last resort for player", player1.username);
            for (let j = i + 1; j < participants.length; j++) {
                if (used.has(participants[j].id))
                    continue;
                opponent = participants[j];
                console.log("repeated match for", player1.username, "and", opponent.username);
                break;
            }
        }
        pairedParticipants.push(player1);
        pairedParticipants.push(opponent);
        used.add(player1.id);
        used.add(opponent.id);
    }
    console.log("paired_participants", pairedParticipants);
    return pairedParticipants;
});
const hasPlayedBefore = (playerId, opponentId, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    // This function should check the database to see if playerId and opponentId have been matched against each other in previous rounds of the tournament
    const query = yield (0, db_1.default) `SELECT id from tournament_matches WHERE tournament_id = ${tournamentId} AND status in ('completed', 'forfeited') AND (
      (player1_id = ${playerId} AND player2_id = ${opponentId}) OR (player1_id = ${opponentId} AND player2_id = ${playerId})
    ) LIMIT 1`;
    console.log("query result for ", playerId, "and", opponentId, "", query, "", query.length);
    return query.length > 0;
});
const advanceSwissTournamentToNextRound = (tournamentId, currentRoundNumber, serverSocket) => __awaiter(void 0, void 0, void 0, function* () {
    const matches = yield getSwissTournamentMatches(tournamentId, currentRoundNumber);
    const allMatchesCompleted = matches.every((match) => match.winner_id != null);
    const participants = yield getSwissTournamentParticipantsByScore(tournamentId);
    const lastRoundNumber = Math.ceil(Math.log2(participants.length));
    const isLastRound = currentRoundNumber >= lastRoundNumber;
    console.log("isLastRound", isLastRound);
    if (allMatchesCompleted && !isLastRound) {
        yield calculateBuchholzScoresForSwissRound(tournamentId, participants);
        yield calculateSonneBornBergerScoresForSwissRound(tournamentId, participants);
        yield createNextSwissRoundMatches(currentRoundNumber + 1, tournamentId);
        const lobbyData = yield getSwissTournamentLobbyData(tournamentId);
        serverSocket
            .to(`tournament_${tournamentId}`)
            .emit("lobbyUpdate", lobbyData);
    }
    else if (allMatchesCompleted && isLastRound) {
        // tournament has ended
        yield calculateBuchholzScoresForSwissRound(tournamentId, participants);
        yield calculateSonneBornBergerScoresForSwissRound(tournamentId, participants);
        console.log("this is the last round and match for swiss tournament");
        yield (0, utils_1.markTournamentAsEndedAndCompleted)(tournamentId);
        const lobbyData = yield getSwissTournamentLobbyData(tournamentId);
        serverSocket
            .to(`tournament_${tournamentId}`)
            .emit("lobbyUpdate", lobbyData);
        serverSocket.to(`tournament_${tournamentId}`).emit("tournamentEnded");
        // const swissTournamentStandings = await getSwissTournamentFinalStandings(tournamentId);
        // if (winnerParticipant) {
        //   await sql`
        //           UPDATE tournaments
        //           SET winner_id = ${winnerParticipant.user_id}
        //           WHERE id = ${tournamentId}
        //         `;
        // }
        const allParticipants = yield getSwissTournamentParticipantsByScore(tournamentId);
        // get Top 3 winners for the tournament
        const winners = yield getSwissTournamentWinners(tournamentId);
        console.log("swiss winners", winners);
        (0, console_1.assert)(winners.length >= 3, "There should be at least 3 winners for the tournament");
        const firstPlace = winners[0];
        const secondPlace = winners[1];
        const thirdPlace = winners[2];
        // update the tournament winner_id field in the tournaments table with the user_id of the winner
        yield (0, db_1.default) `UPDATE tournaments SET winner_id = ${firstPlace.id} WHERE id = ${tournamentId}`;
        const winnerMessage = `Congratulations! You have conquered the Saturday Spar Challenge. 1st Place out of ${allParticipants.length} competitors! Your skill and strategy paid off - Your name now stands at the top. Enjoy your rewards and bragging rights!`;
        const runnerUpMessage = `Congratulations! You secured 2nd Place out of ${allParticipants.length} players. You were one match away from the crown. The next tournament could be yours!`;
        const thirdPlaceMessage = `Congratulations! You earned 3rd Place in the Saturday Spar Challenge. A podium performance among ${allParticipants.length} competitors! You've proven you belong among the elite competitors.`;
        const participationMessage = `You battled in this week's Spar Tournament and made your mark. 🎖 Participation Reward: +2 Rating. Thanks for participating. Every tournament sharpends your edge.`;
        const nextTournamentMessage = `The next Saturday Spar Challenge is coming up! Sharpen your skills and get ready to compete for glory and prizes. Mark your calendar for Saturday 8PM and be there to claim your spot among the best!`;
        const cashPrizeMessage = `Your victory in the Saturday Spar Challenge has earned you ₵50.
Our team will contact you and credit your reward within 15 minutes. Congratulations on an outstanding performance.`;
        // send notification to all participants about participation reward and tournament results, also include the rating change for each participant in the notification
        for (const participant of allParticipants) {
            let ratingChange = yield getRatingChangeForTournament(participant.id, tournamentId);
            const participationReward = 2;
            ratingChange += participationReward; // add 2 rating points for participation
            const ratingMesssageTitle = ratingChange >= 0 ? "Rating Increased 📈" : "Rating Decreased 📉";
            const ratingMessage = `Your performance in the tournament has resulted in a rating change of ${ratingChange >= 0 ? "+" : ""}${ratingChange}. Keep competing to climb the leaderboard!. Your leaderboard position have been updated`;
            // update peak rating also to be max of current rating and peak rating
            const prevRatingResults = yield (0, db_1.default) `
        SELECT rating_after FROM ratings_history
        WHERE user_id = ${participant.id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const prevRating = prevRatingResults.length > 0
                ? prevRatingResults[0].rating_after
                : participant.rating;
            const newRating = prevRating + ratingChange;
            const peakRating = Math.max(prevRating, newRating);
            console.log("prev rating", prevRating, "new rating", newRating);
            yield db_1.default.transaction((sql) => [
                sql `
            INSERT INTO ratings_history (user_id, tournament_id, rating_before, rating_change, rating_after)
            VALUES (${participant.id}, ${tournamentId}, ${prevRating}, ${ratingChange}, ${newRating})
          `,
                sql `UPDATE users SET rating = ${newRating} where id = ${participant.id}`,
                sql `UPDATE users SET peak_rating = ${peakRating} where id = ${participant.id}`,
            ]);
            console.log(`rating change for user ${participant.username} in tournament ${tournamentId}:`, ratingChange);
            (0, utils_1.createNotification)(participant.id, "tournament", ratingMesssageTitle, ratingMessage, "View Profile");
            (0, utils_1.createNotification)(participant.id, "tournament", "🏆 Tournament Complete!", participationMessage, "View Results");
            if (!participant.is_rated) {
                yield (0, db_1.default) `
        UPDATE users
        SET is_rated = true
        WHERE id = ${participant.id}
        `;
                (0, utils_1.createNotification)(participant.id, "tournament", "Your games are now rated! 🎉", "Your performance in this tournament has unlocked the ability for your games to be rated. Climb the leaderboard and show off your skills!", "View Leaderboard");
            }
            // update tournaments played for each participant
            yield (0, db_1.default) `
        UPDATE users
        SET tournaments_played = tournaments_played + 1
        WHERE id = ${participant.id}
      `;
            // update tournaments won for the winner
            if (participant.id === firstPlace.id) {
                yield (0, db_1.default) `
          UPDATE users
          SET tournaments_won = tournaments_won + 1
          WHERE id = ${participant.id}
        `;
            }
        }
        (0, utils_1.createNotification)(firstPlace.id, "tournament", "Saturday Spar Challenge Champion 🏆", winnerMessage, "Claim Prize");
        (0, utils_1.createNotification)(secondPlace.id, "tournament", "Saturday Spar Challenge Runner-Up 🥈", runnerUpMessage, "Claim Prize");
        (0, utils_1.createNotification)(thirdPlace.id, "tournament", "Saturday Spar Challenge Top 3 Finish 🥉", thirdPlaceMessage, "Claim Prize");
        (0, utils_1.createNotification)(firstPlace.id, "reward", "🥇 Gold Medal Awarded!", "You conquered every round and claimed 1st Place. This tournament belongs to you. A true Spar Champion.🥇 Medal added to your profile.", "Claim Prize");
        (0, utils_1.createNotification)(secondPlace.id, "reward", "🥈 Silver Medal Awarded!", "You fought your way to the Final and secured 2nd Place. An impressive feat among fierce competition. 🥈 Medal added to your profile.", "Claim Prize");
        (0, utils_1.createNotification)(thirdPlace.id, "reward", "🥉 Bronze Medal Awarded!", "You battled through tough matches and earned 3rd Place. A podium finish to be proud of! 🥉 Medal added to your profile.", "Claim Prize");
        // createNotification(
        //   firstPlace.id,
        //   "reward",
        //   "💰 ₵50 Cash Prize Won!",
        //   cashPrizeMessage,
        //   "View Leaderboard"
        // );
        // update medals for top 3 winners
        // wrap in sql trasaction to ensure all medal updates are successful, if any of them fail, the transaction will be rolled back and no medals will be updated
        yield db_1.default.transaction((sql) => [
            sql `
      UPDATE users
      SET gold_medals = gold_medals + 1
      WHERE id = ${firstPlace.id}
    `,
            sql `
      UPDATE users
      SET silver_medals = silver_medals + 1
      WHERE id = ${secondPlace.id}
    `,
            sql `
      UPDATE users
      SET bronze_medals = bronze_medals + 1
      WHERE id = ${thirdPlace.id}
    `,
        ]);
        yield createNextTournamentForNextWeek(tournamentId);
    }
});
exports.advanceSwissTournamentToNextRound = advanceSwissTournamentToNextRound;
const getSwissTournamentMatches = (tournamentId, currentRoundNumber) => __awaiter(void 0, void 0, void 0, function* () {
    const matches = yield (0, db_1.default) `
  SELECT id, winner_id, player1_id, player2_id
  FROM tournament_matches
  WHERE tournament_id = ${tournamentId}
  AND round_id = (SELECT id FROM tournament_rounds WHERE tournament_id = ${tournamentId} AND round_number = ${currentRoundNumber})
`;
    return matches;
});
const getSwissTournamentLobbyData = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    // Fetch tournament details
    const tournament = yield (0, db_1.default) `
   SELECT * FROM tournaments WHERE id = ${tournamentId}
 `;
    // Fetch participants with their global ranking
    const participants = yield (0, db_1.default) `
    SELECT
      u.id,
      u.username,
      u.image_url,
      u.is_rated,
      u.rating,
      tp.status,
      tp.score,
      tp.losses
    FROM users u
    JOIN tournament_participants tp ON u.id = tp.user_id
    WHERE tp.tournament_id = ${tournamentId}
    ORDER BY u.rating DESC
  `;
    // Fetch current round matches with player details and scores
    const matches = yield (0, db_1.default) `
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
    const gamesList = yield (0, db_1.default) `SELECT code as gamecode from games where id = ANY(${matches.map((m) => m.game_id)}::integer[])`;
    const codes = gamesList.map((gameData) => gameData.gamecode);
    const games = yield (0, utils_1.getGamesByCodes)(codes);
    let gamesMap = {};
    if (games) {
        gamesMap = Object.fromEntries(games.map((game) => [game.code, game]));
    }
    // Format rounds with aggregated player data
    const roundsMap = {};
    matches.forEach((match) => {
        var _a, _b;
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
            turn_ends_at: (_a = gamesMap[match.code]) === null || _a === void 0 ? void 0 : _a.turn_ends_at,
            forfeiter_user_id: (_b = gamesMap[match.code]) === null || _b === void 0 ? void 0 : _b.forfeited_by,
        });
    });
    const rounds = Object.entries(roundsMap).map(([round, matches]) => ({
        round: parseInt(round),
        matches,
    }));
    const standings = yield getSwissTournamentStandings(tournamentId);
    return {
        success: true,
        tournament: tournament[0],
        participants,
        rounds,
        standings,
    };
});
exports.getSwissTournamentLobbyData = getSwissTournamentLobbyData;
const getSwissTournamentResultsForRound = (tournamentId, roundNumber) => __awaiter(void 0, void 0, void 0, function* () {
    // select all tournament participants for the tournament and order them by score descending, then by rating descending
    const results = yield (0, db_1.default) `SELECT u.id, u.username, u.image_url, tp.score, u.rating FROM users u JOIN tournament_participants tp ON u.id = tp.user_id WHERE tp.tournament_id = ${tournamentId} ORDER BY tp.score DESC, tp.buchholz_score DESC, u.rating DESC`;
    return results;
});
exports.getSwissTournamentResultsForRound = getSwissTournamentResultsForRound;
const getSwissTournamentFinalStandings = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    // select all tournament participants for the tournament and order them by score descending, then by buchholz score descending, then by rating descending
    const results = yield (0, db_1.default) `SELECT u.id, u.username, u.image_url, tp.score, tp.buchholz_score, u.rating FROM users u JOIN tournament_participants tp ON u.id = tp.user_id WHERE tp.tournament_id = ${tournamentId} ORDER BY tp.score DESC, tp.buchholz_score DESC, u.rating DESC`;
    return results;
});
exports.getSwissTournamentFinalStandings = getSwissTournamentFinalStandings;
// function to advance single elimination tournament to the next round, it will check if there are any matches that are completed in the current round, if all matches are completed, it will create the next round matches
const advanceSingleEliminationTournamentToNextRound = (tournamentId, currentRoundNumber, serverSocket) => __awaiter(void 0, void 0, void 0, function* () {
    const matches = yield getSingleEliminationTournamentMatches(tournamentId, currentRoundNumber);
    const allMatchesCompleted = matches.every((match) => match.winner_id != null);
    const active_participants = yield getSingleEliminationTournamentParticipantsByStatus(tournamentId, "qualified");
    const isLastRound = active_participants.length == 1;
    console.log("isLastRound", isLastRound);
    if (allMatchesCompleted && !isLastRound) {
        yield createNextSingleEliminationRoundMatches(currentRoundNumber + 1, tournamentId);
        const lobbyData = yield (0, gameFunctions_1.getSingleEliminationTournamentLobbyData)(tournamentId);
        serverSocket
            .to(`tournament_${tournamentId}`)
            .emit("lobbyUpdate", lobbyData);
    }
    else if (isLastRound) {
        // tournament has ended
        console.log("this is the last round and match");
        yield (0, utils_1.markTournamentAsEndedAndCompleted)(tournamentId);
        const winnerParticipant = active_participants.find((p) => p.status == "qualified");
        const lobbyData = yield (0, gameFunctions_1.getSingleEliminationTournamentLobbyData)(tournamentId);
        serverSocket
            .to(`tournament_${tournamentId}`)
            .emit("lobbyUpdate", lobbyData);
        serverSocket.to(`tournament_${tournamentId}`).emit("tournamentEnded");
        if (winnerParticipant) {
            yield (0, db_1.default) `
              UPDATE tournaments
              SET winner_id = ${winnerParticipant.user_id}
              WHERE id = ${tournamentId}
            `;
        }
        const allParticipants = yield getSingleEliminationTournamentParticipants(tournamentId);
        // get Top 3 winners for the tournament
        const winners = yield getSingleEliminationTournamentWinners(tournamentId);
        console.log("Single elimination winners", winners);
        // assert(
        //   winners.length >= 3,
        //   "There should be at least 3 winners for the tournament"
        // );
        const firstPlace = winners[0];
        const secondPlace = winners[1];
        const thirdPlace = winners[2];
        const winnerMessage = `Congratulations! You have conquered the Spar Weekend Championship. 1st Place out of ${allParticipants.length} competitors! Your skill and strategy paid off - Your name now stands at the top. Enjoy your rewards and bragging rights!`;
        const runnerUpMessage = `Congratulations! You secured 2nd Place out of ${allParticipants.length} players. You were one match away from the crown. The next tournament could be yours!`;
        const thirdPlaceMessage = `Congratulations! You earned 3rd Place in the Spar Weekend Tournament. A podium performance among ${allParticipants.length} competitors! You've proven you belong among the elite competitors.`;
        const participationMessage = `You battled in this week's Spar Tournament and made your mark. 🎖 Participation Reward: +2 Rating. Thanks for participating. Every tournament sharpends your edge.`;
        const nextTournamentMessage = `The next Spar Weekend Championship is coming up! Sharpen your skills and get ready to compete for glory and prizes. Mark your calendar for Friday 8PM and be there to claim your spot among the best!`;
        const cashPrizeMessage = `Your victory in the Spar Weekend Championship has earned you ₵50.
Our team will contact you and credit your reward within 15 minutes. Congratulations on an outstanding performance.`;
        // send notification to all participants about participation reward and tournament results, also include the rating change for each participant in the notification
        for (const participant of allParticipants) {
            let ratingChange = yield getRatingChangeForTournament(participant.id, tournamentId);
            const participationReward = 2;
            ratingChange += participationReward; // add 2 rating points for participation
            const ratingMesssageTitle = ratingChange >= 0 ? "Rating Increased 📈" : "Rating Decreased 📉";
            const ratingMessage = `Your performance in the tournament has resulted in a rating change of ${ratingChange >= 0 ? "+" : ""}${ratingChange}. Keep competing to climb the leaderboard!. Your leaderboard position have been updated`;
            // await sql`
            // UPDATE users
            // SET rating = rating + 2
            // WHERE id = ${participant.id}
            // `;
            // fetch the rating history for the previous rating before the tournament for the participant
            const prevRatingResults = yield (0, db_1.default) `
        SELECT rating_after FROM ratings_history
        WHERE user_id = ${participant.id}
        ORDER BY created_at DESC
        LIMIT 1
      `;
            const prevRating = prevRatingResults.length > 0
                ? prevRatingResults[0].rating_after
                : participant.rating;
            const newRating = prevRating + ratingChange;
            try {
                const peakRating = Math.max(prevRating, newRating);
                console.log("prev rating", prevRating, "new rating", newRating);
                yield db_1.default.transaction((sql) => [
                    sql `
            INSERT INTO ratings_history (user_id, tournament_id, rating_before, rating_change, rating_after)
            VALUES (${participant.id}, ${tournamentId}, ${prevRating}, ${ratingChange}, ${newRating})
          `,
                    sql `UPDATE users SET rating = ${newRating} where id = ${participant.id}`,
                    sql `UPDATE users SET peak_rating = ${peakRating} where id = ${participant.id}`,
                ]);
            }
            catch (err) {
                console.error("Error inserting into ratings_history:", err);
            }
            //await sql`INSERT INTO ratings_history (user_id, tournament_id, rating_before, rating_change, rating_after) VALUES (${participant.id}, ${tournamentId}, 2, ${ratingChange}, '')`;
            // createNotification(
            //   participant.id,
            //   "tournament",
            //   "⏳ Next Tournament: Friday 8PM",
            //   nextTournamentMessage,
            //   "Register"
            // );
            console.log(`rating change for user ${participant.username} in tournament ${tournamentId}:`, ratingChange);
            (0, utils_1.createNotification)(participant.id, "tournament", ratingMesssageTitle, ratingMessage, "View Profile");
            (0, utils_1.createNotification)(participant.id, "tournament", "🏆 Tournament Complete!", participationMessage, "View Results");
            if (!participant.is_rated) {
                yield (0, db_1.default) `
        UPDATE users
        SET is_rated = true
        WHERE id = ${participant.id}
        `;
                (0, utils_1.createNotification)(participant.id, "tournament", "Your games are now rated! 🎉", "Your performance in this tournament has unlocked the ability for your games to be rated. Climb the leaderboard and show off your skills!", "View Leaderboard");
            }
            // update tournaments played for each participant
            yield (0, db_1.default) `
        UPDATE users
        SET tournaments_played = tournaments_played + 1
        WHERE id = ${participant.id}
      `;
            // update tournaments won for the winner
            if (participant.id === firstPlace.id) {
                yield (0, db_1.default) `
          UPDATE users
          SET tournaments_won = tournaments_won + 1
          WHERE id = ${participant.id}
        `;
            }
        }
        (0, utils_1.createNotification)(firstPlace.id, "tournament", "Spar Weekend Tournament Champion 🏆", winnerMessage, "Claim Prize");
        (0, utils_1.createNotification)(secondPlace.id, "tournament", "Spar Weekend Tournament Runner-Up 🥈", runnerUpMessage, "Claim Prize");
        (0, utils_1.createNotification)(thirdPlace.id, "tournament", "Spar Weekend Tournament Top 3 Finish 🥉", thirdPlaceMessage, "Claim Prize");
        (0, utils_1.createNotification)(firstPlace.id, "reward", "🥇 Gold Medal Awarded!", "You conquered every round and claimed 1st Place. This tournament belongs to you. A true Spar Champion.🥇 Medal added to your profile.", "Claim Prize");
        (0, utils_1.createNotification)(secondPlace.id, "reward", "🥈 Silver Medal Awarded!", "You fought your way to the Final and secured 2nd Place. An impressive feat among fierce competition. 🥈 Medal added to your profile.", "Claim Prize");
        (0, utils_1.createNotification)(thirdPlace.id, "reward", "🥉 Bronze Medal Awarded!", "You battled through tough matches and earned 3rd Place. A podium finish to be proud of! 🥉 Medal added to your profile.", "Claim Prize");
        // createNotification(
        //   firstPlace.id,
        //   "reward",
        //   "💰 Cash Prize Won!",
        //   cashPrizeMessage,
        //   "View Leaderboard"
        // );
        // update medals for top 3 winners
        // wrap in sql trasaction to ensure all medal updates are successful, if any of them fail, the transaction will be rolled back and no medals will be updated
        yield db_1.default.transaction((sql) => [
            sql `
      UPDATE users
      SET gold_medals = gold_medals + 1
      WHERE id = ${firstPlace.id}
    `,
            sql `
      UPDATE users
      SET silver_medals = silver_medals + 1
      WHERE id = ${secondPlace.id}
    `,
            sql `
      UPDATE users
      SET bronze_medals = bronze_medals + 1
      WHERE id = ${thirdPlace.id}
    `,
        ]);
        // create next tournament for the next week with the same date and time (7days later) and same game, and same tournament type, and same max participants, and same entry fee, and same prize pool, and same is_rated, and same is_private, and same is_invite_only, and same is_team_tournament, and same team_size, and same team_score_type, and same team_score_limit, and same team_score_increment, and same team_score_decrement, and same team_score_reset_on_win, and same team_score_reset_on_loss, and same team_score_reset_on_draw, and same team_score_reset_on_forfeit, and same team_score_reset_on_disconnect, and same team_score_reset_on_timeout, and same team_score_reset_on_abandonment
        yield createNextTournamentForNextWeek(tournamentId);
    }
    else {
        // if not last round and all matches are not yet completed
    }
});
exports.advanceSingleEliminationTournamentToNextRound = advanceSingleEliminationTournamentToNextRound;
const createNextTournamentForNextWeek = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const tournament = yield (0, db_1.default) `SELECT * FROM tournaments WHERE id = ${tournamentId}`;
    const newTournamentStartDate = new Date(tournament[0].start_date);
    const newTournamentRegistrationClosingDate = new Date(tournament[0].registration_closing_date);
    newTournamentStartDate.setDate(newTournamentStartDate.getDate() + 7); // add 7 days
    newTournamentRegistrationClosingDate.setDate(newTournamentRegistrationClosingDate.getDate() + 7); // add 7 days
    yield (0, db_1.default) `INSERT INTO tournaments (name, description, start_date, format, prize, is_featured, registration_fee, registration_closing_date, difficulty)
    VALUES (${tournament[0].name}, ${tournament[0].description}, ${newTournamentStartDate}, ${tournament[0].format}, ${tournament[0].prize}, ${tournament[0].is_featured}, ${tournament[0].registration_fee}, ${newTournamentRegistrationClosingDate}, ${tournament[0].difficulty})
  `;
});
const getSingleEliminationTournamentWinners = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const winners = yield (0, db_1.default) `SELECT
  u.id,
  u.username as name,
  u.image_url,
  COALESCE(COUNT(tm.id),0) AS wins
FROM tournament_participants tp
JOIN users u
  ON u.id = tp.user_id
LEFT JOIN tournament_matches tm
  ON tm.tournament_id = tp.tournament_id
  AND tm.winner_id = u.id
WHERE tp.tournament_id = ${tournamentId}
GROUP BY u.id, u.username, u.image_url
ORDER BY wins DESC LIMIT 3`;
    return winners;
});
const getSwissTournamentWinners = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const winners = yield (0, db_1.default) `SELECT u.id, u.username as name, u.image_url, tp.score FROM users u JOIN tournament_participants tp ON u.id = tp.user_id WHERE tp.tournament_id = ${tournamentId} ORDER BY tp.score DESC, tp.buchholz_score DESC, tp.sonneborn_berger_score DESC, u.rating DESC LIMIT 3`;
    return winners;
});
const getRatingChangeForTournament = (userId, tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    let ratingChange = 0;
    const ratingChanges = yield (0, db_1.default) `SELECT
   rating_change
   FROM rating_changes
   WHERE user_id = ${userId} AND tournament_id = ${tournamentId}
  `;
    console.log("rating_changes", ratingChanges);
    for (let ratingChangeData of ratingChanges) {
        ratingChange += ratingChangeData.rating_change;
    }
    return ratingChange;
});
// get the winner in a single elimination tournament
const getSingleEliminationTournamentWinner = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const winner = yield (0, db_1.default) `
      SELECT user_id
      FROM tournament_participants
      WHERE tournament_id = ${tournamentId} AND status = 'qualified'
      LIMIT 1
  `;
    return winner[0];
});
exports.getSingleEliminationTournamentWinner = getSingleEliminationTournamentWinner;
// get all matches with status inprogress in a single elimination tournament
const getSingleElimationTournamentOngoingMatches = (tournamentId, currentRoundNumber) => __awaiter(void 0, void 0, void 0, function* () {
    const ongoingMatches = yield (0, db_1.default) `
  SELECT tm.id
  FROM tournament_matches tm
  JOIN tournament_rounds tr ON tm.round_id = tr.id
  WHERE tm.tournament_id = ${tournamentId}
  AND tr.round_number = ${currentRoundNumber}
  AND tm.status IN ('in_progress', 'pending')
`;
    return ongoingMatches;
});
exports.getSingleElimationTournamentOngoingMatches = getSingleElimationTournamentOngoingMatches;
const getSingleEliminationTournamentMatches = (tournamentId, currentRoundNumber) => __awaiter(void 0, void 0, void 0, function* () {
    const matches = yield (0, db_1.default) `
  SELECT id, winner_id, player1_id, player2_id
  FROM tournament_matches
  WHERE tournament_id = ${tournamentId}
  AND round_id = (SELECT id FROM tournament_rounds WHERE tournament_id = ${tournamentId} AND round_number = ${currentRoundNumber})
`;
    return matches;
});
exports.getSingleEliminationTournamentMatches = getSingleEliminationTournamentMatches;
const getSwissTournamentStandings = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
    const standings = yield (0, db_1.default) `SELECT u.id, u.username, u.image_url, tp.score, tp.losses, tp.status, tp.buchholz_score, tp.sonneborn_berger_score, u.rating FROM users u JOIN tournament_participants tp ON u.id = tp.user_id WHERE tp.tournament_id = ${tournamentId} ORDER BY tp.score DESC, tp.buchholz_score DESC, tp.sonneborn_berger_score DESC, u.rating DESC`;
    return standings;
});
exports.getSwissTournamentStandings = getSwissTournamentStandings;
const getSingleEliminationTournamentStandings = (tournamentId, tournamentStatus) => __awaiter(void 0, void 0, void 0, function* () {
    let standings = [];
    if (tournamentStatus === "completed") {
        standings = yield (0, db_1.default) `SELECT
    u.id,
    u.username,
    u.image_url,
    u.rating,
    tp.status,
    COALESCE(COUNT(tm.id),0) AS num_wins
  FROM tournament_participants tp
  JOIN users u
    ON u.id = tp.user_id
  LEFT JOIN tournament_matches tm
    ON tm.tournament_id = tp.tournament_id
    AND tm.winner_id = u.id
  WHERE tp.tournament_id = ${tournamentId}
  GROUP BY u.id, u.username, u.image_url, tp.status
  ORDER BY num_wins DESC, u.rating DESC`;
    }
    return standings;
});
exports.getSingleEliminationTournamentStandings = getSingleEliminationTournamentStandings;
