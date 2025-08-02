import { games } from "../index";
import { clients } from "../socketHandler";

export const dealCards = (gameCode: string) => {
  const game = games.get(gameCode);
  if (!game) {
    console.error(`Game with code ${gameCode} not found`);
    return;
  }
  //console.log("Dealing cards...");

  // sort in reverse order accordion to playing position
  const gamePlayers = game.players.sort((a, b) => b.position - a.position).map((player) => player.id);
  let cardIndex = 0;

  for (let player of gamePlayers) {
    for (let hand_position = 0; hand_position < 3; hand_position++) {
      game.cards[cardIndex].player_id = player; // Assign cards to players
      game.cards[cardIndex].status = "in_hand"; // Set status to in_hand
      game.cards[cardIndex].animation_state = "dealing"
      game.cards[cardIndex].hand_position = hand_position; // Set hand position
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
    remainingCards.forEach((card) => {
      card.player_id = game.players.find((player) => player.is_dealer)?.id || 0; // Assign to dealer (first player)
      card.status = "in_drawpile"; // Set status to in_drawpile
     // card.hand_position = -1;
      card.animation_state = "idle";
    });
  }
};

export const shuffleDeck = (gameCode: string) => {
  const game = games.get(gameCode);
  if (!game) {
    console.error(`Game with code ${gameCode} not found`);
    return;
  }
  //console.log("Shuffling deck...", game.cards);
  game.cards.forEach((card) => {
    card.player_id = 0; // Reset player_id for shuffling
    card.status = "in_deck"; // Reset status to in_drawpile
    //card.hand_position = -1;
    card.animation_state = "shuffling"; 
  });

  game.cards.sort(() => Math.random() - 0.5);
};

export const playCard = (game: any, card_id: number, player_id: number, socket:any) => {
  
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
  game.current_trick.cards.push({
    ...card,
    player_position: player.position
  });


  if(isHigherCard(card, game.current_trick)){
     game.current_trick.leader_position = player.position;
  }

  //console.log(`${player.user.username}'s hand`, player_hand);
  
  // update current leader if needed
  clients.forEach((client: any) => {
    client.emit("playedCard", {card_id, player_id, trick_number: game.round_number});
  });

  
  // Move to next player or complete trick if needed
  if(game.current_trick.cards.length === game.players.length){
    completeTrick(game);
  }else{
    getNextPlayerPosition(game);
  }
  
  clients.forEach((client: any) => {
    client.emit("updatedGameData", game);
  });


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


const completeTrick = (game: any) => {
  const {current_trick} = game;
  game.completed_tricks.push(current_trick);
  console.log('completed tricks', game.completed_tricks);
  
  // chec if it's the final trick (all cards played)
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

const endGame = (game: any) => {
  const final_trick = game.completed_tricks[game.completed_tricks.length - 1];
  const winning_card = final_trick.cards.find((card: any) => card.player_position === final_trick.leader_position);
  console.log('endGame');

  let points = 1;

  game.status = "ended";
  game.ended_at = new Date();

  const winner = game.players.find((player: any) => player.position === final_trick.leader_position);
  winner.score += points;

  console.log("game", game.players)
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
  //console.log('game', game);
  
  //console.log('game.current_player_position before', game.current_player_position);
  game.current_player_position = (game.current_player_position + 1) % game.players.length;
  //console.log('game.current_player_position after', game.current_player_position);
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