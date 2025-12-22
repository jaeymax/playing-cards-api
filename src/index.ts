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
import matchhistoryRoutes from "./routes/matchhistory";
import profileRoutes from "./routes/profile";
import Matchmaker from "./services/matchmaking";
import { initializeSocketHandler } from "./socketHandler";
import type { Game } from "../types";
import Redis from "ioredis";
import sql from "./config/db";
import authMiddleware from "./middlewares/authMiddleware";
import  Mixpanel  from "mixpanel";
import fs from "fs";

export const mixpanel = Mixpanel.init(process.env.MIXPANEL_TOKEN as string);





dotenv.config();

export const app: Express = express();

// const options = {
//   key: fs.readFileSync("certs/192.168.43.218-key.pem"),
//   cert: fs.readFileSync("certs/192.168.43.218.pem"),
// }

const server = http.createServer(app);
export const resend = new Resend(process.env.RESEND_API_KEY);
export const redis = new Redis(process.env.REDIS_URL as string);

export const games = new Map<string, Game>();

//Middlewares


app.use(cors());
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
export const serverSocket = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 5000;

server.listen(port, () => {
  console.log(`[server]: Server is running at https://localhost:${port}`);
});

export const matchmaker = new Matchmaker();

initializeSocketHandler(serverSocket);

// Cleanup on server shutdown
process.on("SIGTERM", () => {
  matchmaker.stop();
  // ...existing cleanup code..
});
