import express, { Express } from "express";
import { Resend } from "resend";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server } from "socket.io";
import https from "https";
import path from "path";
import http from "http";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/game";
import friendsRoutes from "./routes/friends";
import errorHandler from "./middlewares/errorHandler";
//import notFoundMiddleware from './middlewares/notFoundMiddleware';
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import userRoutes from "./routes/users";
import messageRoute from "./routes/messages";
import cardRoutes from "./routes/cards";
import matchmakingRoutes from "./routes/matchmaking";
import leaderboardRoutes from "./routes/leaderboard";
import tournamentRoutes from "./routes/tournaments";
import notificationRoutes from "./routes/notifications";
import matchhistoryRoutes from "./routes/matchhistory";
import profileRoutes from "./routes/profile";
import walletRoutes from "./routes/wallet";
import payoutRoutes from "./routes/payout";
import webhookRoutes from "./routes/webhook";
import Matchmaker from "./services/matchmaking";
import { initializeSocketHandler } from "./socketHandler";
import type { Game } from "../types";
import Redis from "ioredis";
import sql from "./config/db";
import authMiddleware from "./middlewares/authMiddleware";
import Mixpanel from "mixpanel";
import fs from "fs";
import MatchForfeiter from "./services/matchForfeiter";
import { monitorEventLoopDelay } from "perf_hooks";
//import { TwilioClient } from "./config/twilio";
import { sendSMS } from "./services/smsService";
import expressAsyncHandler from "express-async-handler";
import { closeTournamentRegistration, getAllUpcomingTournaments, startTournament } from "./services/tournament";
//import admin from "firebase-admin"

const cron = require("node-cron");
const admin = require("firebase-admin");

//console.log('admin', admin);

const h = monitorEventLoopDelay();
h.enable();
let last = process.cpuUsage();

export const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN as string);

dotenv.config();

export const app: Express = express();

const serviceAccount = require(path.join(__dirname, "../private_keys/serviceAccountKey.json"));
// const options = {
//   key: fs.readFileSync("certs/192.168.43.218-key.pem"),
//   cert: fs.readFileSync("certs/192.168.43.218.pem"),
// }
console.log('test')

const redisConfig = {
  host: "127.0.0.1",
  port: 6379,
};

admin.initializeApp({
  credential: admin.cert(serviceAccount)
});


const testPushNotification = async () => {
  await admin.messaging().send({
  
   token: "",
  
   notification:{
    title:"Spar Tournament",
    body:"Your match starts in 15 minutes"
   }
  
  });
}

const sendPushNotification = async(token: string, title: string, body: string) => {
  try {
    const message = {
      token: token,
      notification: {
        title: title,
        body: body,
      },
    };

    const response = await admin.messaging().send(message);
    console.log("Successfully sent push notification:", response);
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
}


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

cron.schedule("52 19 * * *", async () => {
  console.log('Checking tournaments regsitration closure...');

  const now = new Date();
  console.log('date', now.toISOString());

  const bufferTime = 1 * 60 * 1000; // 1 minute buffer time

  try{

    const tournaments = await getAllUpcomingTournaments();
  
    console.log('upcoming tournaments', tournaments);
  
    for (const tournament of tournaments) {
      const registrationCloseTime = new Date(tournament.registration_closing_date);
      const startTime = new Date(tournament.start_date);
      console.log(`Tournament ${tournament.name} - Registration Close: ${registrationCloseTime.toISOString()}, Start Time: ${startTime.toISOString()}`);
      // add some buffer time to ensure registration is closed before starting the tournament
      if (now.getTime() >= registrationCloseTime.getTime() + bufferTime && !tournament.registration_closed) {
        console.log(`Closing registration for tournament ${tournament.name}`);
        await closeTournamentRegistration(tournament.id);
      }
  
        
    }
  }catch(error){
    console.error('Error checking tournaments:', error);
  }

});



cron.schedule("0 20 * * *", async () => {
  console.log('Checking tournaments start times...');

  const now = new Date();
  console.log('date', now.toISOString());

  const bufferTime = 1 * 60 * 1000; // 1 minute buffer time

  try{

    const tournaments = await getAllUpcomingTournaments();
  
    console.log('upcoming tournaments', tournaments);
  
    for (const tournament of tournaments) {
      const registrationCloseTime = new Date(tournament.registration_closing_date);
      const startTime = new Date(tournament.start_date);
      console.log(`Tournament ${tournament.name} - Registration Close: ${registrationCloseTime.toISOString()}, Start Time: ${startTime.toISOString()}`);
  
        if (now.getTime() >= startTime.getTime() && !tournament.started) {
          console.log(`Starting tournament ${tournament.name}`);
          await startTournament(tournament.id);
        }
    }
  }catch(error){
    console.error('Error checking tournaments:', error);
  }

});


cron.schedule("30 18 * * *", async () => {
  console.log('Checking if any tournaments is starting today and sending notifications...');

  const now = new Date();
  console.log('date', now.toISOString());

  const bufferTime = 1 * 60 * 1000; // 1 minute buffer time

  try{

    const tournaments = await getAllUpcomingTournaments();
  
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
  }catch(error){
    console.error('Error checking tournaments:', error);
  }

});


const sendTournamentStartNotifications = async (tournament: any) => {
  try {

   // const testId = 48;
    const users = await sql`
        SELECT username, phone FROM users WHERE phone IS NOT NULL
    `;

    // if its friday then the cash prize is 30ghc, if its saturday then the cash prize is 90ghc with first position getting 60ghc and second position getting 30ghc, if its sunday then there is no cash prize you can customize the message based on the tournament details

      const tournamentDate = new Date(tournament.start_date);
    const dayOfWeek = tournamentDate.getDay(); // 0 = Sunday, 5 = Friday, 6 = Saturday

    let prizeMessage = "";

    const entryMessage =
  Number(tournament.registration_fee) === 0
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
      await sendSMS(phone, messageTemplate);
    }
  } catch (error) {
    console.error("Error sending tournament start notifications:", error);
  }
};


const server = http.createServer(app);
export const resend = new Resend(process.env.RESEND_API_KEY);
export const redis = new Redis(redisConfig);

export const serverSocket = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

export const FRONTEND_URL =
  process.env.NODE_ENV === "production"
    ? process.env.FRONTEND_URL_PROD
    : process.env.FRONTEND_URL_DEV;
//Middlewares

app.use(cors());
app.use("/api/webhooks", webhookRoutes);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/games", gameRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoute);
app.use("/api/cards", cardRoutes);
app.use("/api/matchmaking", matchmakingRoutes);
app.use("/api/matchhistory", matchhistoryRoutes);
app.use("/api/leaderboard", leaderboardRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/tournaments", tournamentRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/payout-method", payoutRoutes);
//app.use(notFoundMiddleware);

app.post(
  "/api/test-sms",
  expressAsyncHandler(async (req, res) => {
    const { phone } = req.body;

    await sendSMS(phone, "Test SMS from SparPlay 🔥");

    res.json({ success: true });
  })
);

//test a push notification route
app.post(
  "/api/test-push-notification",
  expressAsyncHandler(async (req, res) => {
    const { token } = req.body;

    await sendPushNotification(token, "Test Push Notification", "This is a test push notification from SparPlay 🔥");

    res.json({ success: true });
  })
);

app.post(
  "/api/send-tournament-notification",
  expressAsyncHandler(async (req, res) => {
    const { tournamentName } = req.body;

    try {
      const users = await sql`
          SELECT username, phone FROM users WHERE phone IS NOT NULL
      `;

      for (const user of users) {
        const messageTemplate = `Hi ${user.username}!, Spar Weekend Championship kicks off Friday 7PM. Test your skills, compete with others and win ₵50 cash. Register now at https://sparplay.com`;
        const phone = "233" + user.phone.substr(1);
        console.log("realphone", phone);
        await sendSMS(phone, messageTemplate);
      }

      res.json({
        success: true,
        message: "Tournament notifications sent successfully",
      });
    } catch (error) {
      console.error("Error sending tournament notifications:", error);
    }
  })
);

app.post(
  "/api/tournament-failed-notification",
  expressAsyncHandler(async (req, res) => {
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
        await sendSMS(phone, messageTemplate);
      }
    } catch (error) {
      console.error("Error sending tournament reminder notifications:", error);
    }

    res.json({
      success: true,
      message: "Tournament reminder notifications sent successfully",
    });
  })
);

app.post(
  "/api/tournament-notification-reminder",
  expressAsyncHandler(async (req, res) => {
    const { tournamentName } = req.body;

    try {
      const users = await sql`
          SELECT username, phone FROM users WHERE phone IS NOT NULL
      `;

      for (const user of users) {
        const messageTemplate = `Hi ${user.username}! The Friday Spar Championship begins at 8PM. Format: Single Elimination. 
Challenge top players & compete for the ₵30 prize. Register now on sparplay.com/tournaments/42 and don't miss out on the action! See you there!`;
        const phone = "233" + user.phone.substr(1);
        console.log("realphone", phone);
        await sendSMS(phone, messageTemplate);
      }
    } catch (error) {
      console.error("Error sending tournament reminder notifications:", error);
    }

    res.json({
      success: true,
      message: "Tournament reminder notifications sent successfully",
    });
  })
);

app.post(
  "/api/tournament-notification-reminder-final",
  expressAsyncHandler(async (req, res) => {
    const { tournamentName } = req.body;

    try {
      const users = await sql`
          SELECT username, phone FROM users WHERE phone IS NOT NULL
      `;

      for (const user of users) {
          const messageTemplate = `Hi ${user.username}! The Friday Spar Championship begins at 8PM. Format: Single Elimination. 
Challenge top players & compete for the ₵30 prize. Register now on sparplay.com/tournaments/42 and don't miss out on the action! See you there!`;
        const phone = "233" + user.phone.substr(1);
        console.log("realphone", phone);
        await sendSMS(phone, messageTemplate);
      }
    } catch (error) {
      console.error("Error sending tournament reminder notifications:", error);
    }

    res.json({
      success: true,
      message: "Tournament reminder notifications sent successfully",
    });
  })
);

app.use(errorHandler);

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },
});

async function uploadFileToS3(
  bucketName: string,
  fileName: string,
  fileContent: Buffer
) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: fileContent,
  });

  try {
    const response = await s3Client.send(command);
    console.log(
      `File uploaded successfully. ${response.$metadata.httpStatusCode}`
    );
  } catch (error) {
    console.error("Error uploading file:", error);
  }
}

// Websocket's connection to the server to allow bidirectional communication

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`);
  console.log(`[server]: Environment: ${process.env.NODE_ENV}`);
});

export const matchmaker = new Matchmaker();
export const matchForfeiter = new MatchForfeiter(serverSocket);

initializeSocketHandler(serverSocket);

const getTotalMemoryUsage = () => {
  return (
    process.memoryUsage().rss / 1000000 +
    process.memoryUsage().heapUsed / 1000000 +
    process.memoryUsage().external / 1000000 +
    process.memoryUsage().arrayBuffers / 1000000
  );
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
