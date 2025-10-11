"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uploadMiddleware_1 = __importDefault(require("../middlewares/uploadMiddleware"));
const profile_1 = require("../controllers/profile");
const authMiddleware_1 = __importDefault(require("../middlewares/authMiddleware"));
const router = (0, express_1.Router)();
const upload = (0, uploadMiddleware_1.default)("profile_pictures");
router.post("/upload", authMiddleware_1.default, upload.single("file"), profile_1.uploadProfilePicture);
exports.default = router;
