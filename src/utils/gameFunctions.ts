import sql from "../config/db";
import { games, redis } from "../index";
import { serverSocket } from "../index";

export const getDealingSequence = (game:any) =>{

  const dealingSequence:any[] = []

  const dealerPosition = game.players.find((player:any)=>player.is_dealer == true)?.position;

  let currentPlayerPosition = dealerPosition;

  while(true){
    let nextPlayerPosition = (currentPlayerPosition + 1) % game.player_count;
    const player = game.players.find((player:any)=>player.position == nextPlayerPosition).id;
    dealingSequence.push(player);
    currentPlayerPosition = nextPlayerPosition;
    if(nextPlayerPosition == dealerPosition)break;
  }

  return dealingSequence;
}

export const dealCards = async (game:any) => {
  const gamePlayers = getDealingSequence(game);
  console.log('dealing_sequence', getDealingSequence(game));
  let cardIndex = 0;

  for (let player of gamePlayers) {
    // player here represents a player's id
    for (let hand_position = 0; hand_position < 3; hand_position++) {
      game.cards[cardIndex].player_id = player; // Assign cards to players
      game.cards[cardIndex].status = "in_hand"; // Set status to in_hand
      game.cards[cardIndex].animation_state = "dealing"
      game.cards[cardIndex].hand_position = hand_position;
      cardIndex++;
    }
  }

  for (let player of gamePlayers) {
    for (let hand_position = 3; hand_position < 5; hand_position++) {
      game.cards[cardIndex].player_id = player; // Assign cards to players
      game.cards[cardIndex].status = "in_hand"; // Set status to in_hand
      game.cards[cardIndex].animation_state = "dealing"
      game.cards[cardIndex].hand_position = hand_position; // Set hand position
      cardIndex++;
    }
  }

  const remainingCards = game.cards.slice(cardIndex);
  if (remainingCards.length > 0) {
    remainingCards.forEach((card:any) => {
      card.player_id = game.players.find((player:any) => player.is_dealer)?.id || 0; // Assign to dealer (first player)
      card.status = "in_drawpile"; // Set status to in_drawpile
     // card.hand_position = -1;
      card.animation_state = "idle";
    });
  }

  
};

export const shuffleDeck = async (game:any) => {
  game.cards.forEach((card:any) => {
    card.player_id = 0; // Reset player_id for shuffling
    card.status = "in_deck"; 
    card.hand_position = -1;
    card.animation_state = "shuffling"; 
  });

  game.cards.sort(() => Math.random() - 0.5);
  console.log('shuffled deck')
};

export const playCard = async (game: any, card_id: number, player_id: number, socket:any) => {
  
  const player = game.players.find((player: any) => player.id === player_id );
  if(player.position !== game.current_player_position){
    console.log(`${player.user.username} it is not your turn to play`);
    socket.emit('gameMessage', "It's not your turn to play");
    return;
  }
  const played_card = game.cards.find((card: any) => card.id === card_id);

  if(played_card.player_id !== player_id){
    console.log(`${player.user.username} you can't play that card`);
    socket.emit('gameMessage', "You can't play that card");
    return;
  }

  if(played_card.status !== "in_hand"){
    console.log(`${player.user.username} you can't play that card`);
    socket.emit('gameMessage', "You can't play that card");
    return;
  }

  const player_hand = getPlayerHand(game, player_id);
  const card = player_hand.find((card: { id: number; })=>card.id === card_id)
  
  if(!game.current_trick){
    game.current_trick = {
      cards: [],
      leading_suit: "",
      leader_position: 0
    }

    game.completed_tricks = [];
  }
  // first card of the trick
  if(game.current_trick.cards.length === 0){
    game.current_trick.leading_suit = getSuit(card);
    game.current_trick.leader_position = player.position;
  }
  else{
     const leading_suit = game.current_trick.leading_suit;
     if(hasSuit(player_hand, leading_suit) && getSuit(card) != leading_suit){
       socket.emit('gameMessage', `The leading suit of the current trick is ${leading_suit.toLowerCase()}, you have a ${leading_suit.toLowerCase().slice(0, -1)} you must follow suit`);
       return;
     }
  }

  played_card.status = "played";
  played_card.trick_number = game.round_number;
  game.current_trick.cards.push({
    ...card,
    player_position: player.position
  });


  if(isHigherCard(card, game.current_trick)){
     game.current_trick.leader_position = player.position;
  }

  

  console.log(`Room ${game.code} has ${serverSocket.sockets.adapter.rooms.get(game.code)?.size} players connected`);
  serverSocket.to(game.code).emit("playedCard", {
    card_id,
    player_id,
    trick_number: game.round_number
  });

  
  // Move to next player or complete trick if needed
  if(game.current_trick.cards.length === game.players.length){
    completeTrick(game);
  }else{
    getNextPlayerPosition(game);
  }
  
  serverSocket.to(game.code).emit("updatedGameData", game);
};

const isHigherCard = (card: any, current_trick: any) => {
  if(current_trick.cards.length === 0){
    return true;
  }
  
  const leading_suit = current_trick.leading_suit;
  const current_card_suit = getSuit(card);

  if(current_card_suit !== leading_suit)return false;

  const current_winning_card = current_trick.cards.find((card: any) => card.player_position === current_trick.leader_position);
  const current_winning_card_value = getCardValue(current_winning_card);
  const card_value = getCardValue(card);

  return card_value > current_winning_card_value;
}


const completeTrick = async (game: any) => {
  const {current_trick} = game;
  game.completed_tricks.push(current_trick);
  //console.log('completed tricks', game.completed_tricks);
  
  
  if(allCardsPlayed(game)){
     endGame(game);
     return;
  }
  
  game.current_trick = {
    cards: [],
    leading_suit: "",
    leader_position: 0
  };

  game.current_player_position = current_trick.leader_position;
  game.round_number++;
}

const endGame = async(game: any) => {
  const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
  const winning_card = final_trick.cards.find((card: any) => card.player_position === final_trick.leader_position);

  let points = 1;

  game.status = "ended";
  game.ended_at = new Date();

  
  if(winning_card.card.rank == '6' || winning_card.card.rank == '7'){
    points = calculateSpecialPoints(game.completed_tricks, game.completed_tricks.length - 1, '');
  }
  
  const winner = game.players.find((player: any) => player.position === final_trick.leader_position);
  winner.score += points;

  if(winner.score >= game.win_points){
    setTimeout(() => {
      serverSocket.to(game.code).emit("gameOver", {
        winner: {...winner, 
          points, 
          hand_number: game.current_hand_number
        }
      });
    }, 1000);
  }
  else{
    setTimeout(() => {
      serverSocket.to(game.code).emit("gameEnded", {
        winner: {...winner, 
          points, 
          hand_number: game.current_hand_number
        }
      });
    }, 1000); // Delay to allow last card animation to complete
  }


  
  //console.log("game", game.players)
}


const allCardsPlayed = (game: any) => {
  const dealt_cards = game.cards.filter((card: any) => card.status !== "in_drawpile");
  return dealt_cards.every((card: any) => card.status === "played");
}

export const getPlayerHand = (game: any, player_id: number) => {

  const hand = game.cards.filter((card: any) => card.player_id === player_id && card.status === "in_hand");
  return hand;
};

export const getNextPlayerPosition = (game: any) => {
  game.current_player_position = (game.current_player_position + 1) % game.players.length;
  return game.current_player_position;
};

export const hasSuit = (player_hand: any, suit: string) => {
  return player_hand.some((card: any) => getSuit(card) === suit);
};

const getSuit = (card: any) => {
  return card.card.suit;
};

const getRank = (card: any) => {
  return card.card.rank;
};

const getCardValue = (card: any) => {
  return card.card.value;
};

const calculateSpecialPoints = (completed_tricks: any, trick_number:number, next_card_suit:string):number => {
  if(trick_number <= 0)return 0;

  const trick = completed_tricks[trick_number];

  const winning_card = trick.cards.find((card: any) => card.player_position === trick.leader_position);
  const winning_card_suit = getSuit(winning_card);
  const winning_card_rank = getRank(winning_card);

  if(winning_card_suit === next_card_suit){
    return 0;
  }

  if(winning_card_rank == '6')return 3 + calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit);
  
  if(winning_card_rank == '7')return 2 + calculateSpecialPoints(completed_tricks, trick_number - 1, winning_card_suit);

  return 0;

}

export const gameExists = async (gameCode: string) => {
  const value = await redis.exists(gameCode);
  return value === 1; // Redis returns 1 if the key exists, 0 if it does not
}


export async function saveGame(gameCode:string, gameData:object){
  try {
    await redis.set(gameCode, JSON.stringify(gameData), 'EX', 3600); // Set expiration time to 1 hour
  } catch (error) {
    console.error("Error saving game to Redis:", error);
  }
}

export async function getGameByCode(gameCode: string) {
  try {
    const gameData = await redis.get(gameCode);
    if (gameData) {
      return JSON.parse(gameData);
    }
    return null;
  } catch (error) {
    console.error("Error loading game from Redis:", error);
    return null;
  }
}

export async function createGamePlayer(gameId:number, userId:number, position:number){
  try{
    const player = await sql`INSERT INTO game_players (game_id, user_id, position, is_dealer, status)
         VALUES (
           ${gameId}, 
           ${userId}, 
           ${position}, 
            false,
           'active'
         )
         RETURNING 
           id,
           game_id,
           score,
           position,
           is_dealer,
           status,
           (SELECT json_build_object(
             'id', id,
             'username', username,
             'image_url', image_url
           ) FROM users WHERE id = user_id) as user`
 
     return player[0];
  }catch(error){
    console.log('Failed to create game player', error)
    return null;
  }
}