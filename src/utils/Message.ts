import { Schema, model, models } from "mongoose";
import mongoose from "mongoose";
const messageSchema = new Schema({
    to: String,
    from: String,
    roomId: String,
    content: String,
})

const Message = models.Message || model("Message", messageSchema);
export default Message;