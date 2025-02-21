"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const resend_1 = require("resend");
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const http_1 = __importDefault(require("http"));
const auth_1 = __importDefault(require("./routes/auth"));
const game_1 = __importDefault(require("./routes/game"));
const friends_1 = __importDefault(require("./routes/friends"));
const errorHandler_1 = __importDefault(require("./middlewares/errorHandler"));
const users_1 = __importDefault(require("./routes/users"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
const resend = new resend_1.Resend(process.env.RESEND_API_KEY);
let games = new Map();
const playCard = (playerId, card) => {
};
//Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: false }));
app.use('/api/auth', auth_1.default);
app.use('/api/game', game_1.default);
app.use('/api/friends', friends_1.default);
app.use('/api/users', users_1.default);
//app.use(notFoundMiddleware);
app.use(errorHandler_1.default);
// Websocket's connection to the server to allow bidirectional communication
const serverSocket = new socket_io_1.Server(server, {
    cors: {
        origin: "http://localhost:5173",
        methods: ["GET", "POST"]
    }
});
const port = process.env.PORT || 5000;
app.get('/', (req, res) => {
    resend.emails.send({
        from: 'onboarding@resend.dev',
        to: 'azagojunior2@gmail.com',
        //replyTo:'onboarding@resend.dev',
        subject: 'Test email',
        html: '<p> Congrats on sending your <strong>first email</strong>!</p>',
    }).then((response) => {
        console.log(response);
    }).catch((error) => {
        console.log(error);
    });
    res.send("Express + Typescript Server");
});
server.listen(port, () => {
    console.log(`[server]: Server is running at http://localhost:${port}`);
});
// Websockets connection and all websockets event related logic
serverSocket.on('connection', (socket) => {
    console.log(`Connection established with ${socket.id}`);
    socket.emit('message', 'Hello there welcome');
    socket.on('create_game', () => {
    });
    socket.on('join_game', () => {
    });
    socket.on('play_card', () => {
    });
    socket.on('get_game_state', () => {
    });
    socket.on('disconnect', () => {
    });
});
