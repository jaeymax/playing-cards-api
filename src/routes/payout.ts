import { Router } from "express";
import authMiddleware from "../middlewares/authMiddleware";
import sql from "../config/db";
import { createTransferRecipient } from "../services/paystack";
import expressAsyncHandler from "express-async-handler";

const router = Router();


router.post('/', authMiddleware, expressAsyncHandler(async (req, res) => {
    const {provider, account_number, account_name}: { provider: keyof typeof bankCodes; account_number: string; account_name: string } = req.body;

    const bankCodes = {
        MTN: "MTN",
        VODAFONE: "VOD",
        AIRTELTIGO: "ATL"
    }

    try{
    const recipient = await createTransferRecipient(
        account_name,
        account_number,
        bankCodes[provider]
    );

    await sql`
      INSERT INTO payout_methods
        (user_id, type, provider, account_number, account_name, recipient_code, created_at, updated_at)
      VALUES
        (${req.user?.userId}, 'mobile_money', ${provider}, ${account_number}, ${account_name}, ${recipient.recipient_code}, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET type = EXCLUDED.type,
          provider = EXCLUDED.provider,
          account_number = EXCLUDED.account_number,
          account_name = EXCLUDED.account_name,
          recipient_code = EXCLUDED.recipient_code,
          updated_at = NOW()
    `;

        res.json({success: true});
    } catch (error) {
        console.error(error);
        res.status(500).json({error: "Internal server error"});
    }
}));

router.get('/', authMiddleware, expressAsyncHandler(async (req, res): Promise<void> => {
    const payoutMethod = await sql`
      SELECT type, provider, account_number, account_name, recipient_code, created_at, updated_at
      FROM payout_methods
      WHERE user_id = ${req.user?.userId}
    `;

    if (payoutMethod.length === 0) {
        res.status(404).json({error: "No payout method found"});
        return;
    }

    res.json(payoutMethod[0]);
}));


export default router;