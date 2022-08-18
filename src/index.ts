import express from "express";
import { createServer } from "http";
import { Server, Socket } from "socket.io";
import crypto from "crypto"
import User from "./utils/User";
import Message from "./utils/Message";
import Notification from "./utils/Notification";
import {user as dbUserType, user} from "./utils/type"

import mongoose from "mongoose";
//setup dotenv
import dotenv from "dotenv";
dotenv.config();
const mongoURI = "mongodb://127.0.0.1:27017/instagram";


const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    }
});

app.get("/", (req, res) => {
    res.send("ok")
})

type username = string;
type userSocket = {
    username: username;
    socket: Socket;
}
type roomType = {
    members: userSocket[];
    roomId: string;
}
const connectedUsers: Set<userSocket> = new Set();
const rooms: Set<roomType> = new Set();

io.on("connection", (socket: Socket) => {
    console.log("a user connected")
    socket.on("subscribe", (payload: { username: username }) => {
        const user: userSocket = {
            username: payload.username,
            socket: socket,
        }
        connectedUsers.add(user)
        console.log(`${payload.username} subscribed`)
        // console.log(connectedUsers);
    })
    socket.on("createRoom", (payload: { self: username, reciever: username }) => {
        let { self, reciever } = payload;
        const members = [self, reciever];
        console.log("members = ", members)
        if (members.length < 2) {
            socket.emit("roomCreateError", { status: "error", message: "not enough members" });
        } else {
            //get all member sockets
            const memberSockets = members.map(member => {
                const memberSocket = findFromSet<userSocket>((user) => { return user.username == member }, connectedUsers)!;
                return memberSocket;
            })
            //check all connected;
            const allConnected = members.filter(member => {
                return findFromSet<userSocket>((user) => { return user.username == member }, connectedUsers) !== undefined;
            }).length == members.length
            const roomId = sha256(members.join("") + (new Date().getTime()));
            if (allConnected) {
                const room = {
                    members: memberSockets,
                    roomId: roomId,
                }
                rooms.add(room)
                console.log(rooms);
                emitAll("roomCreated", { status: "success", roomId: roomId, members: members }, room)
            } else {
                socket.emit("room creation error", { message: `${reciever} not connected` })
            }
        }
    })
    socket.on("joinRooms", (payload: { roomIds: string[], username: string }) => {
        const roomsToBeConnected = findMultipleFromSet<roomType>((room) => { return payload.roomIds.includes(room.roomId) }, rooms)!;
        if (roomsToBeConnected) {
            roomsToBeConnected.forEach(room => {
                const members = room.members.map(member => member.username);
                if (!members.includes(payload.username)) {
                    console.log(`${payload.username} joined ${room.roomId}`)
                    room.members.push({ username: payload.username, socket: socket })
                    socket.emit("roomCreated", { status: "success", roomId: room.roomId, members: members })
                }
            })
        }
    })

    socket.on("message", (payload: { to: username, from: username, message: string, roomId: string }) => {
        const { roomId, to, from, message } = payload;
        console.log("message payload = ", payload);
        const room = findFromSet<roomType>((room) => { return room.roomId == roomId }, rooms);

        if (room) {
            const recieverConnected = findFromSet<userSocket>((user) => { return user.username == to }, connectedUsers) !== undefined;
            if (recieverConnected) {
                emitAll("newMessage", payload, room);
            } else {
                mongoose.connect(mongoURI).then(() => {
                    const newMessage = new Message();
                    newMessage.to = to;
                    newMessage.from = from;
                    newMessage.roomId = roomId;
                    newMessage.content = message;
                    newMessage.save().then(() => {
                        User.findOne({ username: to }).then((user) => {
                            user.pendingMessages.push(newMessage._id);
                            user.save()
                        })
                    })
                })
                emitAll("newMessage", payload, room);
            }
        } else {
            socket.emit("Message Error", { status: "error", message: "room not found" })
        }
    })
    socket.on("disconnect", () => {
        const delThis = findFromSet<userSocket>((user) => { return user.socket === socket }, connectedUsers);
        const connectedRooms = findMultipleFromSet<roomType>((room) => {
            try {
                const mappedMembers = room.members.map(member => { return member.socket });
                return mappedMembers.includes(socket)
            } catch (err) {
                return false;
            }
        }, rooms);
        connectedRooms.forEach(connectedRoom => {
            connectedRoom.members = connectedRoom.members.filter(member => {
                return member.socket !== socket;
            })
        })
        if (delThis) {
            connectedUsers.delete(delThis)
        }
    })
    socket.on("spawnFollowNotification",(payload:{to:username,from:username})=>{
        const {to,from}=payload;
        const user=findFromSet<userSocket>((user)=>{return user.username==to},connectedUsers);
        if(user){
            user.socket.emit("newFollow",{from:from});
        }else{
            mongoose.connect(mongoURI).then(()=>{
                const newNotification = new Notification();
                newNotification.to = to;
                newNotification.from = from;
                newNotification.type = "follow";
                newNotification.save().then(()=>{
                    User.findOne({username:to}).then((user)=>{
                        user.pendingNotifications.push(newNotification._id);
                        user.save()
                    })
                })
            })
        }
    })
    socket.on("spawnUnFollowNotification",(payload:{to:username,from:username})=>{
        const {to,from}=payload;
        const user=findFromSet<userSocket>((user)=>{return user.username==to},connectedUsers);
        if(user){
            user.socket.emit("newUnFollow",{from:from});
        }else{
            mongoose.connect(mongoURI).then(()=>{
                const newNotification = new Notification();
                newNotification.to = to;
                newNotification.from = from;
                newNotification.type = "unFollow";
                newNotification.save().then(()=>{
                    User.findOne({username:to}).then((user)=>{
                        user.pendingNotifications.push(newNotification._id);
                        user.save()
                    })
                })
            })
        }
    })
})

httpServer.listen(4000)
function findFromSet<T>(callback: (arg1: T) => boolean, set: Set<T>) {
    const iterable = set.values();
    for (const el of iterable) {
        if (callback(el)) {
            return el;
        }
    }
    return undefined
}
function findMultipleFromSet<T>(callback: (arg1: T) => boolean, set: Set<T>) {
    const iterable = set.values();
    const retArr: T[] = []
    for (const el of iterable) {
        if (callback(el)) {
            retArr.push(el)
        }
    }
    return retArr;
}
function emitAll(event: string, message: Object, room: roomType) {
    room.members.forEach(member => {
        console.log("emmitting for ", member.username);
        member.socket.emit(event, message)
    })
}

//sha-256 fucntion
function sha256(data: string) {
    //@ts-ignore
    const hash = crypto.createHash("sha256");
    hash.update(data);
    return hash.digest("hex");
}