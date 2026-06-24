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
exports.matchForfeiter = exports.matchmaker = exports.FRONTEND_URL = exports.serverSocket = exports.redis = exports.resend = exports.app = exports.mixpanel = void 0;
const express_1 = __importDefault(require("express"));
const resend_1 = require("resend");
const dotenv_1 = __importDefault(require("dotenv"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const path_1 = __importDefault(require("path"));
const http_1 = __importDefault(require("http"));
const auth_1 = __importDefault(require("./routes/auth"));
const game_1 = __importDefault(require("./routes/game"));
const friends_1 = __importDefault(require("./routes/friends"));
const errorHandler_1 = __importDefault(require("./middlewares/errorHandler"));
//import notFoundMiddleware from './middlewares/notFoundMiddleware';
const client_s3_1 = require("@aws-sdk/client-s3");
const users_1 = __importDefault(require("./routes/users"));
const messages_1 = __importDefault(require("./routes/messages"));
const cards_1 = __importDefault(require("./routes/cards"));
const matchmaking_1 = __importDefault(require("./routes/matchmaking"));
const leaderboard_1 = __importDefault(require("./routes/leaderboard"));
const tournaments_1 = __importDefault(require("./routes/tournaments"));
const notifications_1 = __importDefault(require("./routes/notifications"));
const matchhistory_1 = __importDefault(require("./routes/matchhistory"));
const profile_1 = __importDefault(require("./routes/profile"));
const wallet_1 = __importDefault(require("./routes/wallet"));
const payout_1 = __importDefault(require("./routes/payout"));
const webhook_1 = __importDefault(require("./routes/webhook"));
const matchmaking_2 = __importDefault(require("./services/matchmaking"));
const socketHandler_1 = require("./socketHandler");
const ioredis_1 = __importDefault(require("ioredis"));
const db_1 = __importDefault(require("./config/db"));
const mixpanel_1 = __importDefault(require("mixpanel"));
const matchForfeiter_1 = __importDefault(require("./services/matchForfeiter"));
const perf_hooks_1 = require("perf_hooks");
//import { TwilioClient } from "./config/twilio";
const smsService_1 = require("./services/smsService");
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const tournament_1 = require("./services/tournament");
//import admin from "firebase-admin"
const cron = require("node-cron");
const admin = require("firebase-admin");
//console.log('admin', admin);
const h = (0, perf_hooks_1.monitorEventLoopDelay)();
h.enable();
let last = process.cpuUsage();
exports.mixpanel = mixpanel_1.default.init(process.env.MIXPANEL_TOKEN);
dotenv_1.default.config();
exports.app = (0, express_1.default)();
const serviceAccount = require(path_1.default.join(__dirname, "../private_keys/serviceAccountKey.json"));
// const options = {
//   key: fs.readFileSync("certs/192.168.43.218-key.pem"),
//   cert: fs.readFileSync("certs/192.168.43.218.pem"),
// }
console.log('test');
const redisConfig = {
    host: "127.0.0.1",
    port: 6379,
};
admin.initializeApp({
    credential: admin.cert(serviceAccount)
});
const testPushNotification = () => __awaiter(void 0, void 0, void 0, function* () {
    yield admin.messaging().send({
        token: "",
        notification: {
            title: "Spar Tournament",
            body: "Your match starts in 15 minutes"
        }
    });
});
const sendPushNotification = (token, title, body) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const message = {
            token: token,
            notification: {
                title: title,
                body: body,
            },
        };
        const response = yield admin.messaging().send(message);
        console.log("Successfully sent push notification:", response);
    }
    catch (error) {
        console.error("Error sending push notification:", error);
    }
});
// cron.schedule("* * * * *", async () => {
//   console.log('Checking tournaments...');
//   const now = new Date();
//   console.log('date', now.toISOString());
//   const bufferTime = 1 * 60 * 1000; // 1 minute buffer time
//   try{
//     const tournaments = await getAllUpcomingTournaments();
//     console.log('upcoming tournaments', tournaments);
//     for (const tournament of tournaments) {
//       const registrationCloseTime = new Date(tournament.registration_closing_date);
//       const startTime = new Date(tournament.start_date);
//       console.log(`Tournament ${tournament.name} - Registration Close: ${registrationCloseTime.toISOString()}, Start Time: ${startTime.toISOString()}`);
//       // add some buffer time to ensure registration is closed before starting the tournament
//       if (now.getTime() >= registrationCloseTime.getTime() + bufferTime && !tournament.registration_closed) {
//         console.log(`Closing registration for tournament ${tournament.name}`);
//         await closeTournamentRegistration(tournament.id);
//       }
//         if (now.getTime() >= startTime.getTime() && !tournament.started) {
//           console.log(`Starting tournament ${tournament.name}`);
//           await startTournament(tournament.id);
//         }
//     }
//   }catch(error){
//     console.error('Error checking tournaments:', error);
//   }
// });
cron.schedule("52 19 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Checking tournaments regsitration closure...');
    const now = new Date();
    console.log('date', now.toISOString());
    const bufferTime = 1 * 60 * 1000; // 1 minute buffer time
    try {
        const tournaments = yield (0, tournament_1.getAllUpcomingTournaments)();
        console.log('upcoming tournaments', tournaments);
        for (const tournament of tournaments) {
            const registrationCloseTime = new Date(tournament.registration_closing_date);
            const startTime = new Date(tournament.start_date);
            console.log(`Tournament ${tournament.name} - Registration Close: ${registrationCloseTime.toISOString()}, Start Time: ${startTime.toISOString()}`);
            // add some buffer time to ensure registration is closed before starting the tournament
            if (now.getTime() >= registrationCloseTime.getTime() + bufferTime && !tournament.registration_closed) {
                console.log(`Closing registration for tournament ${tournament.name}`);
                yield (0, tournament_1.closeTournamentRegistration)(tournament.id);
            }
        }
    }
    catch (error) {
        console.error('Error checking tournaments:', error);
    }
}));
cron.schedule("0 20 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Checking tournaments start times...');
    const now = new Date();
    console.log('date', now.toISOString());
    const bufferTime = 1 * 60 * 1000; // 1 minute buffer time
    try {
        const tournaments = yield (0, tournament_1.getAllUpcomingTournaments)();
        console.log('upcoming tournaments', tournaments);
        for (const tournament of tournaments) {
            const registrationCloseTime = new Date(tournament.registration_closing_date);
            const startTime = new Date(tournament.start_date);
            console.log(`Tournament ${tournament.name} - Registration Close: ${registrationCloseTime.toISOString()}, Start Time: ${startTime.toISOString()}`);
            if (now.getTime() >= startTime.getTime() && !tournament.started) {
                console.log(`Starting tournament ${tournament.name}`);
                yield (0, tournament_1.startTournament)(tournament.id);
            }
        }
    }
    catch (error) {
        console.error('Error checking tournaments:', error);
    }
}));
cron.schedule("30 18 * * *", () => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Checking if any tournaments is starting today and sending notifications...');
    const now = new Date();
    console.log('date', now.toISOString());
    const bufferTime = 1 * 60 * 1000; // 1 minute buffer time
    try {
        const tournaments = yield (0, tournament_1.getAllUpcomingTournaments)();
        console.log('upcoming tournaments', tournaments);
        for (const tournament of tournaments) {
            const startTime = new Date(tournament.start_date);
            // tournaments usually start at 8PM, so we check around 7:30PM to send notifications to users
            if (now.getDate() === startTime.getDate() && now.getMonth() === startTime.getMonth() && now.getFullYear() === startTime.getFullYear()) {
                console.log(`Sending notifications for tournament ${tournament.name} starting today`);
                // send notifications to users about the tournament starting today
                // you can implement a function to send notifications here, e.g. sendTournamentStartNotifications(tournament);
                sendTournamentStartNotifications(tournament);
            }
        }
    }
    catch (error) {
        console.error('Error checking tournaments:', error);
    }
}));
const sendTournamentStartNotifications = (tournament) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        // const testId = 48;
        const users = yield (0, db_1.default) `
        SELECT username, phone FROM users WHERE phone IS NOT NULL
    `;
        // if its friday then the cash prize is 30ghc, if its saturday then the cash prize is 90ghc with first position getting 60ghc and second position getting 30ghc, if its sunday then there is no cash prize you can customize the message based on the tournament details
        const tournamentDate = new Date(tournament.start_date);
        const dayOfWeek = tournamentDate.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday
        let prizeMessage = "";
        const entryMessage = Number(tournament.registration_fee) === 0
            ? "Free"
            : `GHS ${Number(tournament.registration_fee)}`;
        switch (dayOfWeek) {
            case 5: // Friday
                prizeMessage =
                    "💰 Prize Pool: GHS 30 winner-takes-all!";
                break;
            case 6: // Saturday
                prizeMessage =
                    "🏆 Prize Pool: GHS 90! 1st Place wins GHS 60 and 2nd Place wins GHS 30.";
                break;
            case 0: // Sunday
                prizeMessage =
                    "🎮 This is our free community tournament. No cash prizes, just fun, bragging rights, and a chance to sharpen your skills!";
                break;
            default:
                prizeMessage = "";
        }
        for (const user of users) {
            // const messageTemplate = `Hi ${user.username}! Just a reminder that the ${tournament.name} tournament starts today at ${new Date(tournament.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. Don't forget to join the lobby before the start time to avoid forfeiting. Register now on sparplay.com/tournaments/${tournament.id} if you haven't already!`;
            const messageTemplate = `Hi ${user.username}!

Just a reminder that the ${tournament.name} tournament starts today at ${tournamentDate.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            })}.

🎮 Format: ${tournament.format}
🎟️ Entry: ${entryMessage}

${prizeMessage}

Be sure to join the lobby before the start time to avoid forfeiting your spot.

Register now: sparplay.com/tournaments/${tournament.id} if you want to participate!`;
            const phone = "233" + user.phone.substr(1);
            console.log("realphone", phone);
            yield (0, smsService_1.sendSMS)(phone, messageTemplate);
        }
    }
    catch (error) {
        console.error("Error sending tournament start notifications:", error);
    }
});
const server = http_1.default.createServer(exports.app);
exports.resend = new resend_1.Resend(process.env.RESEND_API_KEY);
exports.redis = new ioredis_1.default(redisConfig);
exports.serverSocket = new socket_io_1.Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
exports.FRONTEND_URL = process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL_PROD
    : process.env.FRONTEND_URL_DEV;
//Middlewares
exports.app.use((0, cors_1.default)());
exports.app.use("/api/webhooks", webhook_1.default);
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
exports.app.use("/api/tournaments", tournaments_1.default);
exports.app.use("/api/notifications", notifications_1.default);
exports.app.use("/api/wallet", wallet_1.default);
exports.app.use("/api/payout-method", payout_1.default);
//app.use(notFoundMiddleware);
exports.app.post("/api/test-sms", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { phone } = req.body;
    yield (0, smsService_1.sendSMS)(phone, "Test SMS from SparPlay 🔥");
    res.json({ success: true });
})));
//test a push notification route
exports.app.post("/api/test-push-notification", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { token } = req.body;
    yield sendPushNotification(token, "Test Push Notification", "This is a test push notification from SparPlay 🔥");
    res.json({ success: true });
})));
exports.app.post("/api/send-tournament-notification", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tournamentName } = req.body;
    try {
        const users = yield (0, db_1.default) `
          SELECT username, phone FROM users WHERE phone IS NOT NULL
      `;
        for (const user of users) {
            const messageTemplate = `Hi ${user.username}!, Spar Weekend Championship kicks off Friday 7PM. Test your skills, compete with others and win ₵50 cash. Register now at https://sparplay.com`;
            const phone = "233" + user.phone.substr(1);
            console.log("realphone", phone);
            yield (0, smsService_1.sendSMS)(phone, messageTemplate);
        }
        res.json({
            success: true,
            message: "Tournament notifications sent successfully",
        });
    }
    catch (error) {
        console.error("Error sending tournament notifications:", error);
    }
})));
exports.app.post("/api/tournament-failed-notification", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tournamentName } = req.body;
    // list of phone numbers to send the notification to, you can fetch this from your database based on your requirements
    const phoneNumbers = ["233544136394", "233538599553", "233503145542", "233242825836", "233559187525", "233505954496", "233241586158", "233542169953", "233542901511", "233592409107", "233554839565", "233552262000", "233507726059", "233205479345", "233558384883", "233552700648", "233538159551", "233503408628", "233508793292", "233544296549", "233503860625", "233503020301", "233538776736", "233206870946", "233598064978", "233200397987", "233542697025", "233550350303", "233595329956", "233544159671", "233508742502", "233206508435", "233555503026", "233257772464", "233507252222", "233257509994", "233504063271"]; // replace with actual phone numbers
    try {
        for (const user of phoneNumbers) {
            const messageTemplate = `Hi! Just a reminder that the Sunday Community Tournament starts today at 08:00PM. 
             
        Format: Swiss
        Entry: Free

        This is our free community tournament. No cash prizes, just fun, bragging rights, and a chance to sharpen your skills! Join the lobby before 8PM to avoid forfeiting. Register now: sparplay.com/tournaments/34 if you want to participate!
        `;
            const phone = user; // Assuming the phone numbers in the list are already in the correct format with country code
            console.log("realphone", phone);
            yield (0, smsService_1.sendSMS)(phone, messageTemplate);
        }
    }
    catch (error) {
        console.error("Error sending tournament reminder notifications:", error);
    }
    res.json({
        success: true,
        message: "Tournament reminder notifications sent successfully",
    });
})));
exports.app.post("/api/tournament-notification-reminder", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tournamentName } = req.body;
    try {
        const users = yield (0, db_1.default) `
          SELECT username, phone FROM users WHERE phone IS NOT NULL
      `;
        for (const user of users) {
            const messageTemplate = `Hi ${user.username}! The Friday Spar Championship begins at 8PM. Format: Single Elimination. 
Challenge top players & compete for the ₵30 prize. Register now on sparplay.com/tournaments/42 and don't miss out on the action! See you there!`;
            const phone = "233" + user.phone.substr(1);
            console.log("realphone", phone);
            yield (0, smsService_1.sendSMS)(phone, messageTemplate);
        }
    }
    catch (error) {
        console.error("Error sending tournament reminder notifications:", error);
    }
    res.json({
        success: true,
        message: "Tournament reminder notifications sent successfully",
    });
})));
exports.app.post("/api/tournament-notification-reminder-final", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { tournamentName } = req.body;
    try {
        const users = yield (0, db_1.default) `
          SELECT username, phone FROM users WHERE phone IS NOT NULL
      `;
        for (const user of users) {
            const messageTemplate = `Hi ${user.username}! The Friday Spar Championship begins at 8PM. Format: Single Elimination. 
Challenge top players & compete for the ₵30 prize. Register now on sparplay.com/tournaments/42 and don't miss out on the action! See you there!`;
            const phone = "233" + user.phone.substr(1);
            console.log("realphone", phone);
            yield (0, smsService_1.sendSMS)(phone, messageTemplate);
        }
    }
    catch (error) {
        console.error("Error sending tournament reminder notifications:", error);
    }
    res.json({
        success: true,
        message: "Tournament reminder notifications sent successfully",
    });
})));
exports.app.use(errorHandler_1.default);
const s3Client = new client_s3_1.S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});
function uploadFileToS3(bucketName, fileName, fileContent) {
    return __awaiter(this, void 0, void 0, function* () {
        const command = new client_s3_1.PutObjectCommand({
            Bucket: bucketName,
            Key: fileName,
            Body: fileContent,
        });
        try {
            const response = yield s3Client.send(command);
            console.log(`File uploaded successfully. ${response.$metadata.httpStatusCode}`);
        }
        catch (error) {
            console.error("Error uploading file:", error);
        }
    });
}
// Websocket's connection to the server to allow bidirectional communication
const port = process.env.PORT || 5000;
server.listen(port, () => {
    console.log(`[server]: Server is running at https://localhost:${port}`);
    console.log(`[server]: Environment: ${process.env.NODE_ENV}`);
});
exports.matchmaker = new matchmaking_2.default();
exports.matchForfeiter = new matchForfeiter_1.default(exports.serverSocket);
(0, socketHandler_1.initializeSocketHandler)(exports.serverSocket);
const getTotalMemoryUsage = () => {
    return (process.memoryUsage().rss / 1000000 +
        process.memoryUsage().heapUsed / 1000000 +
        process.memoryUsage().external / 1000000 +
        process.memoryUsage().arrayBuffers / 1000000);
};
const logMemoryUsage = () => {
    setInterval(() => {
        console.log("MemoryUsage: ", {
            process: `${(process.memoryUsage().rss / 1000000).toFixed(2)}mb`,
            heapTotal: `${(process.memoryUsage().heapTotal / 1000000).toFixed(2)}mb`,
            heapUsed: `${(process.memoryUsage().heapUsed / 1000000).toFixed(2)}mb`,
            arrayBuffers: `${(process.memoryUsage().arrayBuffers / 1000000).toFixed(2)}mb`,
            external: `${(process.memoryUsage().external / 1000000).toFixed(2)}mb`,
            totalMemoryUsage: `${getTotalMemoryUsage().toFixed(2)}mb`,
        });
    }, 30000);
};
const logEventLoopLag = () => {
    setInterval(() => {
        console.log("Event Loop Lag: ", {
            eventLoopLagMs: Math.round(h.mean / 1e6),
            memory: process.memoryUsage().rss / 1024 / 1024,
        });
    }, 5000);
};
const logCpuUsage = () => {
    setInterval(() => {
        const usage = process.cpuUsage(last);
        last = process.cpuUsage();
        const userMs = usage.user / 1000;
        const systemMs = usage.system / 1000;
        console.log("cpu Usage: ", { userMs, systemMs });
    }, 1000);
};
// Cleanup on server shutdown
process.on("SIGTERM", () => {
    //  matchmaker.stop();
    // matchForfeiter.stop();
    // ...existing cleanup code..
});
