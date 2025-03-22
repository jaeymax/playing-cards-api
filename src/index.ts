import express, { Express, Request, Response } from "express";
import { neon } from "@neondatabase/serverless";
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
import authMiddleware from "./middlewares/authMiddleware";

dotenv.config();

export const app: Express = express();
const server = http.createServer(app);
export const resend = new Resend(process.env.RESEND_API_KEY);

const connectDB = () => {
  try {
    const sql = neon(process.env.DATABASE_URI as string);
    console.log("connected to db");
    return sql;
  } catch (err) {
    console.log(err);
    process.exit(-1);
  }
};

const sql = connectDB();

const getUsers = async () => {
  try {
    const posts = await sql`select * from users`;
    return posts;
  } catch (e) {
    console.log(e);
  }
};

getUsers().then((data) => {
  console.log(data);
});

interface Player {
  id: string;
  name: string;
  hand: Card[];
  played_cards: Card[];
  score: number;
  status: string;
}

interface Card {}

interface Game {
  playerTurn: string;
  winner: string;
  gameStatus: string;
  leadingSuit: string;
  players: Player[];
  drawPile: Card[];
  roundNumber: number;
  currentRoundNumber: number;
}

let games = new Map<string, Game>();

const playCard = (playerId: any, card: any) => {};

//Middlewares

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);
app.use("/api/friends", friendsRoutes);
app.use("/api/users", userRoutes);
//app.use(notFoundMiddleware);
app.use(errorHandler);

// Websocket's connection to the server to allow bidirectional communication
const serverSocket = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const port = process.env.PORT || 5000;

app.get("/", (req: Request, res: Response) => {
  resend.emails
    .send({
      from: "onboarding@resend.dev",
      to: "azagojunior2@gmail.com",
      //replyTo:'onboarding@resend.dev',
      subject: "Test email",
      html: "<p> Congrats on sending your <strong>first email</strong>!</p>",
    })
    .then((response) => {
      console.log(response);
    })
    .catch((error) => {
      console.log(error);
    });
  res.send("Express + Typescript Server");
});

server.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});

// Websockets connection and all websockets event related logic
serverSocket.on("connection", (socket) => {
  console.log(`Connection established with ${socket.id}`);
  socket.emit("message", "Hello there welcome");

  socket.on("create_game", () => {});

  socket.on("join_game", () => {});

  socket.on("play_card", () => {});

  socket.on("get_game_state", () => {});

  socket.on("disconnect", () => {});
});
