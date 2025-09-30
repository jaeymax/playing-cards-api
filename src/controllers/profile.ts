import { Request, Response } from "express";
import asyncHandler from "express-async-handler";
import sql from "../config/db";

interface File {
    fieldname: string;
    originalname: string;
    encoding: string;
    mimetype: string;
    size: number;
    destination: string;
    filename: string;
    path: string;
  }
  
interface AuthRequest extends Request {
  file?: File;
}

const uploadProfilePicture = asyncHandler(async (req: AuthRequest, res: Response) => {
    const userId = req.user?.userId;
    if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
    }

    const fileUrl = req.file.path; // URL of the uploaded file in Cloudinary
    await sql`UPDATE users SET image_url = ${fileUrl} WHERE id = ${userId}`;

    console.log("File uploaded successfully:", fileUrl);
    res.status(200).json({ success: true, fileUrl: fileUrl });
});

export {uploadProfilePicture}