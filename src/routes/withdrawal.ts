const express = require('express');
const router = express.Router();
import sql from "../config/db";
import authMiddleware from "../middlewares/authMiddleware";
import { initiateTransfer } from "../services/paystack";
const crypto = require('crypto');
import expressAsyncHandler from "express-async-handler";


router.post('/', authMiddleware, expressAsyncHandler(async(req:any, res:any) => {
     const {amount} = req.body;

     const wallet = await sql`
    SELECT balance, currency, updated_at
    FROM wallets
    WHERE user_id = ${req.user?.userId}`

     if (wallet[0].balance < amount){
        return res.status(400).json({error: "Insufficient balance"});
     }

     const payout = await sql`SELECT recipient_code FROM payout_methods WHERE user_id = ${req.user?.userId}`
     if(!payout){
        return res.status(400).json({error: "No payout method found"});
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
     if (!transferResponse || transferResponse.status !== 'success') {
         return res.status(500).json({error: "Transfer initiation failed"});
     }

     // Placeholder response

     res.status(200).json({message: `Withdrawal of ${amount} initiated with reference ${reference}`, status: 'pending'});
})) 