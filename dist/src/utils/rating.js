"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateRatings = updateRatings;
// rating.js
function updateRatings(players, winnerId, k = 30) {
    // players: array of { id, rating }
    const winner = players.find(p => p.user.id === winnerId);
    const losers = players.filter(p => p.user.id !== winnerId);
    console.log('Winner:', winner);
    console.log('Losers:', losers);
    console.log('Before ratings update:', players);
    let expectedTotal = 0;
    losers.forEach(loser => {
        const expected = 1 / (1 + Math.pow(10, (loser.user.rating - winner.user.rating) / 400));
        expectedTotal += expected;
        // update loser rating individually and round it to an interger
        loser.user.rating = loser.user.rating + k * (0 - expected);
        loser.user.rating = Math.round(loser.user.rating);
    });
    // winner’s rating update
    winner.user.rating = winner.user.rating + k * ((losers.length) - expectedTotal);
    winner.user.rating = Math.round(winner.user.rating);
    console.log('After ratings update:', players);
    return players;
}
function rewardHandWin(player, bonus = 1) {
    player.user.rating += bonus;
    return player;
}
module.exports = { updateRatings, rewardHandWin };
