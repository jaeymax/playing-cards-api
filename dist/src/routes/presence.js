"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const presence_1 = require("../controllers/presence");
const optionalAuthMiddleware_1 = __importDefault(require("../middlewares/optionalAuthMiddleware"));
const router = express_1.default.Router();
router.get("/online", presence_1.getOnlineUsers);
router.get("/online/count", presence_1.getOnlineUserCountController);
router.get('/online-users', optionalAuthMiddleware_1.default, presence_1.getOnlineUsersWithStatusController);
exports.default = router;
