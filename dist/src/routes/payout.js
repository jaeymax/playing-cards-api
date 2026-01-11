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
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const router = (0, express_1.Router)();
router.post('/', authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const { provider, account_number, account_name } = req.body;
    const bankCodes = {
        MTN: "MTN",
        VODAFONE: "VOD",
        AIRTELTIGO: "ATL"
    };
    try {
        const recipient = yield (0, paystack_1.createTransferRecipient)(account_name, account_number, bankCodes[provider]);
        yield (0, db_1.default) `
      INSERT INTO payout_methods
        (user_id, type, provider, account_number, account_name, recipient_code, created_at, updated_at)
      VALUES
        (${(_a = req.user) === null || _a === void 0 ? void 0 : _a.userId}, 'mobile_money', ${provider}, ${account_number}, ${account_name}, ${recipient.recipient_code}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET type = EXCLUDED.type,
          provider = EXCLUDED.provider,
          account_number = EXCLUDED.account_number,
          account_name = EXCLUDED.account_name,
          recipient_code = EXCLUDED.recipient_code,
          updated_at = NOW()
    `;
        res.json({ success: true });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ error: "Internal server error" });
    }
})));
router.get('/', authMiddleware_1.default, (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const payoutMethod = yield (0, db_1.default) `
      SELECT type, provider, account_number, account_name, recipient_code, created_at, updated_at
      FROM payout_methods
      WHERE user_id = ${(_a = req.user) === null || _a === void 0 ? void 0 : _a.userId}
    `;
    if (payoutMethod.length === 0) {
        res.status(404).json({ error: "No payout method found" });
        return;
    }
    res.json(payoutMethod[0]);
})));
exports.default = router;
