"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.acceptFriendRequest = exports.addFriend = exports.getFriends = void 0;
const db_1 = __importDefault(require("../config/db"));
const getFriends = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id } = req.body;
    try {
        const friends = yield (0, db_1.default) `
      WITH friend_pairs AS (
        SELECT 
          CASE 
            WHEN user_id = ${user_id} THEN friend_id
            ELSE user_id
          END AS friend_id,
          status
        FROM friends 
        WHERE (user_id = ${user_id} OR friend_id = ${user_id})
        AND status = 'pending'
      )
      SELECT 
        u.id,
        u.username,
        u.image_url,
        u.rating,
        u.location,
        u.games_played,
        u.games_won
      FROM friend_pairs fp
      JOIN users u ON u.id = fp.friend_id
    `;
        res.json({ success: true, friends });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error fetching friends",
            error: error.message,
        });
    }
});
exports.getFriends = getFriends;
// I'm trying to see if this keyboard is worth it. honestly speaking i don't think it does
const addFriend = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    //res.json({message:"add Friend controller"});
    const { user_id, friend_id } = req.body;
    // Insert the friend into the database
    const newFriend = yield (0, db_1.default) `
        INSERT INTO friends (user_id, friend_id) 
        VALUES (${user_id}, ${friend_id})
        RETURNING *
      `;
    res.json({ newFriend });
});
exports.addFriend = addFriend;
const acceptFriendRequest = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id, friend_id } = req.body;
    try {
        // Check if friend request exists and is pending
        const pendingRequest = yield (0, db_1.default) `
      SELECT * FROM friends 
      WHERE user_id = ${friend_id} 
      AND friend_id = ${user_id}
      AND status = 'pending'
    `;
        if (pendingRequest.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No pending friend request found",
            });
        }
        // Update the friend request status to accepted
        const acceptedRequest = yield (0, db_1.default) `
      UPDATE friends
      SET status = 'accepted'
      WHERE user_id = ${friend_id}
      AND friend_id = ${user_id}
      RETURNING *
    `;
        res.status(200).json({
            success: true,
            message: "Friend request accepted",
            friendship: acceptedRequest[0],
        });
    }
    catch (error) {
        res.status(500).json({
            success: false,
            message: "Error accepting friend request",
            error: error.message,
        });
    }
});
exports.acceptFriendRequest = acceptFriendRequest;
