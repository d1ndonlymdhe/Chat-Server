"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const notificationSchema = new mongoose_1.Schema({
    type: String,
    to: String,
    from: String,
});
const Notification = mongoose_1.models.Notification || (0, mongoose_1.model)("Notification", notificationSchema);
exports.default = Notification;
