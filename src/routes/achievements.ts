import {Router} from "express"
import { trackQrVisit } from "../controllers/analytics"

const router = Router()

router.get('/')
router.post('/qr-visit', trackQrVisit);

export default router