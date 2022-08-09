"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const messageSchema = new mongoose_1.Schema({
    to: String,
    from: String,
    roomId: String,
    content: String,
});
const Message = mongoose_1.models.Message || (0, mongoose_1.model)("Message", messageSchema);
exports.default = Message;
