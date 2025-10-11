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
exports.getCardsBySuit = exports.getCardById = exports.getAllCards = void 0;
const db_1 = __importDefault(require("../config/db"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
exports.getAllCards = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const cards = yield (0, db_1.default) `
    SELECT * FROM cards 
    ORDER BY suit, value
  `;
    res.json(cards);
}));
exports.getCardById = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { id } = req.params;
    const card = yield (0, db_1.default) `
    SELECT * FROM cards 
    WHERE card_id = ${id}
  `;
    if (card.length === 0) {
        res.status(404);
        throw new Error("Card not found");
    }
    res.json(card[0]);
}));
exports.getCardsBySuit = (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { suit } = req.params;
    const cards = yield (0, db_1.default) `
    SELECT * FROM cards 
    WHERE suit = ${suit}
    ORDER BY value
  `;
    res.json(cards);
}));
