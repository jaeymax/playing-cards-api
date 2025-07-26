import { games } from "../index";

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
    card.animation_state = "shuffling"; 
  });

  game.cards.sort(() => Math.random() - 0.5);
};
