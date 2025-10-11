"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const cards_1 = require("../controllers/cards");
const router = (0, express_1.Router)();
router.get("/", cards_1.getAllCards);
router.get("/:id", cards_1.getCardById);
router.get("/suit/:suit", cards_1.getCardsBySuit);
exports.default = router;
