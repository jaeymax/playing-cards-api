import { TwilioClient } from "../config/twilio";


export async function sendSMS(to:string, message:string){
    try{
        const response = await TwilioClient.messages.create({
            body:message,
            from: process.env.TWILIO_PHONE_NUMBER,
            to,
        })

        response;
        console.log('sms response', response);
    }catch(error){
       console.error('SMS error:', error);
    }
}