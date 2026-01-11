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
const express_1 = require("express");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const db_1 = __importDefault(require("../config/db"));
const paystack_1 = require("../services/paystack");
const crypto_1 = __importDefault(require("crypto"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const router = (0, express_1.Router)();
router.get("/", authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const wallet = yield (0, db_1.default) `
    SELECT balance, currency, updated_at
    FROM wallets
    WHERE user_id = ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.userId}
  `;
    res.status(200).json({ balance: (_b = wallet[0]) === null || _b === void 0 ? void 0 : _b.balance, currency: (_c = wallet[0]) === null || _c === void 0 ? void 0 : _c.currency });
})));
router.get('/transactions', authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const transactions = yield (0, db_1.default) `
    SELECT id, amount, type, status, created_at
    FROM wallet_transactions
    WHERE user_id = ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.userId}
    ORDER BY created_at DESC
  `;
    if (transactions.length === 0) {
        res.status(200).json([]);
        return;
    }
    res.status(200).json(transactions);
})));
router.get('/deposit/verify-payment/:reference', (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { reference } = req.params;
    // Here you would normally integrate with Paystack to verify the deposit using the reference
    const response = yield (0, paystack_1.verifyDeposit)(reference);
    if (!response) {
        res.status(404).json({ error: "Deposit not found" });
        return;
    }
    console.log('verification data', response);
    res.json(response);
})));
router.post('/deposit', authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const { amount } = req.body;
    const userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId;
    // Here you would normally integrate with Paystack to create a payment link or initialize a transaction
    if (!amount || amount <= 0) {
        res.status(400).json({ error: "Invalid amount" });
        return;
    }
    const amountInPesewas = Math.round(amount * 100); // Convert to kobo
    const reference = `DEP-${Date.now()}_${userId}`;
    yield (0, db_1.default) `
     INSERT INTO wallet_transactions (user_id, type, amount, reference, status, created_at)
     VALUES (${userId}, 'deposit', ${amount}, ${reference}, 'pending', NOW())
  `;
    const userEmail = yield (0, db_1.default) `SELECT email FROM users WHERE id = ${userId}`;
    const response = yield (0, paystack_1.initiateDeposit)((_b = userEmail[0]) === null || _b === void 0 ? void 0 : _b.email, amount, reference, userId);
    //console.log('response', response)
    res.status(200).json(response);
})));
router.post('/withdrawal', authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    const { amount } = req.body;
    if (!amount || amount <= 0) {
        res.status(400).json({ error: "Invalid amount" });
        return;
    }
    const wallet = yield (0, db_1.default) `
 SELECT balance, currency, updated_at
 FROM wallets
 WHERE user_id = ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.userId}`;
    if (wallet[0].balance < amount) {
        res.status(400).json({ error: "Insufficient balance" });
        return;
    }
    const payout = yield (0, db_1.default) `SELECT recipient_code FROM payout_methods WHERE user_id = ${(_b = req.user) === null || _b === void 0 ? void 0 : _b.userId}`;
    if (!payout || payout.length === 0) {
        res.status(400).json({ error: "No payout method found" });
        return;
    }
    const reference = crypto_1.default.randomUUID();
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
    console.log('transferResponse', transferResponse);
    if (!transferResponse || transferResponse.status !== 'success') {
        res.status(500).json({ error: "Transfer initiation failed" });
        return;
    }
    // Placeholder response
    res.status(200).json({ message: `Withdrawal of ${amount} initiated with reference ${reference}`, status: 'pending' });
})));
exports.default = router;
