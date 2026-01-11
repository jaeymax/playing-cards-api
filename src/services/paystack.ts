import { FRONTEND_URL } from "..";

const axios = require("axios");

const PAYSTACK_SECRET = process.env.NODE_ENV === "production"
  ? process.env.PAYSTACK_LIVE_SECRET_KEY
  : process.env.PAYSTACK_TEST_SECRET_KEY;

export const paystack = axios.create({
  baseURL: "https://api.paystack.co",
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET}`,
    "Content-Type": "application/json",
  },
});


const createTransferRecipient = async (name:string, account_number: string, bank_code:string) => {
    const res = await paystack.post("/transferrecipient", {
      type: "mobile_money",
      name,
      account_number,
      bank_code,
      currency: "GHS",
    });

    return res.data.data; // contains recipient_code
}


const initiateTransfer = async (amount:number, recipient:string, reference: string) =>{
        const res = await paystack.post("/transfer", {
      source: "balance",
      amount: Math.round(amount * 100), // GHS → pesewas
      recipient,
      reference,
    });
   console.log('response from initiateTransfer', res);


    return res.data.data;
}

const initiateDeposit = async (email:string, amount:number, reference:string, user_id:number ) => {
  console.log('email', email, 'amount', amount, 'reference', reference)
    const res = await paystack.post("/transaction/initialize", {
      amount: Math.round(amount * 100), // GHS → pesewas
      email,
      currency: "GHS",
      reference,
      callback_url: `${FRONTEND_URL}/deposit/success`,
      metadata:{
        user_id,
        purpose: "wallet_deposit"
      }
    });

    //console.log('response', res)
    console.log('callback_url', `${FRONTEND_URL}/deposit/success`)
    return res.data.data; // contains authorization_url and reference
}

const verifyDeposit = async (reference:string) => {
    const res = await paystack.get(`/transaction/verify/${reference}`);
    return res.data.data; // contains transaction details
}

export {createTransferRecipient, initiateTransfer, initiateDeposit, verifyDeposit}