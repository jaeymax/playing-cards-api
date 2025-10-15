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
exports.gameExists = exports.hasSuit = exports.getNextPlayerPosition = exports.getPlayerHand = exports.playCard = exports.shuffleDeck = exports.dealCards = exports.getDealingSequence = void 0;
exports.saveGame = saveGame;
exports.getGameByCode = getGameByCode;
exports.createGamePlayer = createGamePlayer;
const db_1 = __importDefault(require("../config/db"));
const index_1 = require("../index");
const index_2 = require("../index");
const rating_1 = require("../utils/rating");
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
});
exports.dealCards = dealCards;
const shuffleDeck = (game) => __awaiter(void 0, void 0, void 0, function* () {
    game.cards.forEach((card) => {
        card.player_id = 0; // Reset player_id for shuffling
        card.status = "in_deck";
        card.hand_position = -1;
        card.animation_state = "shuffling";
    });
    game.cards.sort(() => Math.random() - 0.5);
    console.log("shuffled deck");
});
exports.shuffleDeck = shuffleDeck;
const playCard = (game, card_id, player_id, socket) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
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
    // Move to next player or complete trick if needed
    if (game.current_trick.cards.length === game.players.length) {
        completeTrick(game);
    }
    else {
        (0, exports.getNextPlayerPosition)(game);
    }
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
        leading_suit: "",
        leader_position: 0,
    };
    game.current_player_position = current_trick.leader_position;
    game.round_number++;
});
const endGame = (game) => __awaiter(void 0, void 0, void 0, function* () {
    const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
    const winning_card = final_trick.cards.find((card) => card.player_position === final_trick.leader_position);
    let points = 1;
    game.status = "ended";
    game.ended_at = new Date();
    index_1.mixpanel.track("game_completed", {
        distinct_id: game.id,
        game_code: game.code,
        num_players: game.players.length,
    });
    if (winning_card.card.rank == "6" || winning_card.card.rank == "7") {
        points = calculateSpecialPoints(game.completed_tricks, game.completed_tricks.length - 1, "");
    }
    const winner = game.players.find((player) => player.position === final_trick.leader_position);
    winner.score += points;
    if (winner.score >= game.win_points) {
        // new line to increment games_won
        winner.games_won += 1;
        setTimeout(() => {
            index_2.serverSocket.to(game.code).emit("gameOver", {
                winner: Object.assign(Object.assign({}, winner), { points, hand_number: game.current_hand_number }),
            });
        }, 1000);
        // Update game status
        yield (0, db_1.default) `UPDATE games SET status = 'completed', ended_at = NOW() WHERE id = ${game.id}`;
        // Update all players scores and games_played in the database
        for (const player of game.players) {
            yield (0, db_1.default) `
        UPDATE game_players 
        SET score = ${player.score}
        WHERE game_id = ${game.id} AND user_id = ${player.user.id}
      `;
            // update games_played for each user
            yield (0, db_1.default) `
        UPDATE users 
        SET games_played = games_played + 1
        WHERE id = ${player.user.id}
      `;
        }
        // Update user's game_wons count
        yield (0, db_1.default) `
      UPDATE users 
      SET games_won = games_won + 1
      WHERE id = ${winner.user.id}
    `;
        if (game.is_rated) {
            //update ratings
            const players = (0, rating_1.updateRatings)(game.players, winner.user.id);
            for (let player of players) {
                yield (0, db_1.default) `UPDATE users SET rating = ${player.user.rating} WHERE id = ${player.user.id}`;
            }
        }
    }
    else {
        setTimeout(() => {
            index_2.serverSocket.to(game.code).emit("gameEnded", {
                winner: Object.assign(Object.assign({}, winner), { points, hand_number: game.current_hand_number }),
            });
        }, 1000);
    }
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
const calculateSpecialPoints = (completed_tricks, trick_number, next_card_suit) => {
    if (trick_number <= 0)
        return 0;
    const trick = completed_tricks[trick_number];
    const winning_card = trick.cards.find((card) => card.player_position === trick.leader_position);
    const winning_card_suit = getSuit(winning_card);
    const winning_card_rank = getRank(winning_card);
    if (winning_card_suit === next_card_suit) {
        return 0;
    }
    if (winning_card_rank == "6")
        return (3 +
            calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit));
    if (winning_card_rank == "7")
        return (2 +
            calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit));
    return 0;
};
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
