"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const analytics_1 = require("../controllers/analytics");
const router = (0, express_1.Router)();
router.post('/qr-visit', analytics_1.trackQrVisit);
exports.default = router;
