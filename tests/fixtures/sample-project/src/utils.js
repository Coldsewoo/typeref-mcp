"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
exports.formatUserName = formatUserName;
exports.calculateTotal = calculateTotal;
exports.validateEmail = validateEmail;
function formatUserName(user) {
    return `${user.name} <${user.email}>`;
}
function calculateTotal(products) {
    return products.reduce((sum, product) => sum + product.price, 0);
}
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}
class Logger {
    constructor(prefix = '') {
        this.prefix = prefix;
    }
    info(message) {
        console.log(`[INFO${this.prefix ? ` ${this.prefix}` : ''}] ${message}`);
    }
    error(message) {
        console.error(`[ERROR${this.prefix ? ` ${this.prefix}` : ''}] ${message}`);
    }
}
exports.Logger = Logger;
