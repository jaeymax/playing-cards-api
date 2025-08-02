import { Server, Socket } from "socket.io";
import sql from "./config/db";
import { matchmaker } from "./index";
import { games} from "./index";
import { dealCards, getNextPlayerPosition, playCard, shuffleDeck } from "./utils/gameFunctions";

export let clients = new Set<Socket>();

export const initializeSocketHandler = (serverSocket: Server) => {
  serverSocket.on("connection", (socket: Socket) => {
    console.log(`Connection established with ${socket.id}`);
    clients.add(socket);

    socket.on("message", async (message) => {
      console.log(`Message received: ${message}`);

      //store the message in global_chat_messages table
      try {
        await sql`insert into global_chat_messages (user_id, message) values (${message.sender_id}, ${message.text})`;
      } catch (error: any) {
        console.error("Error storing message:", error.message);
      }

      clients.forEach((client) => {
        if (client !== socket) {
          client.emit("message", message);
        }
      });
    });

    socket.on("dealCards", (code) => {
      console.log(`Deal cards request for game code: ${code}`);
      const game = games.get(code);
      dealCards(code);
      clients.forEach((client: any) => {
        client.emit("dealtCards", game?.cards);
      });
    });

    socket.on("shuffleDeck", (code) => {
      console.log(`Shuffle deck request for game code: ${code}`);
      shuffleDeck(code);
      const game = games.get(code);
      clients.forEach((client: any) => {
        client.emit("shuffledDeck", game?.cards);
      });
    });

    socket.on("playCard", ({game_code, card_id, player_id}) => {
      console.log("Playing card...", game_code, card_id, player_id);
      const game = games.get(game_code);
      if (!game) {
        console.error(`Game with code ${game_code} not found`);
        return;
      }

      playCard(game, card_id, player_id, socket);

     
    

    });


    socket.on("create_game", () => {});

    socket.on("join_game", () => {});


    socket.on("getGameData", (code) => {
      const game = games.get(code);
      if (game) {
        socket.emit("gameData", game);
      } else {
        socket.emit("error", { message: "Game not found" });
      }
    });

    socket.on("join_queue", async (data) => {
      try {
        await matchmaker.addToQueue(data.userId, data.rating);
        socket.emit("queue_joined");
      } catch (error) {
        socket.emit("queue_error", { message: "Failed to join queue" });
      }
    });

    socket.on("leave_queue", async (data) => {
      try {
        await matchmaker.removeFromQueue(data.userId);
        socket.emit("queue_left");
      } catch (error) {
        socket.emit("queue_error", { message: "Failed to leave queue" });
      }
    });

    socket.on("disconnect", () => {
      clients.delete(socket);
    });
  });

  // Handle match found events
  matchmaker.on("matchFound", ({ gameCode, gameId, players }) => {
    clients.forEach((client: any) => {
      if (true) {
        client.emit("matchFound", { gameCode, gameId, players });
      }
    });
  });

  matchmaker.on("gameStarted", ({ gameCode }) => {
    console.log(`Game started with code: ${gameCode} has started`);

    clients.forEach((client: any) => {
      if (true) {
        client.emit("gameStarted", { gameCode });
      }
    });
  });
};

export const getClients = () => clients; 