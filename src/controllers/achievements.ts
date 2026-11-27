import { NextFunction, Request, Response } from "express";
import asyncHandler = require("express-async-handler");

const getAchievements = asyncHandler(async (req: Request, res:Response) => {

})

const createAchievement = asyncHandler(async (req: Request, res: Response) =>{

})

const updateAchievement = asyncHandler((req: Request, res: Response) => {

})

export {
    getAchievements,
    createAchievement,
    updateAchievement
}