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
const express_1 = __importDefault(require("express"));
const db_1 = __importDefault(require("../config/db"));
const express_async_handler_1 = __importDefault(require("express-async-handler"));
const router = express_1.default.Router();
router.get("/global", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const messages = yield (0, db_1.default) `
        SELECT 
            m.id,
            m.message as text,
            m.created_at as timestamp,
            u.id as sender_id,
            u.username as sender_name,
            u.image_url as avatar
        FROM global_chat_messages m
        JOIN users u ON m.user_id = u.id
        ORDER BY m.created_at ASC
    `;
    res.json(messages);
})));
router.post("/global", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { user_id, message } = req.body;
    yield (0, db_1.default) `insert into global_chat_messages (user_id, message) values (${user_id}, ${message})`;
    res.status(201).json({ message: "Message sent successfully" });
})));
router.get("/games/:code", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { code } = req.params;
    const messages = yield (0, db_1.default) `
        SELECT 
            m.id,
            m.message,
            m.created_at as timestamp,
            u.id as user_id,
            u.username,
            u.image_url as avatar
        FROM game_chat_messages m
        JOIN users u ON m.user_id = u.id
        WHERE m.game_code = ${code}
        ORDER BY m.created_at ASC
    `;
    res.json(messages);
})));
router.post("/game/:code", (0, express_async_handler_1.default)((req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const { code } = req.params;
    const { user_id, message } = req.body;
    yield (0, db_1.default) `insert into game_chat_messages (game_code, user_id, message) values (${code}, ${user_id}, ${message})`;
    res.status(201).json({ message: "Message sent successfully" });
})));
exports.default = router;
