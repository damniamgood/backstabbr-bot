import assert from 'assert';
var config = require('../config/constants');

// assert(process.env.CISCOSPARK_ACCESS_TOKEN);
// assert(process.env.CISCOSPARK_REFRESH_TOKEN);
assert(process.env.CISCOSPARK_CLIENT_ID);
assert(process.env.CISCOSPARK_CLIENT_SECRET);

import ciscospark from 'ciscospark/es6';

function init(credentials) {
  return ciscospark.init({
    credentials: {
      authorization: credentials
    },
    config: {
      hydraServiceUrl: ciscospark.config.hydraServiceUrl
    }
  });
};

async function getAuth(code) {
  // Get authentication
  var spark = await ciscospark.init();
  await spark.authenticate(code);
  const creds = JSON.stringify(spark.credentials.authorization);
  return JSON.parse(creds);
}

async function getMe(credentials) {
  try {
    const spark = await init(credentials);
    const me = await spark.people.get('me');
    return me;
  } catch (err) {
    logger.error(err);
    return err;
  }
}

async function getUser(credentials, email) {
  try {
    const spark = await init(credentials);
    const user = await spark.people.list({email: email});
    return user.items[0];
  } catch (err) {
    logger.error(err);
    return null;
  }
}

async function messageFairy(credentials, messageId, targetRoomId, prefix) {
  // Listen to messages from a player in one room
  // and parrot to the corresponding room(s)
  // e.g. England says something in the ENG-GER
  // room, and this service posts a message to the
  // GER-ENG room "England: ${message}"
  try {
    const spark = await init(credentials);
    const me = await spark.people.get('me');
    let whatshesaid = await spark.messages.get(messageId);
    if (whatshesaid.personId != me.id) {
      let whosheis = await spark.people.get(whatshesaid.personId);
      let msg = await spark.messages.create({
        text: prefix + whatshesaid.text,
        roomId: targetRoomId
      });
      return;
    }
  }
  catch(reason) {
    logger.debug(`ERROR: (messageFairy) ${reason}`);
    return reason;
  }
};

async function rooms(credentials, max = 100) {
  try {
    const spark = await init(credentials);
    const rooms = await spark.rooms.list({
      max: max
    });
    return rooms;
  } catch (err) {
    logger.error(err);
    return err;
  }
};

async function roomRemove(credentials, roomId) {
  try {
    const spark = await init(credentials);
    logger.debug(`Trying to remove room ${roomId}`);
    await spark.rooms.remove(roomId);
    try {
      const room = await spark.rooms.get(roomId);
      assert(false, `room was not deleted`);
      logger.debug(room);
      return(room);
    }
    catch (reason) {
      assert.equal(reason.statusCode, 404);
      logger.debug(reason);
      return({message: `Room ${roomId} deleted`});
    }
  }
  catch (err) {
    logger.error(err);
    return err;
  }
};

async function roomCreate(credentials, title) {
  try {
    const spark = await init(credentials);
    const room = await spark.rooms.create({title: title});
    assert(room.id);
    assert(room.title);
    assert(room.created);
    return room;
  } catch(err) {
    logger.error(err);
    return err;
  }
};

async function webhookCreate(credentials, roomId, powers, targetRoomId) {
  logger.debug(`Creating webhook for ${powers} in room ${roomId}`);
  logger.debug(`service url is ${config.serviceUrl()}`);
  try {
    const spark = await init(credentials);
    const webhook = await spark.webhooks.create({
      resource: `messages`,
      event: `created`,
      filter: `roomId=${roomId}`,
      targetUrl: `${config.serviceUrl()}/webhook/${targetRoomId}`,
      name: `${powers}`
    });
    return webhook;
  }
  catch(err) {
    console.log(`Failed to create webhook: ${err}`);
    return(err)
  }
};

async function membershipCreate(credentials, options) {
  console.log(`Creating membership with options ${JSON.stringify(options)}`);
  try {
    const spark = await init(credentials);
    const membership = await spark.memberships.create(options);
    return membership;
  } catch (err) {
    console.log(`ERROR (membershipCreate): ${err}`);
    return (err);
  }
}

module.exports = {
  me: getMe,
  getAuth: getAuth,
  getUser: getUser,
  messageFairy: messageFairy,
  membershipCreate: membershipCreate,
  rooms: rooms,
  roomRemove: roomRemove,
  roomCreate: roomCreate,
  webhookCreate: webhookCreate

}