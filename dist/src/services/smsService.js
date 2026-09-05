"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendSMS = sendSMS;
exports.sendTournamentNotification = sendTournamentNotification;
const db_1 = __importDefault(require("../config/db"));
const url = 'https://sms.arkesel.com/api/v2/sms/send';
function sendSMS(to, message) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': `${process.env.ARKESEL_API_KEY}`
                },
                body: JSON.stringify({
                    'sender': "SPARPLAY",
                    'message': message,
                    'recipients': [to]
                })
            });
            const data = yield response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Failed to send SMS');
            }
            response;
            console.log('sms response data', data);
        }
        catch (error) {
            console.error('SMS error:', error);
        }
    });
}
function sendTournamentNotification(tournamentName) {
    return __awaiter(this, void 0, void 0, function* () {
        // select all users with phone numbers and send them a notification about the tournament
        try {
            const users = yield (0, db_1.default) `
            SELECT username, phone FROM users WHERE phone IS NOT NULL
        `;
            for (const user of users) {
                const messageTemplate = `Hi ${user.username}, New tournament "${tournamentName}" is now open for registration! Join now and compete for glory!`;
                yield sendSMS(user.phone, messageTemplate);
            }
        }
        catch (error) {
            console.error('Error sending tournament notifications:', error);
        }
    });
}
