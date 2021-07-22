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
    timesJailed: Number,
    userLower: String,
    sentenceEnd: Date
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

client.on('join', (channel, username, s) => {
    if (s) {
        console.log(s, username);
        client.say(channel, "🚔 Warden, reporting for duty! 🚔")
    }
});

client.on('chat', (channel, userstate, message, self) => {
    if(self || !message.startsWith('!')) return;
    
    const args = message.slice(1).split(' ');
    const command = args.shift().toLowerCase();
   
    switch (command) {
        case "join": {
            if(!userstate.mod && (!userstate.badges || !userstate.badges.broadcaster)) {
                client.say(channel, "You don't have the authority to do that!");
                break;
            }

            if(args.length == 0) {
                client.say(channel, "Please specify a channel: !join <channel username>")
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
            if(!userstate.mod && (!userstate.badges || !userstate.badges.broadcaster)) {
                client.say(channel, "You don't have the authority to do that!");
                break;
            }
            if (args.length !== 2) {
                client.say(channel, "Please give me the name and sentence length! Length in s+m+h+d format. i.e. !jail mrsasians 4s20m");
                break;
            }

            let user = args[0].startsWith("@") ? args[0].substring(1) : args[0];
            let userLower = user.toLowerCase();
            let sentenceLength = getSeconds(args[1]);
            let sentenceEnd = Date.now() + (sentenceLength * 1000);
            let formattedDate = formatDate(sentenceEnd);

            if (sentenceLength === 0) {
                client.say(channel, "Invalid time format / sentence length of 0 is not allowed! Sentence length format example: 1s2m3h4d");
                break;
            }

            // Check if user is already in jail
            User.findOne({userLower: userLower}, (err, userFound) => {
                if (userFound && userFound.inJail) {
                    client.say(channel, `@${userFound.username} is already in jail!`);
                    return;
                } else if (userFound && !userFound.inJail) {
                    userFound.inJail = true;
                    userFound.timesJailed ++;
                    userFound.sentenceEnd = sentenceEnd;
                    userFound.save((err, product) => {
                        if (err) {
                            client.say(channel, "Error saving document!");
                            return;
                        }
                        client.say(channel, `@${userFound.username} has been sent back to jail! It's their ${ordinal_suffix_of(userFound.timesJailed)} offense! Their sentence will end ${formattedDate}`);
                    });
                } else {
                    let prisoner = new User({
                        username: user,
                        inJail: true,
                        timesJailed: 1,
                        userLower: userLower,
                        sentenceEnd: sentenceEnd
                    })
                    prisoner.save((err, prisoner) => {
                        if (err) {
                            client.say(channel, "Error saving document!");
                            return;
                        }
                        client.say(channel, `@${prisoner.username} has been sent to horny jail! Their sentence will end ${formattedDate}`);
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
            if(!userstate.mod && (!userstate.badges || !userstate.badges.broadcaster)) {
                client.say(channel, "You don't have the authority to do that!");
                break;
            }
            if (args.length == 0) {
                client.say(channel, "Please give me the name of the inmate!")
                break;
            }
            
            let q = args[0].startsWith("@") ? args[0].substring(1) : args[0];
            let qLower = q.toLowerCase();

            User.findOne({userLower: qLower}, (err, userFound) => {
                if (err) {
                    client.say(channel, "Error finding user...");
                    return;
                }
                if (!userFound) {
                    client.say(channel, "Can't find that user... looks like they haven't been in jail yet!");
                } else if (!userFound.inJail) {
                    client.say(channel, `@${userFound.username} isn't in jail... they've been good lately 😏`);
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

        case "addtime": {
            if(!userstate.mod && (!userstate.badges || !userstate.badges.broadcaster)) {
                client.say(channel, "You don't have the authority to do that!");
                break;
            }
            if (args.length !== 2) {
                client.say(channel, "Please give me the name and sentence length! Length in s+m+h+d format. i.e. !addtime mrsasians 6s9m");
                break;
            }

            let user = args[0].startsWith("@") ? args[0].substring(1) : args[0];
            let userLower = user.toLowerCase();
            let sentenceLength = getSeconds(args[1]);

            if (sentenceLength === 0) {
                client.say(channel, "Invalid time format / sentence length of 0 is not allowed! Sentence length format example: 1s2m3h4d");
                break;
            }

            // Check if user is already in jail
            User.findOne({userLower: userLower}, (err, userFound) => {
                if (!userFound || !userFound.inJail) {
                    client.say(channel, `@${userFound.username} is not in jail!`);
                    return;
                } else {
                    let newSentenceEnd = Date.parse(userFound.sentenceEnd) + (sentenceLength * 1000);
                    let formattedDate = formatDate(newSentenceEnd);

                    userFound.sentenceEnd = newSentenceEnd;
                    userFound.save((err, product) => {
                        if (err) {
                            client.say(channel, "Error saving document!");
                            return;
                        }
                        client.say(channel, `@${userFound.username}'s sentence will end ${formattedDate}`);
                    });
                }
            });

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

function getSeconds(str) {
    var seconds = 0;
    var secondsMatch = str.match(/(\d+)\s*s/);
    var days = str.match(/(\d+)\s*d/);
    var hours = str.match(/(\d+)\s*h/);
    var minutes = str.match(/(\d+)\s*m/);
    if (secondsMatch) { seconds += parseInt(secondsMatch); }
    if (days) { seconds += parseInt(days[1])*86400; }
    if (hours) { seconds += parseInt(hours[1])*3600; }
    if (minutes) { seconds += parseInt(minutes[1])*60; }
    return seconds;
  }

function formatDate(dateInput) {
    return new Date(dateInput).toLocaleString("en-us",{timeZone: "America/New_York"}) + " EST";
}