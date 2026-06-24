"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const users_1 = require("../controllers/users");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const router = (0, express_1.Router)();
// Protected route for getting own profile - should come first
router.get("/me", authMiddleware_1.default, users_1.getUserProfile);
router.get('/', users_1.getUsers);
// Generic routes for any user ID - should come after specific routes
router.get("/:id", users_1.getUserProfile);
router.patch("/:id", authMiddleware_1.default, users_1.updateUserProfile);
exports.default = router;
