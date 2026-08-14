import {Router} from 'express';
import { createChallenge, getChallenges, cancelChallenge, settleCashChallenge,  acceptChallenge } from '../controllers/challenges';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.post('/create', createChallenge);
router.get('/', getChallenges);
router.post('/accept', authMiddleware, acceptChallenge);
router.post('/cancel', authMiddleware, cancelChallenge);
router.post('/settle', settleCashChallenge)


export default router;