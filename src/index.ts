import express, { Express} from "express";
import { Resend } from "resend";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import cors from "cors";
import { Server } from "socket.io";
import http from "http";
import authRoutes from "./routes/auth";
import gameRoutes from "./routes/game";
import friendsRoutes from "./routes/friends";
import errorHandler from "./middlewares/errorHandler";
//import notFoundMiddleware from './middlewares/notFoundMiddleware';
import userRoutes from "./routes/users";
import messageRoute from "./routes/messages";
import cardRoutes from "./routes/cards";
import matchmakingRoutes from "./routes/matchmaking";
import Matchmaker from "./services/matchmaking";
import { initializeSocketHandler } from "./socketHandler";
import type { Game } from "../types";

dotenv.config();

export const app: Express = express();
const server = http.createServer(app);
export const resend = new Resend(process.env.RESEND_API_KEY);

export const games = new Map<string, Game>();



//Middlewares

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/users", userRoutes);
app.use("/api/messages", messageRoute);
app.use("/api/cards", cardRoutes);
app.use("/api/matchmaking", matchmakingRoutes);
//app.use(notFoundMiddleware);
app.use(errorHandler);

// Websocket's connection to the server to allow bidirectional communication
export const serverSocket = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 5000;


server.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

export const matchmaker = new Matchmaker();

initializeSocketHandler(serverSocket);

// Cleanup on server shutdown
process.on("SIGTERM", () => {
  matchmaker.stop();
  // ...existing cleanup code...
});
