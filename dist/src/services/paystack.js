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
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyDeposit = exports.initiateDeposit = exports.initiateTransfer = exports.createTransferRecipient = exports.paystack = void 0;
const __1 = require("..");
const axios = require("axios");
const PAYSTACK_SECRET = process.env.NODE_ENV === "production"
    ? process.env.PAYSTACK_LIVE_SECRET_KEY
    : process.env.PAYSTACK_TEST_SECRET_KEY;
exports.paystack = axios.create({
    baseURL: "https://api.paystack.co",
    headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        "Content-Type": "application/json",
    },
});
const createTransferRecipient = (name, account_number, bank_code) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield exports.paystack.post("/transferrecipient", {
        type: "mobile_money",
        name,
        account_number,
        bank_code,
        currency: "GHS",
    });
    return res.data.data; // contains recipient_code
});
exports.createTransferRecipient = createTransferRecipient;
const initiateTransfer = (amount, recipient, reference) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield exports.paystack.post("/transfer", {
        source: "balance",
        amount: Math.round(amount * 100), // GHS → pesewas
        recipient,
        reference,
    });
    console.log('response from initiateTransfer', res);
    return res.data.data;
});
exports.initiateTransfer = initiateTransfer;
const initiateDeposit = (email, amount, reference, user_id) => __awaiter(void 0, void 0, void 0, function* () {
    console.log('email', email, 'amount', amount, 'reference', reference);
    const res = yield exports.paystack.post("/transaction/initialize", {
        amount: Math.round(amount * 100), // GHS → pesewas
        email,
        currency: "GHS",
        reference,
        callback_url: `${__1.FRONTEND_URL}/deposit/success`,
        metadata: {
            user_id,
            purpose: "wallet_deposit"
        }
    });
    //console.log('response', res)
    console.log('callback_url', `${__1.FRONTEND_URL}/deposit/success`);
    return res.data.data; // contains authorization_url and reference
});
exports.initiateDeposit = initiateDeposit;
const verifyDeposit = (reference) => __awaiter(void 0, void 0, void 0, function* () {
    const res = yield exports.paystack.get(`/transaction/verify/${reference}`);
    return res.data.data; // contains transaction details
});
exports.verifyDeposit = verifyDeposit;
