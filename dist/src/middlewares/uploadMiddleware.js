"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");
const path_1 = __importDefault(require("path"));
function uploadMiddleware(folderName) {
    const storage = new CloudinaryStorage({
        cloudinary: cloudinary,
        params: (req, file) => {
            const folderPath = `${folderName.trim()}`; // Update the folder path here
            const fileExtension = path_1.default.extname(file.originalname).substring(1);
            const publicId = `${file.fieldname}-${Date.now()}`;
            return {
                folder: folderPath,
                public_id: publicId,
                format: fileExtension,
            };
        },
    });
    return multer({
        storage: storage,
        limits: {
            fileSize: 5 * 1024 * 1024, // keep images size < 5 MB
        },
    });
}
exports.default = uploadMiddleware;
