"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const friends_1 = require("../controllers/friends");
// https://expressjs.com/en/guide/routing.html
const router = (0, express_1.Router)();
router.get("/", friends_1.getFriends);
router.post("/add", friends_1.addFriend);
router.post("/accept", friends_1.acceptFriendRequest);
exports.default = router;
