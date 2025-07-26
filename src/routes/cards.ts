import { Router } from "express";
import { getAllCards, getCardById, getCardsBySuit } from "../controllers/cards";

const router = Router();

router.get("/", getAllCards);
router.get("/:id", getCardById);
router.get("/suit/:suit", getCardsBySuit);

export default router;
