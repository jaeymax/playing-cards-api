import { Server, Socket } from "socket.io";
import sql from "./config/db";
import { matchmaker, redis } from "./index";
import { createGamePlayer, dealCards, playCard, saveGame, shuffleDeck } from "./utils/gameFunctions";
import { gameExists } from "./utils/gameFunctions";
import { getGameByCode } from "./utils/gameFunctions";
import { Game } from "../types";

export const userSocketMap = new Map();


async function acquireLock(gameCode:string, timeout = 5000) {
  const lockKey = `lock:${gameCode}`;
  // NX: Only set if it doesn't exist | PX: Expire after X milliseconds (prevents deadlocks)
  const result = await redis.set(lockKey, "locked", "EX", timeout, "NX");
  console.log("Lock result:", result);
  return result === "OK";
}

async function releaseLock(gameCode:string) {
  await redis.del(`lock:${gameCode}`);
}



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

    socket.on("dealCards", async (code) => {
      console.log(`Deal cards request for game code: ${code}`);
      if( await gameExists(code)){
        const game = await getGameByCode(code);
        dealCards(game);
        serverSocket.to(code).emit("dealtCards", game?.cards);
        serverSocket.to(code).emit("updatedGameData", game);
       await saveGame(code, game);
      }else{
        socket.emit("game-not-found");
      }

    });

    socket.on("shuffleDeck", async (code) => {
      console.log(`Shuffle deck request for game code: ${code}`);
      if( await gameExists(code)){
        const game = await getGameByCode(code);
        shuffleDeck(game);
        serverSocket.to(code).emit("shuffledDeck", game?.cards);
        await saveGame(code, game);
      } else {
        socket.emit("game-not-found");
      }
     
    });

    socket.on("playCard", async ({game_code, card_id, player_id}) => {
      try{
        const lockAcquired = await acquireLock(game_code);
        if(!lockAcquired){
          console.log("Request blocked: Processing previous  move.")
          return;
        }
        console.log("Playing card...", game_code, card_id, player_id);
        if(await gameExists(game_code)){
          const game = await getGameByCode(game_code);
          playCard(game, card_id, player_id, socket);
          await saveGame(game_code, game);
        }else{
          socket.emit("game-not-found");
        }

      }catch(error){
        console.error("Error in playCard:", error);
      }finally{
        
        console.log("Releasing lock...");
        await releaseLock(game_code);
        console.log('Lock Released');
      }

    });


    socket.on("readyForNextHand", async ({code, winningPlayer}) => {
      if( await gameExists(code)){
        const game = await getGameByCode(code) as Game;
        game.current_player_position = (winningPlayer.position);
        game.status = "in_progress";
        game.started_at = new Date().toISOString();
        game.round_number = 1;
        game.current_hand_number ++;
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

        game.turn_started_at = Date.now();
        game.turn_ends_at = game.turn_started_at + game.turn_timeout_seconds * 1000;
        game.current_turn_user_id = game.players.find((player:any)=>player.position == game.current_player_position)?.user?.id as number;
        await redis.zadd('forfeit:index', game.turn_ends_at, game.code);
        await saveGame(code, game);
        serverSocket.to(code).emit('startNewHand', game);

      }else{
        socket.emit("game-not-found");
      }

    });

    socket.on("rematch", async ({code, winningPlayer}) => {
      if( await gameExists(code)){
        const game = await getGameByCode(code) as Game;
        console.log('winningPlayer', winningPlayer);
        game.current_player_position = winningPlayer.position ;
        game.status = "in_progress";
        game.started_at = new Date().toISOString();
        game.round_number = 1;
        game.current_hand_number = 1;
        game.current_trick = null;
        game.completed_tricks = [];

        // set winning player to dealer
        let next_dealer = game.players.find((player:any)=> player.id == winningPlayer.id)

        game.players.forEach((player)=>player.is_dealer=false);
        game.players.forEach((player)=>player.score=0);

        if(next_dealer){
          next_dealer.is_dealer = true;
        }

        // reset game cards
        game.cards.forEach((card)=>{
          card.hand_position = -1;
          card.player_id = 0;
          card.status = 'in_deck';
          
        })

        await saveGame(code, game);
        console.log('rematch', game.players);
        serverSocket.to(code).emit('rematch', game);

      }else{
        socket.emit("game-not-found");
      }

    });


    socket.on("join-room", async (code) => {
      console.log(`User ${userId} joining game: ${code}`);
      if ( await gameExists(code)) {
        socket.join(code);
        serverSocket.to(code).emit("userJoined", { userId, code });
      }
    });

    socket.on("joinTournamentRoom", async ({tournamentId, userId}) => {
      console.log(`User ${userId} joining tournament room: ${tournamentId}`);
      socket.join(`tournament_${tournamentId}`);
    });

    socket.on("playerJoin", async ({userId, gameCode}) => {
      console.log(`User ${userId} joining game: ${gameCode}`);
      if ( await gameExists(gameCode)) {
        const game = await getGameByCode(gameCode);

        if(game){

        
        
        const userAlreadyJoined = game.players.find(((player:any)=>player.user.id === userId));
        console.log(`${serverSocket.sockets.adapter.rooms.get(gameCode)?.size} players connected`)

        if(userAlreadyJoined){
          socket.join(gameCode);
          console.log('userAlreadyJoined', userAlreadyJoined?.user?.username);
          return;
        }

        if(game.players.length == game.player_count){
           console.log(`Room ${game.code} is full`);
           return;
        }



        const player = await createGamePlayer(game.id, userId, game.players.length);

         if(player){
           game.players.push(player);
           await saveGame(gameCode, game);
           serverSocket.to(gameCode).emit('gameData', game)
         }
      }

    }

    });

    socket.on("leave-room", async (code) => {
      console.log(`User ${userId} leaving game: ${code}`);
      if (await gameExists(code)) {
        socket.leave(code);
        serverSocket.to(code).emit("userLeft", { userId, code });
      }
    });

    socket.on("getGameData", async (code) => {

      console.log('request for game data', code);
      const game = await getGameByCode(code);
      if (game) {
        socket.emit("gameData", game);
      } else {
        socket.emit("game-not-found");
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

    // game_chat_messages
    socket.on('sendMessage', async ({game_code, user_id, type, avatar, username, message, timestamp})=>{
      console.log(`Message received in game ${game_code} from user ${user_id}: ${message}`);

      //store the message in game_chat_messages table
      try {
        await sql`insert into game_chat_messages (game_code, user_id, username, message, type, created_at) values (${game_code}, ${user_id}, ${username}, ${message}, ${type}, ${timestamp})`;
      } catch (error: any) {
        console.error("Error storing game message:", error.message);
      }

      // Broadcast the message to all clients in the game room
      socket.to(game_code).emit("chatMessage", {user_id, type:"text", username, avatar, timestamp, message, game_code});
      console.log({user_id, username, avatar, timestamp, message, game_code})

    });

    socket.on("voiceMessage", async ({user_id, username, avatar, mime_type, timestamp, audio, game_code})=>{
      console.log(`Voice message received in game ${game_code} from user ${user_id}`);

      // Broadcast the voice message to all clients in the game room
      socket.to(game_code).emit("voiceMessage", {user_id, username, type:"audio", avatar, mime_type, timestamp, audio, game_code});
      console.log({user_id, username, avatar, mime_type, timestamp, audio, game_code});
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
