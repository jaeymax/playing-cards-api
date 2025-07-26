import { Request, Response } from "express";
import sql from "../config/db";
import asyncHandler from "express-async-handler";

export const getAllCards = asyncHandler(async (req: Request, res: Response) => {
  const cards = await sql`
    SELECT * FROM cards 
    ORDER BY suit, value
  `;
  res.json(cards);
});

export const getCardById = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const card = await sql`
    SELECT * FROM cards 
    WHERE card_id = ${id}
  `;

  if (card.length === 0) {
    res.status(404);
    throw new Error("Card not found");
  }

  res.json(card[0]);
});

export const getCardsBySuit = asyncHandler(
  async (req: Request, res: Response) => {
    const { suit } = req.params;
    const cards = await sql`
    SELECT * FROM cards 
    WHERE suit = ${suit}
    ORDER BY value
  `;
    res.json(cards);
  }
);
