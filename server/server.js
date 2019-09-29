const tmi = require('tmi.js');
const moment = require('moment');
const firebase = require('firebase');
const axios = require('axios');

require('dotenv').config();

// Define configuration options
const opts = {
  identity: {
    username: process.env.BOT_USERNAME,
    password: process.env.BOT_OAUTH_TOKEN
  },
  channels: process.env.CHANNELS.split(',')
};

const firebaseConfig = {
  apiKey: "AIzaSyDv6i7nYS6a5D6tz_zTrj5195k0JxGXoo8",
  authDomain: "twitchcon2019-e9aa5.firebaseapp.com",
  databaseURL: "https://twitchcon2019-e9aa5.firebaseio.com",
  projectId: "twitchcon2019-e9aa5",
  storageBucket: "twitchcon2019-e9aa5.appspot.com",
  messagingSenderId: "377449298415",
  appId: "1:377449298415:web:379e88a1629932f5915e1a"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Create a client with our options
const client = new tmi.client(opts);

// Register our event handlers (defined below)
client.on('message', onMessageHandler);
client.on('connected', onConnectedHandler);

// Connect to Twitch:
client.connect();

// In-memory hype info
let hypeInfo = {};

function setInitialVariables(user) {
  hypeInfo[user] = {
    // Interval of time to read messages for
    intervalSecondsLength: 5,
    // Messages over average to trigger hype moment
    hypeDifferential: 10,
    // Intervals before another hype moment can get called
    hypeCooldownIntervalCount: 2,
    // Intervals since last hype moment
    intervalSinceLastHype: 0,
    // Total messages being used for the average
    totalMessages: 0,
    // Number of intervals being used for the average
    numAverages: 0,
    // Timestamp of the most recent interval's end
    intervalEnd: null,
    // Messages in the current interval
    messagesInCurrentInterval: 0
  }
};

// triggerHypeMoment("#gamesdonequick");

function triggerHypeMoment(user) {
  const userWithoutHash = user.slice(1);

  let channelID;
  client.api({
    url: `https://api.twitch.tv/helix/users?login=${userWithoutHash}`,
    headers: {
      "Client-ID": process.env.CLIENT_ID
      }
    }, (err, res, body) => {
      if (err) { 
        console.log(err);
      }

      const { data } = body;
      const userData = data[0];
      channelID = userData.id;
      broadcaterType = userData.broadcaster_type;

      let emoteList = {
        // LUL
        0: {
          ID: 425618,
          Votes: 0
        },
        // PogChamp
        1: {
          ID: 88,
          Votes: 0
        },
        // Bible Thump
        2: {
          ID: 86,
          Votes: 0
        },
        // Kappa
        3: {
          ID: 25,
          Votes: 0
        }
      };

      console.dir(userData);
      console.dir(`Send hype event for channel: ${user} with id: ${channelID}`);

      if (broadcaterType === "partner") {
        // Get list of partner emotes and pick 4 random ones for the event
        axios.get(`https://api.twitchemotes.com/api/v4/channels/${channelID}`, {})
        .then((response) => {
          const { data } = response;
          console.dir(data);
          const { emotes } = data;

          // If the partner has at least 4 emotes, grab 4 of them instead of the defaults
          if (emotes.length >= 4) {
            for (let i = 0; i < 4; i++) {
              // Get random number in list of emotes
              let randomEmoteIndex = Math.floor(Math.random() * Math.floor(emotes.length - 1));
              // Remove element from emotes list
              let currentEmote = emotes.splice(randomEmoteIndex, 1)[0];
              // Overwrite the emote ID in the object
              emoteList[i].ID = currentEmote.id;
            }
          }

          console.dir(emoteList)

          // Send hype event to firebase
          firebase.database().ref(`${channelID}/Payload`).set({
            EmotesIdList: emoteList,
            TimeStamp: new Date().toUTCString()
          });
        })
        .catch((error) => {
          console.dir("error");
          console.dir(error);
        });
        return;
      }

      // Send hype event to firebase
      firebase.database().ref(`${channelID}/Payload`).set({
        EmotesIdList: emoteList,
        TimeStamp: new Date().toUTCString()
      });
  });
}

function checkForHype (user) {
  const channelVars = hypeInfo[user];

  // Re-calc average hype
  channelVars.totalMessages += channelVars.messagesInCurrentInterval;
  channelVars.numAverages++;

  let currentAverage = channelVars.totalMessages / channelVars.numAverages;

  // If messages in last interval exceed the average by the hype differential
  if (channelVars.messagesInCurrentInterval > currentAverage + channelVars.hypeDifferential) {
    // Cooldown check for intervals
    if (channelVars.intervalSinceLastHype > channelVars.hypeCooldownIntervalCount) {
      console.dir(`HYPE MOMENT!!!!! : ${user} | ${channelVars.messagesInCurrentInterval} | ${currentAverage}`);
      triggerHypeMoment(user);

      channelVars.intervalSinceLastHype = 0;
    } else {
      console.dir(`Would be hype.. : ${user} | ${channelVars.messagesInCurrentInterval} | ${currentAverage}`)
    }

    channelVars.intervalSinceLastHype++;
    return;
  }
  
  console.dir(`Not a hype interval dog: ${user} | ${channelVars.messagesInCurrentInterval} | ${currentAverage}`);
  channelVars.intervalSinceLastHype++;
}

function resetInterval (user) {
  const channelVars = hypeInfo[user];
  
  // Grab current time, add interval length to it
  channelVars.intervalEnd = moment().add(channelVars.intervalSecondsLength, 's');

  // Reset messages to 1
  channelVars.messagesInCurrentInterval = 1;
}

// Called every time a message comes in
function onMessageHandler (target, context, msg, self) {
  if (self) { return; } // Ignore messages from the bot

  // Set initial variables for channel if they don't exist yet
  if (!hypeInfo.hasOwnProperty(target)) {
    setInitialVariables(target);
  }

  const channelVars = hypeInfo[target];
  const messageSendTime = moment();

  // If most recent interval end hasn't been set yet, set it
  if (channelVars.intervalEnd === null || channelVars.intervalEnd === undefined) {
    resetInterval(target);
  }

  // If message is out of current interval, reset the interval and reset the message counter
  if (messageSendTime > channelVars.intervalEnd) {
    checkForHype(target);

    resetInterval(target);
  }

  channelVars.messagesInCurrentInterval++;
}

// Called every time the bot connects to Twitch chat
function onConnectedHandler (addr, port) {
  console.log(`* Connected to ${addr}:${port}`);
}
