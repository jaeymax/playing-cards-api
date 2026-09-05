"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const friends_1 = require("../controllers/friends");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
// https://expressjs.com/en/guide/routing.html
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.default, friends_1.getFriends);
router.get("/requests", authMiddleware_1.default, friends_1.getFriendRequests);
router.get("/sent-requests", authMiddleware_1.default, friends_1.getSentFriendRequests);
router.get("/status/:friend_id", authMiddleware_1.default, friends_1.getFriendshipStatus);
router.get("/search", authMiddleware_1.default, friends_1.searchUsers);
router.post("/add", authMiddleware_1.default, friends_1.sendFriendRequest);
router.post("/accept", authMiddleware_1.default, friends_1.acceptFriendRequest);
router.post("/decline", authMiddleware_1.default, friends_1.declineFriendRequest);
router.post("/cancel", authMiddleware_1.default, friends_1.cancelFriendRequest);
router.post("/remove", authMiddleware_1.default, friends_1.removeFriend);
exports.default = router;
