import express, { Express} from "express";
import { Resend } from "resend";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server } from "socket.io";
import https from "https";
import http from "http";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/game";
import friendsRoutes from "./routes/friends";
import errorHandler from "./middlewares/errorHandler";
//import notFoundMiddleware from './middlewares/notFoundMiddleware';
import {PutObjectCommand, S3Client} from "@aws-sdk/client-s3"
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
import  Mixpanel  from "mixpanel";
import fs from "fs";
import MatchForfeiter from "./services/matchForfeiterEnhanced";
import {monitorEventLoopDelay} from 'perf_hooks'
import { TwilioClient } from "./config/twilio";
import { sendSMS } from "./services/smsService";


const h = monitorEventLoopDelay()
h.enable()
let last = process.cpuUsage()


export const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN as string);


dotenv.config();

export const app: Express = express();

// const options = {
//   key: fs.readFileSync("certs/192.168.43.218-key.pem"),  
//   cert: fs.readFileSync("certs/192.168.43.218.pem"),
// }

const redisConfig = {
  host: '127.0.0.1',
  port: 6379,
}  

const server = http.createServer(app);
export const resend = new Resend(process.env.RESEND_API_KEY);
export  const redis = new Redis(redisConfig);

export const serverSocket = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },  
});  





export const FRONTEND_URL = process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL_PROD : process.env.FRONTEND_URL_DEV;
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

app.post('/api/test-sms', async (req, res)=>{
   const {phone} = req.body;

   await sendSMS(phone, 'Test SMS from SparPlay 🔥');

   res.json({success:true});
});

app.use(errorHandler);

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY as string,
  },  
});  


async function uploadFileToS3(bucketName: string, fileName: string, fileContent: Buffer) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: fileName,
    Body: fileContent,
  });  
  
  try {
    const response = await s3Client.send(command);
    console.log(`File uploaded successfully. ${response.$metadata.httpStatusCode}`);
  } catch (error) {
    console.error("Error uploading file:", error);
  }  
}  

// Websocket's connection to the server to allow bidirectional communication

const port = process.env.PORT || 5000;


server.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`);
});  

export const matchmaker = new Matchmaker();
export const matchForfeiter = new MatchForfeiter(serverSocket);


initializeSocketHandler(serverSocket);

const getTotalMemoryUsage = () =>{
  return (process.memoryUsage().rss /1000000) + (process.memoryUsage().heapUsed / 1000000) + (process.memoryUsage().external / 1000000) + (process.memoryUsage().arrayBuffers / 1000000)
}  

const logMemoryUsage = () =>{
  setInterval(()=>{
    console.log('MemoryUsage: ',
      {
        process: `${(process.memoryUsage().rss / 1000000).toFixed(2)}mb`,
        heapTotal: `${(process.memoryUsage().heapTotal / 1000000).toFixed(2)}mb`,
        heapUsed: `${(process.memoryUsage().heapUsed / 1000000).toFixed(2)}mb`,
        arrayBuffers: `${(process.memoryUsage().arrayBuffers / 1000000).toFixed(2)}mb`,
        external:`${(process.memoryUsage().external / 1000000).toFixed(2)}mb`,
        totalMemoryUsage: `${getTotalMemoryUsage().toFixed(2)}mb`
      }  
    )  
  }, 30000);  
}  

const logEventLoopLag = () =>{
  setInterval(()=>{
    console.log('Event Loop Lag: ',{
      eventLoopLagMs: Math.round(h.mean / 1e6),
      memory:  process.memoryUsage().rss / 1024 / 1024
    })  
  }, 5000);  
}  

const logCpuUsage = ()=> {
  setInterval(()=>{
      const usage = process.cpuUsage(last);
      last = process.cpuUsage();
  
      const userMs = usage.user / 1000;
      const systemMs = usage.system / 1000;
  
      console.log('cpu Usage: ', {userMs, systemMs});
  }, 1000)    
}  



// Cleanup on server shutdown
process.on("SIGTERM", () => {
//  matchmaker.stop();
 // matchForfeiter.stop();
 // ...existing cleanup code..
});
