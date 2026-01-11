const express = require("express");
const router = express.Router();
import sql from "../config/db";
import expressAsyncHandler from "express-async-handler";


router.post('/paystack', express.raw({type:"application/json"}), expressAsyncHandler(async (req:any, res:any) => {
    console.log('Paystack webhook received.');
    const signature = req.headers['x-paystack-signature'];
    console.log('request headers', req.headers['x-paystack-signature']);
    console.log('request body event', req.body.event);
    console.log('request body', req.body);
    const PAYSTACK_SECRET = process.env.NODE_ENV === 'production' ? process.env.PAYSTACK_LIVE_SECRET_KEY : process.env.PAYSTACK_TEST_SECRET_KEY;

    const hash = require('crypto').createHmac('sha512', PAYSTACK_SECRET).update(req.body).digest('hex');

    if(hash !== signature){
        return res.status(401).json({ message: 'Invalid signature.' });
    }

    const body = JSON.parse(req.body.toString());
    //const event = req.body.event
    //console.log('event', event);

    if (body.event === 'transfer.success') {
        const transferData = body.data;
        const reference = transferData.reference;

        // Update the withdrawal status in the database
        await sql`
            UPDATE wallet_transactions
            SET status = 'completed', updated_at = NOW(), type = 'withdrawal'
            WHERE reference = ${reference}
        `;

        console.log(`Withdrawal with reference ${reference} marked as completed.`);
    }


    if(body.event === "transfer.failed"){
        const transferData = body.data;
        const reference = transferData.reference;

        // Update the withdrawal status in the database
        await sql`
            UPDATE wallet_transactions
            SET status = 'failed', updated_at = NOW(), type = 'refund'
            WHERE reference = ${reference}
        `;

        console.log(`Withdrawal with reference ${reference} marked as failed.`);
    }

    if(body.event == "charge.success"){
        console.log('Deposit successful webhook received.');
        const {reference, amount, metadata} = body.data;
        const user_id = metadata.user_id;

        const amountInGHS = amount / 100; // Convert pesewas to GHS

        const transaction = await sql`
            SELECT id, status
            FROM wallet_transactions
            WHERE reference = ${reference} AND user_id = ${user_id}
        `;

        if(transaction.length === 0){
            console.log(`No transaction found with reference ${reference} for user ${user_id}.`);
            return res.status(404).json({ message: 'Transaction not found.' });
        }

        if(transaction[0].status === 'completed'){
            console.log(`Transaction with reference ${reference} for user ${user_id} is already completed.`);
            return res.status(200).json({ message: 'Transaction already completed.' });
        }
        

        await sql`update wallets
            set balance = balance + ${amountInGHS}, updated_at = NOW()
            where user_id = ${user_id}
        `;

        await sql`
            UPDATE wallet_transactions
            SET status = 'completed', updated_at = NOW()
            WHERE reference = ${reference} AND user_id = ${user_id}
        `;

        console.log(`Deposit with reference ${reference} for user ${user_id} marked as completed.`);

    }

    res.status(200).json({ message: 'Webhook received.' });
    
}));

export default router;