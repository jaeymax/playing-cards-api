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
exports.gameExists = exports.getSingleEliminationTournamentLobbyData = exports.hasSuit = exports.getNextPlayerPosition = exports.getPlayerHand = exports.playCard = exports.shuffleDeck = exports.fisherYatesShuffle = exports.dealCards = exports.getDealingSequence = void 0;
exports.saveGame = saveGame;
exports.getGameByCode = getGameByCode;
exports.createGamePlayer = createGamePlayer;
const db_1 = __importDefault(require("../config/db"));
const index_1 = require("../index");
const index_2 = require("../index");
const rating_1 = require("./rating");
const tournament_1 = require("./tournament");
const utils_1 = require("../utils");
const getDealingSequence = (game) => {
    var _a;
    const dealingSequence = [];
    const dealerPosition = (_a = game.players.find((player) => player.is_dealer == true)) === null || _a === void 0 ? void 0 : _a.position;
    let currentPlayerPosition = dealerPosition;
    while (true) {
        let nextPlayerPosition = (currentPlayerPosition + 1) % game.player_count;
        const player = game.players.find((player) => player.position == nextPlayerPosition).id;
        dealingSequence.push(player);
        currentPlayerPosition = nextPlayerPosition;
        if (nextPlayerPosition == dealerPosition)
            break;
    }
    return dealingSequence;
};
exports.getDealingSequence = getDealingSequence;
const dealCards = (game) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const gamePlayers = (0, exports.getDealingSequence)(game);
    console.log("dealing_sequence", (0, exports.getDealingSequence)(game));
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
        remainingCards.forEach((card) => {
            var _a;
            card.player_id =
                ((_a = game.players.find((player) => player.is_dealer)) === null || _a === void 0 ? void 0 : _a.id) || 0; // Assign to dealer (first player)
            card.status = "in_drawpile"; // Set status to in_drawpile
            // card.hand_position = -1;
            card.animation_state = "idle";
        });
    }
    game.turn_started_at = Date.now();
    game.turn_ends_at = game.turn_started_at + game.turn_timeout_seconds * 1000;
    game.current_player_position =
        (game.current_player_position + 1) % game.player_count;
    game.current_turn_user_id = (_b = (_a = game.players.find((player) => player.position == game.current_player_position)) === null || _a === void 0 ? void 0 : _a.user) === null || _b === void 0 ? void 0 : _b.id;
    if (game.is_rated) {
        yield index_1.matchForfeiter.scheduleForfeit(game.code, game.turn_timeout_seconds * 1000);
    }
});
exports.dealCards = dealCards;
const fisherYatesShuffle = (array) => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
};
exports.fisherYatesShuffle = fisherYatesShuffle;
const shuffleDeck = (game) => __awaiter(void 0, void 0, void 0, function* () {
    game.cards.forEach((card) => {
        card.player_id = 0; // Reset player_id for shuffling
        card.status = "in_deck";
        card.hand_position = -1;
        card.animation_state = "shuffling";
    });
    (0, exports.fisherYatesShuffle)(game.cards);
    console.log("shuffled deck");
});
exports.shuffleDeck = shuffleDeck;
const playCard = (game, card_id, player_id, socket) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const player = game.players.find((player) => player.id === player_id);
    if (player.position !== game.current_player_position) {
        console.log(`${player.user.username} it is not your turn to play`);
        socket.emit("gameMessage", "It's not your turn to play");
        return;
    }
    const played_card = game.cards.find((card) => card.id === card_id);
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
    const player_hand = (0, exports.getPlayerHand)(game, player_id);
    const card = player_hand.find((card) => card.id === card_id);
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
    }
    else {
        const leading_suit = game.current_trick.leading_suit;
        if ((0, exports.hasSuit)(player_hand, leading_suit) && getSuit(card) != leading_suit) {
            socket.emit("gameMessage", `The leading suit of the current trick is ${leading_suit.toLowerCase()}, you have a ${leading_suit
                .toLowerCase()
                .slice(0, -1)} you must follow suit`);
            return;
        }
    }
    played_card.status = "played";
    played_card.trick_number = game.round_number;
    game.current_trick.cards.push(Object.assign(Object.assign({}, card), { player_position: player.position }));
    if (isHigherCard(card, game.current_trick)) {
        game.current_trick.leader_position = player.position;
    }
    console.log(`Room ${game.code} has ${(_a = index_2.serverSocket.sockets.adapter.rooms.get(game.code)) === null || _a === void 0 ? void 0 : _a.size} players connected`);
    index_2.serverSocket.to(game.code).emit("playedCard", {
        card_id,
        player_id,
        trick_number: game.round_number,
    });
    game.turn_started_at = Date.now();
    const turn_ends_at = game.turn_started_at + game.turn_timeout_seconds * 1000;
    game.turn_ends_at = turn_ends_at;
    if (game.is_rated) {
        yield index_1.matchForfeiter.scheduleForfeit(game.code, game.turn_timeout_seconds * 1000);
    }
    if (game.current_trick.cards.length === game.players.length) {
        completeTrick(game);
    }
    else {
        (0, exports.getNextPlayerPosition)(game);
    }
    const before_player = (_b = game.players.find((p) => p.user.id == game.current_turn_user_id)) === null || _b === void 0 ? void 0 : _b.user.username;
    const current_turn_user_id = (_c = game.players.find((p) => p.position === game.current_player_position)) === null || _c === void 0 ? void 0 : _c.user.id;
    game.current_turn_user_id = current_turn_user_id;
    const after_player = game.players.find((p) => p.user.id == game.current_turn_user_id).user.username;
    yield saveGame(game.code, game);
    index_2.serverSocket.to(game.code).emit("updatedGameData", game);
});
exports.playCard = playCard;
const isHigherCard = (card, current_trick) => {
    if (current_trick.cards.length === 0) {
        return true;
    }
    const leading_suit = current_trick.leading_suit;
    const current_card_suit = getSuit(card);
    if (current_card_suit !== leading_suit)
        return false;
    const current_winning_card = current_trick.cards.find((card) => card.player_position === current_trick.leader_position);
    const current_winning_card_value = getCardValue(current_winning_card);
    const card_value = getCardValue(card);
    return card_value > current_winning_card_value;
};
const completeTrick = (game) => __awaiter(void 0, void 0, void 0, function* () {
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
});
const endGame = (game) => __awaiter(void 0, void 0, void 0, function* () {
    const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
    const winning_card = final_trick.cards.find((card) => card.player_position === final_trick.leader_position);
    let points = 1;
    //game.status = "ended";
    //game.ended_at = new Date();
    index_1.mixpanel.track("game_completed", {
        distinct_id: game.id,
        game_code: game.code,
        num_players: game.players.length,
    });
    if (winning_card.card.rank == "6" || winning_card.card.rank == "7") {
        points = calculateSpecialPoints(game.completed_tricks, game.completed_tricks.length - 1, "", game.completed_tricks.length - 1);
    }
    const winner = (0, utils_1.getMatchWinner)(game);
    const loser = (0, utils_1.getMatchLoser)(game);
    winner.score += points;
    const tournament = yield (0, utils_1.isTournamentMatch)(game.id);
    yield (0, utils_1.updateGamePlayersScores)(game);
    if (winner.score >= game.win_points) {
        game.status = "completed";
        game.ended_at = Date.now();
        if (game.is_rated)
            yield index_1.matchForfeiter.cancelForfeit(game.code);
        winner.games_won += 1;
        setTimeout(() => {
            index_2.serverSocket.to(game.code).emit("gameOver", {
                winner: Object.assign(Object.assign({}, winner), { points, hand_number: game.current_hand_number }),
            });
        }, 1000);
        yield (0, utils_1.markGameAsEndedAndCompleted)(game.id);
        yield (0, utils_1.updateGamesPlayedForGamePlayers)(game.id);
        yield (0, utils_1.updateWinnerWonCount)(winner.user.id);
        yield (0, utils_1.updateLoserWinningStreak)(loser.user.id);
        yield saveGame(game.code, game);
        console.log("tournamentData", tournament);
        if (game.is_rated) {
            const tournament_id = yield (0, db_1.default) `
      SELECT tournament_id 
      FROM tournament_matches 
      WHERE game_id = ${game.id}
    `;
            //update ratings
            const players = (0, rating_1.updateRatings)(game.players, winner.user.id);
            for (let player of players) {
                const oldRating = yield (0, db_1.default) `SELECT rating from users WHERE id = ${player.user.id}`;
                const newRating = player.user.rating;
                console.log(`player ${player.user.username} old rating ${oldRating[0].rating} new rating ${newRating}`);
                yield (0, db_1.default) `UPDATE users SET rating = ${newRating} WHERE id = ${player.user.id}`;
                const ratingChange = newRating - oldRating[0].rating;
                // character suit there question //
                yield (0, db_1.default) `INSERT INTO rating_changes (user_id, tournament_id, rating_change) VALUES (${player.user.id}, ${tournament_id[0].tournament_id}, ${ratingChange})`;
            }
        }
        if (tournament) {
            console.log("this game is part of a tournament match, reporting result to tournament system");
            const tournamentFormat = tournament.format;
            console.log("tournamentFormat", tournamentFormat);
            if (tournamentFormat == "Single Elimination") {
                const loser = (0, utils_1.getMatchLoser)(game);
                yield (0, tournament_1.updateSingleEliminationMatchResults)(game.id, winner.user.id, loser.user.id, tournament.id);
                const lobbyData = yield (0, exports.getSingleEliminationTournamentLobbyData)(tournament.id);
                index_2.serverSocket
                    .to(`tournament_${tournament.id}`)
                    .emit("lobbyUpdate", lobbyData);
                yield (0, tournament_1.advanceSingleEliminationTournamentToNextRound)(tournament.id, tournament.current_round_number, index_2.serverSocket);
            }
            else if (tournamentFormat == "Swiss") {
                const loser = (0, utils_1.getMatchLoser)(game);
                yield (0, tournament_1.updateSwissMatchResults)(game.id, winner.user.id, loser.user.id, tournament.id);
                const lobbyData = yield (0, tournament_1.getSwissTournamentLobbyData)(tournament.id);
                index_2.serverSocket
                    .to(`tournament_${tournament.id}`)
                    .emit("lobbyUpdate", lobbyData);
                yield (0, tournament_1.advanceSwissTournamentToNextRound)(tournament.id, tournament.current_round_number, index_2.serverSocket);
            }
        }
    }
    else {
        yield saveGame(game.code, game);
        setTimeout(() => {
            index_2.serverSocket.to(game.code).emit("gameEnded", {
                winner: Object.assign(Object.assign({}, winner), { points, hand_number: game.current_hand_number }),
            });
        }, 1000);
        if (tournament) {
            const tournamentFormat = tournament.format;
            if (tournamentFormat == "Single Elimination") {
                const lobbyData = yield (0, exports.getSingleEliminationTournamentLobbyData)(tournament.id);
                index_2.serverSocket
                    .to(`tournament_${tournament.id}`)
                    .emit("lobbyUpdate", lobbyData);
            }
            else if (tournamentFormat == "Swiss") {
                const lobbyData = yield (0, tournament_1.getSwissTournamentLobbyData)(tournament.id);
                index_2.serverSocket
                    .to(`tournament_${tournament.id}`)
                    .emit("lobbyUpdate", lobbyData);
            }
        }
    }
    //await saveGame(game.code, game);
});
const allCardsPlayed = (game) => {
    const dealt_cards = game.cards.filter((card) => card.status !== "in_drawpile");
    return dealt_cards.every((card) => card.status === "played");
};
const getPlayerHand = (game, player_id) => {
    const hand = game.cards.filter((card) => card.player_id === player_id && card.status === "in_hand");
    return hand;
};
exports.getPlayerHand = getPlayerHand;
const getNextPlayerPosition = (game) => {
    game.current_player_position =
        (game.current_player_position + 1) % game.players.length;
    return game.current_player_position;
};
exports.getNextPlayerPosition = getNextPlayerPosition;
const hasSuit = (player_hand, suit) => {
    return player_hand.some((card) => getSuit(card) === suit);
};
exports.hasSuit = hasSuit;
const getSuit = (card) => {
    return card.card.suit;
};
const getRank = (card) => {
    return card.card.rank;
};
const getCardValue = (card) => {
    return card.card.value;
};
const calculateSpecialPoints = (completed_tricks, trick_number, next_card_suit, last_trick_index) => {
    if (trick_number <= 0)
        return 0;
    const trick = completed_tricks[trick_number];
    const winning_card = trick.cards.find((card) => card.player_position === trick.leader_position);
    const winning_card_suit = getSuit(winning_card);
    const winning_card_rank = getRank(winning_card);
    if (winning_card_suit === next_card_suit) {
        return 0;
    }
    if (winning_card_rank == "6") {
        return (3 +
            calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit, last_trick_index));
    }
    if (winning_card_rank == "7") {
        // check if the 7 was used to counter a six
        //  console.log("trick cards", trick.cards);
        let sameSuitCards = trick.cards.filter((card) => card.card.suit == trick.leading_suit);
        //console.log("same suit cards", sameSuitCards);
        let isaSix = sameSuitCards.find((card) => card.card.rank == "6");
        //console.log("isaSix", isaSix);
        if (isaSix) {
            let indexOfSix = trick.cards.findIndex((card) => card.card.rank == "6" && card.card.suit == trick.leading_suit);
            let indexOfSeven = trick.cards.findIndex((card) => card.card.rank == "7" && card.card.suit == trick.leading_suit);
            if (indexOfSeven < indexOfSix) {
                //console.log("the seven was played before the six");
                return (2 +
                    calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit, last_trick_index));
            }
            else {
                //  console.log("7 was used to counter a six");
                if (trick_number == last_trick_index)
                    return 1;
                return 0;
            }
        }
        // if the seven was used to counter a six?
        // if its the last trick card score only one point and return
        //  else it doesn't score so return zero
        return (2 +
            calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit, last_trick_index));
    }
    return 0;
};
const getSingleEliminationTournamentLobbyData = (tournamentId) => __awaiter(void 0, void 0, void 0, function* () {
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
     tp.status
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
    const standings = yield (0, tournament_1.getSingleEliminationTournamentStandings)(tournamentId, tournament[0].status);
    return {
        success: true,
        tournament: tournament[0],
        participants,
        rounds,
        standings,
    };
});
exports.getSingleEliminationTournamentLobbyData = getSingleEliminationTournamentLobbyData;
const gameExists = (gameCode) => __awaiter(void 0, void 0, void 0, function* () {
    const value = yield index_1.redis.exists(gameCode);
    return value === 1; // Redis returns 1 if the key exists, 0 if it does not
});
exports.gameExists = gameExists;
function saveGame(gameCode, gameData) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield index_1.redis.set(gameCode, JSON.stringify(gameData), "EX", 3600); // Set expiration time to 1 hour
        }
        catch (error) {
            console.error("Error saving game to Redis:", error);
        }
    });
}
function getGameByCode(gameCode) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const gameData = yield index_1.redis.get(gameCode);
            if (gameData) {
                return JSON.parse(gameData);
            }
            return null;
        }
        catch (error) {
            console.error("Error loading game from Redis:", error);
            return null;
        }
    });
}
function createGamePlayer(gameId, userId, position) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const player = yield (0, db_1.default) `INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
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
        }
        catch (error) {
            console.log("Failed to create game player", error);
            return null;
        }
    });
}
