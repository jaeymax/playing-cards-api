import { Router, Request, Response } from "express";
import authMiddleware from "../middlewares/authMiddleware";
import sql from "../config/db";
import { initiateDeposit, initiateTransfer, verifyDeposit } from "../services/paystack";
import crypto from "crypto";
import expressAsyncHandler from "express-async-handler";

const router = Router();


router.get("/", authMiddleware, expressAsyncHandler(async (req, res) => {
  const wallet = await sql`
    SELECT balance, currency, updated_at
    FROM wallets
    WHERE user_id = ${req.user?.userId}
  `;
  res.status(200).json({ balance: wallet[0]?.balance, currency: wallet[0]?.currency });
}));

router.get('/transactions', authMiddleware, expressAsyncHandler(async (req: Request, res: Response): Promise<void> => {
  const transactions = await sql`
    SELECT id, amount, type, status, created_at
    FROM wallet_transactions
    WHERE user_id = ${req.user?.userId}
    ORDER BY created_at DESC
  `;

  if (transactions.length === 0) {
    res.status(200).json([]);
    return;
  }

  res.status(200).json(transactions);
}));

router.get('/deposit/verify-payment/:reference', expressAsyncHandler(async(req: Request, res: Response): Promise<void> => {
  const {reference} = req.params;

  // Here you would normally integrate with Paystack to verify the deposit using the reference
  const response = await verifyDeposit(reference);

  if (!response) {
     res.status(404).json({ error: "Deposit not found" });
     return;
  }

  console.log('verification data', response);
  res.json(response);
}));


router.post('/deposit', authMiddleware, expressAsyncHandler(async(req: Request, res: Response): Promise<void> => {
  const {amount} = req.body;
  const userId = req.user?.userId;
  // Here you would normally integrate with Paystack to create a payment link or initialize a transaction
  if(!amount || amount <= 0){
     res.status(400).json({error: "Invalid amount"});
     return;
  }

  const amountInPesewas = Math.round(amount * 100); // Convert to kobo
  const reference = `DEP-${Date.now()}_${userId}`

  await sql`
     INSERT INTO wallet_transactions (user_id, type, amount, reference, status, created_at)
     VALUES (${userId}, 'deposit', ${amount}, ${reference}, 'pending', NOW())
  `;

  const userEmail = await sql`SELECT email FROM users WHERE id = ${userId}`;

  const response = await initiateDeposit(userEmail[0]?.email, amount, reference, userId!);

  //console.log('response', response)

  res.status(200).json(response);
}));

router.post('/withdrawal', authMiddleware, expressAsyncHandler(async(req: Request, res: Response): Promise<void> => {
  const {amount} = req.body;

  if(!amount || amount <= 0){
     res.status(400).json({error: "Invalid amount"});
     return;
  }

  const wallet = await sql`
 SELECT balance, currency, updated_at
 FROM wallets
 WHERE user_id = ${req.user?.userId}`

  if (wallet[0].balance < amount){
     res.status(400).json({error: "Insufficient balance"});
     return;
  }

  const payout = await sql`SELECT recipient_code FROM payout_methods WHERE user_id = ${req.user?.userId}`;
  if(!payout || payout.length === 0){
     res.status(400).json({error: "No payout method found"});
     return;
  }



  const reference = crypto.randomUUID();

  // Deduct amount from wallet
  await sql`
     UPDATE wallets
     SET balance = balance - ${amount}, updated_at = NOW()
     WHERE user_id = ${req.user?.userId}
  `;
  
  // Create withdrawal record
  await sql`
     INSERT INTO wallet_transactions (user_id, type, amount, reference, status, created_at)
     VALUES (${req.user?.userId}, 'withdrawal', ${amount}, ${reference}, 'pending', NOW())
  `;

  // Here you would call Paystack API to initiate the transfer using the payout method details

  const transferResponse = await initiateTransfer(amount, payout[0].recipient_code, reference);
  console.log('transferResponse', transferResponse);
  if (!transferResponse || transferResponse.status !== 'success') {
     res.status(500).json({error: "Transfer initiation failed"});
     return;
  }

  // Placeholder response

  res.status(200).json({message: `Withdrawal of ${amount} initiated with reference ${reference}`, status: 'pending'});
})) 

export default router;