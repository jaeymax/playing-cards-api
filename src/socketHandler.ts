import { Server, Socket } from "socket.io";
import sql from "./config/db";
import { matchmaker } from "./index";
import { dealCards, playCard, shuffleDeck } from "./utils/gameFunctions";
import { gameExists } from "./utils/gameFunctions";
import { getGameByCode } from "./utils/gameFunctions";
import { Game } from "../types";

export const userSocketMap = new Map();

export const initializeSocketHandler = (serverSocket: Server) => {
  serverSocket.on("connection", (socket: Socket) => {
    const userId = socket.handshake.auth.userId;
    
    if(!userId){
      socket.disconnect(true);
      return;
    }

    console.log(`User connected: ${userId} (socket ${socket.id})`);
    userSocketMap.set(userId, socket.id);
    
    socket.on("message", async (message) => {
      console.log(`Message received: ${message}`);

      //store the message in global_chat_messages table
      try {
        await sql`insert into global_chat_messages (user_id, message) values (${message.sender_id}, ${message.text})`;
      } catch (error: any) {
        console.error("Error storing message:", error.message);
      }

      // Broadcast the message to all clients except the sender
      serverSocket.emit("message", message);

    });

    socket.on("dealCards", (code) => {
      console.log(`Deal cards request for game code: ${code}`);
      if(gameExists(code)){
        const game = getGameByCode(code);
        dealCards(game);
        serverSocket.to(code).emit("dealtCards", game?.cards);
      }

    });

    socket.on("shuffleDeck", (code) => {
      console.log(`Shuffle deck request for game code: ${code}`);
      if(gameExists(code)){
        const game = getGameByCode(code);
        shuffleDeck(game);
        serverSocket.to(code).emit("shuffledDeck", game?.cards);
      }
     
    });

    socket.on("playCard", ({game_code, card_id, player_id}) => {
      console.log("Playing card...", game_code, card_id, player_id);
     if(gameExists(game_code)){
        const game = getGameByCode(game_code);
      playCard(game, card_id, player_id, socket);
     }

    });


    socket.on("readyForNextHand", ({code, winningPlayer}) => {
      if(gameExists(code)){
      const game = getGameByCode(code) as Game;
        game.current_player_position = (winningPlayer.position + 1) % game.player_count;
        game.status = "inProgress";
        game.started_at = new Date().toISOString();
        game.round_number = 1;
        game.current_trick = null;
        game.completed_tricks = [];

        // set winning player to dealer
        let next_dealer = game.players.find((player:any)=> player.id == winningPlayer.id)

        game.players.forEach((player)=>player.is_dealer=false);

        if(next_dealer){
          next_dealer.is_dealer = true;
        }

        // reset game cards
        game.cards.forEach((card)=>{
          card.hand_position = -1;
          card.player_id = 0;
          card.status = 'in_deck';
          
        })

        serverSocket.to(code).emit('startNewHand', game);

      }


    });

    socket.on("join_game", () => {});


    socket.on("getGameData", (code) => {
      const game = getGameByCode(code);
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
        console.log(data.userId, "leaving queue");
        await matchmaker.removeFromQueue(data.userId);
        socket.emit("queue_left");
      } catch (error) {
        socket.emit("queue_error", { message: "Failed to leave queue" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`User ${userId} disconnected`)
      userSocketMap.delete(userId);
    });
  });

  // Handle match found events
  matchmaker.on("matchFound", ({ gameCode, gameId, players }) => {
    console.log('players',players)

    for (const player of players) {
      const socketId = userSocketMap.get(player.id);
      if (socketId) {
        serverSocket.sockets.sockets.get(socketId)?.join(gameCode);
      }
    }

    serverSocket.to(gameCode).emit("matchFound", {
      gameCode,
      gameId,
      players
    });

  });

  matchmaker.on("gameStarted", ({ gameCode }) => {
    console.log(`Game started with code: ${gameCode} has started`);
    serverSocket.to(gameCode).emit("gameStarted", { gameCode });
  });
};
