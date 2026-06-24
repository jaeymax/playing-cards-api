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
exports.initializeSocketHandler = exports.onlineUsers = exports.userSocketMap = void 0;
const db_1 = __importDefault(require("./config/db"));
const index_1 = require("./index");
const gameFunctions_1 = require("./utils/gameFunctions");
const gameFunctions_2 = require("./utils/gameFunctions");
const gameFunctions_3 = require("./utils/gameFunctions");
exports.userSocketMap = new Map();
exports.onlineUsers = [];
function acquireLock(gameCode_1) {
    return __awaiter(this, arguments, void 0, function* (gameCode, timeout = 5000) {
        const lockKey = `lock:${gameCode}`;
        // NX: Only set if it doesn't exist | PX: Expire after X milliseconds (prevents deadlocks)
        const result = yield index_1.redis.set(lockKey, "locked", "EX", timeout, "NX");
        console.log("Lock result:", result);
        return result === "OK";
    });
}
function releaseLock(gameCode) {
    return __awaiter(this, void 0, void 0, function* () {
        yield index_1.redis.del(`lock:${gameCode}`);
    });
}
const initializeSocketHandler = (serverSocket) => {
    serverSocket.on("connection", (socket) => {
        const userId = socket.handshake.auth.userId;
        const username = socket.handshake.auth.username || "Unknown";
        if (!userId) {
            socket.disconnect(true);
            return;
        }
        //onlineUsers.push({ user_id: userId, username, socketId: socket.id, status:"Active" });
        console.log(`User connected: ${userId} (socket ${socket.id})`);
        exports.userSocketMap.set(userId, socket.id);
        // emit status change of online users to all clients
        //serverSocket.emit("onlineUsersStatusChanged", onlineUsers);
        // socket.on('getOnlineUsers', ()=>{
        //   console.log('Online users requested');
        //   socket.emit("onlineUsers", onlineUsers);
        // })
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
            try {
                const lockAcquired = yield acquireLock(code);
                if (!lockAcquired) {
                    console.log("Request blocked: Processing previous  move.");
                    return;
                }
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
            }
            catch (err) {
                console.error('Error in ShuffleDeck:', err);
            }
            finally {
                console.log("Releasing lock...");
                yield releaseLock(code);
                console.log('Lock Released');
            }
        }));
        socket.on("shuffleDeck", (code) => __awaiter(void 0, void 0, void 0, function* () {
            try {
                const lockAcquired = yield acquireLock(code);
                if (!lockAcquired) {
                    console.log("Request blocked: Processing previous  move.");
                    return;
                }
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
            }
            catch (err) {
                console.error('Error in ShuffleDeck:', err);
            }
            finally {
                console.log("Releasing lock...");
                yield releaseLock(code);
                console.log('Lock Released');
            }
        }));
        socket.on("playCard", (_a) => __awaiter(void 0, [_a], void 0, function* ({ game_code, card_id, player_id }) {
            try {
                const lockAcquired = yield acquireLock(game_code);
                if (!lockAcquired) {
                    console.log("Request blocked: Processing previous  move.");
                    return;
                }
                console.log("Playing card...", game_code, card_id, player_id);
                if (yield (0, gameFunctions_2.gameExists)(game_code)) {
                    const game = yield (0, gameFunctions_3.getGameByCode)(game_code);
                    (0, gameFunctions_1.playCard)(game, card_id, player_id, socket);
                    yield (0, gameFunctions_1.saveGame)(game_code, game);
                }
                else {
                    socket.emit("game-not-found");
                }
            }
            catch (error) {
                console.error("Error in playCard:", error);
            }
            finally {
                console.log("Releasing lock...");
                yield releaseLock(game_code);
                console.log('Lock Released');
            }
        }));
        socket.on("readyForNextHand", (_a) => __awaiter(void 0, [_a], void 0, function* ({ code, winningPlayer }) {
            var _b, _c;
            if (yield (0, gameFunctions_2.gameExists)(code)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(code);
                game.current_player_position = (winningPlayer.position);
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
                game.current_turn_user_id = (_c = (_b = game.players.find((player) => player.position == game.current_player_position)) === null || _b === void 0 ? void 0 : _b.user) === null || _c === void 0 ? void 0 : _c.id;
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
                game.current_player_position = winningPlayer.position;
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
                console.log('rematch', game.players);
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
        socket.on("joinTournamentRoom", (_a) => __awaiter(void 0, [_a], void 0, function* ({ tournamentId, userId, gameCode }) {
            console.log(`User ${userId} joining tournament room: ${tournamentId} with gamecode ${gameCode}`);
            socket.join(`tournament_${tournamentId}`);
            if (gameCode)
                socket.join(`lobby_game_room:${gameCode}`);
        }));
        socket.on("leaveTournamentRoom", (_a) => __awaiter(void 0, [_a], void 0, function* ({ tournamentId, userId, gameCode }) {
            console.log(`User ${userId} leaving tournament room: ${tournamentId} with gamecode ${gameCode}`);
            socket.leave(`tournament_${tournamentId}`);
            if (gameCode)
                socket.leave(`lobby_game_room:${gameCode}`);
        }));
        socket.on("playerJoin", (_a) => __awaiter(void 0, [_a], void 0, function* ({ userId, gameCode }) {
            var _b, _c;
            console.log(`User ${userId} joining game: ${gameCode}`);
            if (yield (0, gameFunctions_2.gameExists)(gameCode)) {
                const game = yield (0, gameFunctions_3.getGameByCode)(gameCode);
                if (game) {
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
            console.log('request for game data', code);
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
        socket.on('sendMessage', (_a) => __awaiter(void 0, [_a], void 0, function* ({ game_code, user_id, type, avatar, username, message, timestamp }) {
            console.log(`Message received in game ${game_code} from user ${user_id}: ${message}`);
            //store the message in game_chat_messages table
            try {
                yield (0, db_1.default) `insert into game_chat_messages (game_code, user_id, username, message, type, created_at) values (${game_code}, ${user_id}, ${username}, ${message}, ${type}, ${timestamp})`;
                yield (0, db_1.default) `insert into spectator_chat_messages (game_code, user_id, username, message, created_at) values (${game_code}, ${user_id}, ${username}, ${message}, ${timestamp})`;
            }
            catch (error) {
                console.error("Error storing game message:", error.message);
            }
            // Broadcast the message to all clients in the game room
            socket.to(game_code).emit("chatMessage", { user_id, type: "text", username, avatar, timestamp, message, game_code });
            socket.to(game_code).emit("spectatorChatMessage", { user_id, avatar, username, message, timestamp, game_code });
            console.log({ user_id, username, avatar, timestamp, message, game_code });
        }));
        // typing game_chat_messages
        socket.on('typingGameChat', (_a) => __awaiter(void 0, [_a], void 0, function* ({ game_code, user_id, username, avatar }) {
            socket.to(game_code).emit('typingGameChat', { user_id, username, avatar, game_code });
        }));
        socket.on("voiceMessage", (_a) => __awaiter(void 0, [_a], void 0, function* ({ user_id, username, avatar, mime_type, timestamp, audio, game_code }) {
            console.log(`Voice message received in game ${game_code} from user ${user_id}`);
            // Broadcast the voice message to all clients in the game room
            socket.to(game_code).emit("voiceMessage", { user_id, username, type: "audio", avatar, mime_type, timestamp, audio, game_code });
            console.log({ user_id, username, avatar, mime_type, timestamp, audio, game_code });
        }));
        socket.on("tournamentChatMessage", (_a) => __awaiter(void 0, [_a], void 0, function* ({ tournament_id, user_id, avatar, username, message, timestamp }) {
            console.log(`Message received in tournament ${tournament_id} from user ${user_id}: ${message}`);
            //store the message in tournament_chat_messages table
            try {
                yield (0, db_1.default) `insert into tournament_chat_messages (tournament_id, user_id, username, message, created_at) values (${tournament_id}, ${user_id}, ${username}, ${message}, ${timestamp})`;
            }
            catch (error) {
                console.error("Error storing tournament chat message:", error.message);
            }
            // Broadcast the message to all clients in the tournament room
            socket.to(`tournament_${tournament_id}`).emit("tournamentChatMessage", { user_id, avatar, username, message, timestamp, tournament_id });
            console.log({ user_id, avatar, username, message, timestamp, tournament_id });
        }));
        socket.on('typingTournamentChat', ({ tournament_id, user_id, avatar, username }) => {
            socket.to(`tournament_${tournament_id}`).emit('typingTournamentChat', { user_id, avatar, username, tournament_id });
        });
        // typing indicator for spectator chat
        socket.on('typingSpectatorChat', ({ game_code, user_id, avatar, username }) => {
            socket.to(game_code).emit('typingSpectatorChat', { user_id, avatar, username, game_code });
        });
        // spectator messages
        socket.on('spectatorChatMessage', (_a) => __awaiter(void 0, [_a], void 0, function* ({ game_code, avatar, user_id, username, message, timestamp }) {
            console.log(`Spectator message received in game ${game_code} from user ${user_id}: ${message}`);
            // Broadcast the spectator message to all clients in the game room
            socket.to(game_code).emit("spectatorChatMessage", { user_id, avatar, username, message, timestamp, game_code });
            socket.to(game_code).emit("chatMessage", { user_id, type: "text", username, avatar, timestamp, message, game_code });
            console.log({ user_id, avatar, username, message, timestamp, game_code });
            // store the spectator message in spectator_chat_messages table
            try {
                yield (0, db_1.default) `insert into game_chat_messages (game_code, user_id, username, message, type, created_at) values (${game_code}, ${user_id}, ${username}, ${message}, 'text', ${timestamp})`;
                yield (0, db_1.default) `insert into spectator_chat_messages (game_code, user_id, username, message, created_at) values (${game_code}, ${user_id}, ${username}, ${message}, ${timestamp})`;
            }
            catch (error) {
                console.error("Error storing spectator chat message:", error.message);
            }
        }));
        // spectator typing indicator
        socket.on('typingSpectatorChat', ({ game_code, user_id, username }) => {
            socket.to(game_code).emit('typingSpectatorChat', { user_id, username, game_code });
        });
        socket.on("disconnect", () => {
            console.log(`User ${userId} disconnected`);
            const index = exports.onlineUsers.findIndex((user) => user.user_id === userId);
            if (index !== -1) {
                exports.onlineUsers.splice(index, 1);
            }
            serverSocket.emit("onlineUsersStatusChanged", exports.onlineUsers);
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
