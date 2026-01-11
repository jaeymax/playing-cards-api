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
const express = require("express");
const router = express.Router();
const db_1 = __importDefault(require("../config/db"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
router.post('/paystack', express.raw({ type: "application/json" }), (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('Paystack webhook received.');
    const signature = req.headers['x-paystack-signature'];
    console.log('request headers', req.headers['x-paystack-signature']);
    console.log('request body event', req.body.event);
    console.log('request body', req.body);
    const PAYSTACK_SECRET = process.env.NODE_ENV === 'production' ? process.env.PAYSTACK_LIVE_SECRET_KEY : process.env.PAYSTACK_TEST_SECRET_KEY;
    const hash = require('crypto').createHmac('sha512', PAYSTACK_SECRET).update(req.body).digest('hex');
    if (hash !== signature) {
        return res.status(401).json({ message: 'Invalid signature.' });
    }
    const body = JSON.parse(req.body.toString());
    //const event = req.body.event
    //console.log('event', event);
    if (body.event === 'transfer.success') {
        const transferData = body.data;
        const reference = transferData.reference;
        // Update the withdrawal status in the database
        yield (0, db_1.default) `
            UPDATE wallet_transactions
            SET status = 'completed', updated_at = NOW(), type = 'withdrawal'
            WHERE reference = ${reference}
        `;
        console.log(`Withdrawal with reference ${reference} marked as completed.`);
    }
    if (body.event === "transfer.failed") {
        const transferData = body.data;
        const reference = transferData.reference;
        // Update the withdrawal status in the database
        yield (0, db_1.default) `
            UPDATE wallet_transactions
            SET status = 'failed', updated_at = NOW(), type = 'refund'
            WHERE reference = ${reference}
        `;
        console.log(`Withdrawal with reference ${reference} marked as failed.`);
    }
    if (body.event == "charge.success") {
        console.log('Deposit successful webhook received.');
        const { reference, amount, metadata } = body.data;
        const user_id = metadata.user_id;
        const amountInGHS = amount / 100; // Convert pesewas to GHS
        const transaction = yield (0, db_1.default) `
            SELECT id, status
            FROM wallet_transactions
            WHERE reference = ${reference} AND user_id = ${user_id}
        `;
        if (transaction.length === 0) {
            console.log(`No transaction found with reference ${reference} for user ${user_id}.`);
            return res.status(404).json({ message: 'Transaction not found.' });
        }
        if (transaction[0].status === 'completed') {
            console.log(`Transaction with reference ${reference} for user ${user_id} is already completed.`);
            return res.status(200).json({ message: 'Transaction already completed.' });
        }
        yield (0, db_1.default) `update wallets
            set balance = balance + ${amountInGHS}, updated_at = NOW()
            where user_id = ${user_id}
        `;
        yield (0, db_1.default) `
            UPDATE wallet_transactions
            SET status = 'completed', updated_at = NOW()
            WHERE reference = ${reference} AND user_id = ${user_id}
        `;
        console.log(`Deposit with reference ${reference} for user ${user_id} marked as completed.`);
    }
    res.status(200).json({ message: 'Webhook received.' });
})));
exports.default = router;
