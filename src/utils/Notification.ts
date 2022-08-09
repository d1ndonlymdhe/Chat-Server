import { Schema, model, models } from "mongoose";
const notificationSchema = new Schema({
    type: String,
    to: String,
    from: String,
})

const Notification = models.Notification || model("Notification", notificationSchema);
export default Notification;