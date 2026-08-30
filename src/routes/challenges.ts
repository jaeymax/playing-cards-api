import {Router} from 'express';
import { createChallenge, getChallenges, cancelChallenge, settleCashChallenge,  acceptChallenge, getOpenChallenges } from '../controllers/challenges';
import authMiddleware from '../middlewares/authMiddleware';

const router = Router();

router.post('/', authMiddleware, createChallenge);
router.get('/', getChallenges);
router.get('/open', getOpenChallenges)
router.post('/accept', authMiddleware, acceptChallenge);
router.post('/cancel', authMiddleware, cancelChallenge);
router.post('/settle', settleCashChallenge)


export default router;