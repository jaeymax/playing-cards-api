"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const friends_1 = require("../controllers/friends");
const router = (0, express_1.Router)();
router.get('/', friends_1.getFriends);
router.post('/add', friends_1.addFriend);
exports.default = router;
