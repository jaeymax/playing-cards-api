"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const globals_1 = require("@jest/globals");
(0, globals_1.describe)('hello', () => {
    (0, globals_1.it)('hey', () => {
        (0, globals_1.expect)('hello world').toBeTruthy();
    });
});
