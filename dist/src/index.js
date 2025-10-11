"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.matchmaker = exports.serverSocket = exports.games = exports.redis = exports.resend = exports.app = exports.mixpanel = void 0;
const express_1 = __importDefault(require("express"));
const resend_1 = require("resend");
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const auth_1 = __importDefault(require("./routes/auth"));
const game_1 = __importDefault(require("./routes/game"));
const friends_1 = __importDefault(require("./routes/friends"));
const errorHandler_1 = __importDefault(require("./middlewares/errorHandler"));
//import notFoundMiddleware from './middlewares/notFoundMiddleware';
const users_1 = __importDefault(require("./routes/users"));
const messages_1 = __importDefault(require("./routes/messages"));
const cards_1 = __importDefault(require("./routes/cards"));
const matchmaking_1 = __importDefault(require("./routes/matchmaking"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const matchhistory_1 = __importDefault(require("./routes/matchhistory"));
const profile_1 = __importDefault(require("./routes/profile"));
const matchmaking_2 = __importDefault(require("./services/matchmaking"));
const socketHandler_1 = require("./socketHandler");
const ioredis_1 = __importDefault(require("ioredis"));
const mixpanel_1 = __importDefault(require("mixpanel"));
exports.mixpanel = mixpanel_1.default.init(process.env.MIXPANEL_TOKEN);
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const server = http_1.default.createServer(exports.app);
exports.resend = new resend_1.Resend(process.env.RESEND_API_KEY);
exports.redis = new ioredis_1.default(process.env.REDIS_URL);
exports.games = new Map();
//Middlewares
exports.app.use((0, cors_1.default)());
exports.app.use(express_1.default.json());
exports.app.use(express_1.default.urlencoded({ extended: false }));
exports.app.use((0, cookie_parser_1.default)());
exports.app.use("/api/auth", auth_1.default);
exports.app.use("/api/games", game_1.default);
exports.app.use("/api/friends", friends_1.default);
exports.app.use("/api/users", users_1.default);
exports.app.use("/api/messages", messages_1.default);
exports.app.use("/api/cards", cards_1.default);
exports.app.use("/api/matchmaking", matchmaking_1.default);
exports.app.use("/api/matchhistory", matchhistory_1.default);
exports.app.use("/api/leaderboard", leaderboard_1.default);
exports.app.use("/api/profile", profile_1.default);
exports.app.use(errorHandler_1.default);
// Websocket's connection to the server to allow bidirectional communication
exports.serverSocket = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
exports.matchmaker = new matchmaking_2.default();
(0, socketHandler_1.initializeSocketHandler)(exports.serverSocket);
// Cleanup on server shutdown
process.on("SIGTERM", () => {
    exports.matchmaker.stop();
    // ...existing cleanup code..
});
