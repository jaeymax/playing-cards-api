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
const express = require('express');
const router = express.Router();
const db_1 = __importDefault(require("../config/db"));
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const paystack_1 = require("../services/paystack");
const crypto = require('crypto');
const express_async_handler_1 = __importDefault(require("express-async-handler"));
router.post('/', authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { amount } = req.body;
    const wallet = yield (0, db_1.default) `
    SELECT balance, currency, updated_at
    FROM wallets
    WHERE user_id = ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.userId}`;
    if (wallet[0].balance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
    }
    const payout = yield (0, db_1.default) `SELECT recipient_code FROM payout_methods WHERE user_id = ${(_b = req.user) === null || _b === void 0 ? void 0 : _b.userId}`;
    if (!payout) {
        return res.status(400).json({ error: "No payout method found" });
    }
    const reference = crypto.randomUUID();
    // Deduct amount from wallet
    yield (0, db_1.default) `
        UPDATE wallets
        SET balance = balance - ${amount}, updated_at = NOW()
        WHERE user_id = ${(_c = req.user) === null || _c === void 0 ? void 0 : _c.userId}
     `;
    // Create withdrawal record
    yield (0, db_1.default) `
        INSERT INTO wallet_transactions (user_id, type, amount, reference, status, created_at)
        VALUES (${(_d = req.user) === null || _d === void 0 ? void 0 : _d.userId}, 'withdrawal', ${amount}, ${reference}, 'pending', NOW())
    `;
    // Here you would call Paystack API to initiate the transfer using the payout method details
    const transferResponse = yield (0, paystack_1.initiateTransfer)(amount, payout[0].recipient_code, reference);
    if (!transferResponse || transferResponse.status !== 'success') {
        return res.status(500).json({ error: "Transfer initiation failed" });
    }
    // Placeholder response
    res.status(200).json({ message: `Withdrawal of ${amount} initiated with reference ${reference}`, status: 'pending' });
})));
