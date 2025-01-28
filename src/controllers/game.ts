import { Request, Response } from "express";


const createGame = async(req: Request, res:Response) =>{

    res.json({message:"create Game controller"});
}


const joinGame = async(req: Request, res:Response) =>{
    res.json({message:"join Game controller"});
}

export {createGame, joinGame};