"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_TIMEOUT = exports.API_BASE_URL = exports.Status = exports.UserService = void 0;
class UserService {
    constructor() {
        this.users = [];
    }
    async createUser(user) {
        const newUser = {
            id: this.users.length + 1,
            ...user
        };
        this.users.push(newUser);
        return newUser;
    }
    async getUserById(id) {
        return this.users.find(user => user.id === id) || null;
    }
    async getAllUsers() {
        return this.users.filter(user => user.isActive);
    }
}
exports.UserService = UserService;
var Status;
(function (Status) {
    Status["PENDING"] = "pending";
    Status["APPROVED"] = "approved";
    Status["REJECTED"] = "rejected";
})(Status || (exports.Status = Status = {}));
exports.API_BASE_URL = 'https://api.example.com';
exports.DEFAULT_TIMEOUT = 5000;
