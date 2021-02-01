const tmi = require('tmi.js');
require('dotenv').config();
const mongoose = require('mongoose');
const { Schema } = mongoose;
mongoose.connect(`mongodb+srv://kyouko:${process.env.MONGODB_PASS}@cluster0.pc41u.mongodb.net/hjail?retryWrites=true&w=majority`, {useNewUrlParser: true, useUnifiedTopology: true});


const db = mongoose.connection;
db.on('error', console.error.bind(console, 'mongodb connection error:'));
db.once('open', () => {
    console.log("successfully connected to mongodb!");
});

const userSchema = new Schema({
    username: String,
    inJail: Boolean,
    timesJailed: Number
})

const User = mongoose.model('User', userSchema);

const client = new tmi.Client({
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: 'strawbybot',
        password: process.env.TWITCH_OAUTH_TOKEN
    },
    channels: ['kyoukopan']
});

client.connect();

client.on('connected', (address, port) => {
    console.log(`Connected to: ${address}:${port}`)
})

client.on('join', (channel, username, self) => {
    if (self) {
        client.say(channel, "🚔 Warden, reporting for duty! 🚔")
    }
});

client.on('chat', (channel, userstate, message, self) => {
    if(self || !message.startsWith('!')) return;
    
    const args = message.slice(1).split(' ');
    const command = args.shift().toLowerCase();
    
    switch (command) {
        case "join": {
            if(args.length == 0) {
                break;
            }
            
            client.join(args[0]).then((data) => {
                client.say(channel, data + " joined!");
            }).catch((err) => {
                client.say(channel, err);
            });
            break;
        }
        case "jail": {
            if (args.length == 0) {
                client.say(channel, "Please give me the name of the perpetrator!")
                break;
            }

            let user = args[0];
            // Check if user is already in jail
            User.findOne({username: user}, (err, userFound) => {
                if (userFound && userFound.inJail) {
                    client.say(channel, `@${userFound.username} is already in jail!`);
                    return;
                } else if (userFound && !userFound.inJail) {
                    userFound.inJail = true;
                    userFound.timesJailed ++;
                    userFound.save((err, product) => {
                        if (err) {
                            client.say(channel, "Error saving document!");
                            return;
                        }
                        client.say(channel, `@${userFound.username} has been sent back to jail! It's their ${ordinal_suffix_of(userFound.timesJailed)} offense!`);
                    });
                } else {
                    let prisoner = new User({
                        username: user,
                        inJail: true,
                        timesJailed: 1
                    })
                    prisoner.save((err,prisoner) => {
                        if (err) {
                            client.say(channel, "Error saving document!");
                            return;
                        }
                        client.say(channel, `@${user} has been sent to horny jail!`);
                    });
                }
            });

            break;
        }

        case "rollcall": {
            User.find({inJail: true}, (err, prisoners) => {
                if (err) {
                    client.say(channel, "Error finding prisoners!");
                } else if (prisoners.length === 0) {
                    client.say(channel, "There's nobody in jail today!");
                } else {
                    let str = " ";
                    for (let i = 0; i < prisoners.length; i++) {
                        str += "@" + prisoners[i].username + " ("
                        + ordinal_suffix_of(prisoners[i].timesJailed) + " offense)";
                        if (i < prisoners.length - 1) {
                            str += " | "
                        }
                    }
                    client.say(channel, "Currently in horny jail:" + str + "! 🔒");
                }
            });
            break;
        }

        case "release": {
            if (args.length == 0) {
                client.say(channel, "Please give me the name of the inmate!")
                break;
            }
            let q = args[0];
            User.findOne({username: q}, (err, userFound) => {
                if (err) {
                    client.say(channel, "Error finding user...");
                    return;
                }
                if (!userFound) {
                    client.say(channel, "Can't find that user... looks like they haven't been in jail yet!");
                } else if (!userFound.inJail) {
                    client.say(channel, `@${userFound.username} isn't in jail... they've been good lately O_O`);
                } else {
                    userFound.inJail = false;
                    userFound.save((err, product) => {
                        if (err) {
                            client.say(channel, "Error updating record!");
                            return;
                        }
                        client.say(channel, `@${userFound.username} has been released from jail!`);
                    });
                }
            })
        break;
        }
    }
});

function ordinal_suffix_of(i) {
    var j = i % 10,
        k = i % 100;
    if (j == 1 && k != 11) {
        return i + "st";
    }
    if (j == 2 && k != 12) {
        return i + "nd";
    }
    if (j == 3 && k != 13) {
        return i + "rd";
    }
    return i + "th";
}