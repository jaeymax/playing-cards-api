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
exports.initializeSocketHandler = exports.userSocketMap = void 0;
const db_1 = __importDefault(require("./config/db"));
const index_1 = require("./index");
const gameFunctions_1 = require("./utils/gameFunctions");
const gameFunctions_2 = require("./utils/gameFunctions");
const gameFunctions_3 = require("./utils/gameFunctions");
exports.userSocketMap = new Map();
const initializeSocketHandler = (serverSocket) => {
    serverSocket.on("connection", (socket) => {
        const userId = socket.handshake.auth.userId;
        if (!userId) {
            socket.disconnect(true);
            return;
        }
        console.log(`User connected: ${userId} (socket ${socket.id})`);
        exports.userSocketMap.set(userId, socket.id);
        socket.on("message", (message) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`Message received: ${message}`);
            //store the message in global_chat_messages table
            try {
                yield (0, db_1.default) `insert into global_chat_messages (user_id, message) values (${message.sender_id}, ${message.text})`;
            }
            catch (error) {
                console.error("Error storing message:", error.message);
            }
            // Broadcast the message to all clients except the sender
            serverSocket.emit("message", message);
        }));
        socket.on("dealCards", (code) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`Deal cards request for game code: ${code}`);
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(code);
                (0, gameFunctions_1.dealCards)(game);
                serverSocket.to(code).emit("dealtCards", game === null || game === void 0 ? void 0 : game.cards);
                serverSocket.to(code).emit("updatedGameData", game);
                yield (0, gameFunctions_1.saveGame)(code, game);
            }
            else {
                socket.emit("game-not-found");
            }
        }));
        socket.on("shuffleDeck", (code) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`Shuffle deck request for game code: ${code}`);
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(code);
                (0, gameFunctions_1.shuffleDeck)(game);
                serverSocket.to(code).emit("shuffledDeck", game === null || game === void 0 ? void 0 : game.cards);
                yield (0, gameFunctions_1.saveGame)(code, game);
            }
            else {
                socket.emit("game-not-found");
            }
        }));
        socket.on("playCard", (_a) => __awaiter(void 0, [_a], void 0, function* ({ game_code, card_id, player_id }) {
            console.log("Playing card...", game_code, card_id, player_id);
            if (yield (0, gameFunctions_2.gameExists)(game_code)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(game_code);
                (0, gameFunctions_1.playCard)(game, card_id, player_id, socket);
                yield (0, gameFunctions_1.saveGame)(game_code, game);
            }
            else {
                socket.emit("game-not-found");
            }
        }));
        socket.on("readyForNextHand", (_a) => __awaiter(void 0, [_a], void 0, function* ({ code, winningPlayer }) {
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(code);
                game.current_player_position = (winningPlayer.position + 1) % game.player_count;
                game.status = "in_progress";
                game.started_at = new Date().toISOString();
                game.round_number = 1;
                game.current_hand_number++;
                game.current_trick = null;
                game.completed_tricks = [];
                // set winning player to dealer
                let next_dealer = game.players.find((player) => player.id == winningPlayer.id);
                game.players.forEach((player) => player.is_dealer = false);
                if (next_dealer) {
                    next_dealer.is_dealer = true;
                }
                // reset game cards
                game.cards.forEach((card) => {
                    card.hand_position = -1;
                    card.player_id = 0;
                    card.status = 'in_deck';
                });
                yield (0, gameFunctions_1.saveGame)(code, game);
                serverSocket.to(code).emit('startNewHand', game);
            }
            else {
                socket.emit("game-not-found");
            }
        }));
        socket.on("rematch", (_a) => __awaiter(void 0, [_a], void 0, function* ({ code, winningPlayer }) {
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(code);
                console.log('winningPlayer', winningPlayer);
                game.current_player_position = (winningPlayer.position + 1) % game.player_count;
                game.status = "in_progress";
                game.started_at = new Date().toISOString();
                game.round_number = 1;
                game.current_hand_number = 1;
                game.current_trick = null;
                game.completed_tricks = [];
                // set winning player to dealer
                let next_dealer = game.players.find((player) => player.id == winningPlayer.id);
                game.players.forEach((player) => player.is_dealer = false);
                game.players.forEach((player) => player.score = 0);
                if (next_dealer) {
                    next_dealer.is_dealer = true;
                }
                // reset game cards
                game.cards.forEach((card) => {
                    card.hand_position = -1;
                    card.player_id = 0;
                    card.status = 'in_deck';
                });
                yield (0, gameFunctions_1.saveGame)(code, game);
                serverSocket.to(code).emit('rematch', game);
            }
            else {
                socket.emit("game-not-found");
            }
        }));
        socket.on("join-room", (code) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`User ${userId} joining game: ${code}`);
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                socket.join(code);
                serverSocket.to(code).emit("userJoined", { userId, code });
            }
        }));
        socket.on("playerJoin", (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, gameCode }) {
            var _b, _c;
            console.log(`User ${userId} joining game: ${gameCode}`);
            if (yield (0, gameFunctions_2.gameExists)(gameCode)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(gameCode);
                const userAlreadyJoined = game.players.find(((player) => player.user.id === userId));
                console.log(`${(_b = serverSocket.sockets.adapter.rooms.get(gameCode)) === null || _b === void 0 ? void 0 : _b.size} players connected`);
                if (userAlreadyJoined) {
                    socket.join(gameCode);
                    console.log('userAlreadyJoined', (_c = userAlreadyJoined === null || userAlreadyJoined === void 0 ? void 0 : userAlreadyJoined.user) === null || _c === void 0 ? void 0 : _c.username);
                    return;
                }
                if (game.players.length == game.player_count) {
                    console.log(`Room ${game.code} is full`);
                    return;
                }
                const player = yield (0, gameFunctions_1.createGamePlayer)(game.id, userId, game.players.length);
                if (player) {
                    game.players.push(player);
                    yield (0, gameFunctions_1.saveGame)(gameCode, game);
                    serverSocket.to(gameCode).emit('gameData', game);
                }
            }
        }));
        socket.on("leave-room", (code) => __awaiter(void 0, void 0, void 0, function* () {
            console.log(`User ${userId} leaving game: ${code}`);
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                socket.leave(code);
                serverSocket.to(code).emit("userLeft", { userId, code });
            }
        }));
        socket.on("getGameData", (code) => __awaiter(void 0, void 0, void 0, function* () {
            const game = yield (0, gameFunctions_3.getGameByCode)(code);
            if (game) {
                socket.emit("gameData", game);
            }
            else {
                socket.emit("game-not-found");
            }
        }));
        socket.on("join_queue", (data) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                yield index_1.matchmaker.addToQueue(data.userId, data.rating);
                socket.emit("queue_joined");
            }
            catch (error) {
                socket.emit("queue_error", { message: "Failed to join queue" });
            }
        }));
        socket.on("leave_queue", (data) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                console.log(data.userId, "leaving queue");
                yield index_1.matchmaker.removeFromQueue(data.userId);
                socket.emit("queue_left");
            }
            catch (error) {
                socket.emit("queue_error", { message: "Failed to leave queue" });
            }
        }));
        // game_chat_messages
        socket.on('sendMessage', (_a) => __awaiter(void 0, [_a], void 0, function* ({ game_code, user_id, avatar, username, message, timestamp }) {
            console.log(`Message received in game ${game_code} from user ${user_id}: ${message}`);
            //store the message in game_chat_messages table
            try {
                yield (0, db_1.default) `insert into game_chat_messages (game_code, user_id, username, message, created_at) values (${game_code}, ${user_id}, ${username}, ${message}, ${timestamp})`;
            }
            catch (error) {
                console.error("Error storing game message:", error.message);
            }
            // Broadcast the message to all clients in the game room
            socket.to(game_code).emit("chatMessage", { user_id, username, avatar, timestamp, message, game_code });
        }));
        socket.on("disconnect", () => {
            console.log(`User ${userId} disconnected`);
            exports.userSocketMap.delete(userId);
        });
    });
    // Handle match found events
    index_1.matchmaker.on("matchFound", ({ gameCode, gameId, players }) => {
        var _a;
        console.log('players', players);
        for (const player of players) {
            const socketId = exports.userSocketMap.get(player.id);
            if (socketId) {
                (_a = serverSocket.sockets.sockets.get(socketId)) === null || _a === void 0 ? void 0 : _a.join(gameCode);
            }
        }
        serverSocket.to(gameCode).emit("matchFound", {
            gameCode,
            gameId,
            players
        });
    });
    index_1.matchmaker.on("gameStarted", ({ gameCode }) => {
        console.log(`Game started with code: ${gameCode} has started`);
        serverSocket.to(gameCode).emit("gameStarted", { gameCode });
    });
};
exports.initializeSocketHandler = initializeSocketHandler;
