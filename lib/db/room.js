import assert from 'assert';
const util = require('util');
var chatPlugin = require('../plugins/ciscospark');
var helpers = require('../helpers/helpers');
var db = require('./db');

class Room {
  constructor(options) {
    const defaults = {
      // title: undefined
    };
    const populated = Object.assign(defaults, options);
    for (const key in populated) {
      if (populated.hasOwnProperty(key)) {
        this[key] = populated[key];
      }
    }
  }
}

Room.prototype.options_list = function(n) {
  var arr = [];
  var keys = Object.keys(this);
  for (var prop in keys) {
    if (this[keys[prop]]) {
      arr.push(`${n}.${keys[prop]} = "${this[keys[prop]]}"`);
    }
  };
  return arr.join(', ');
}

Room.prototype.addPlayer = async function addPlayer(credentials, player) {
  try {
    logger.debug(`Adding player ${util.inspect(player)} to room ${util.inspect(this)}`);
    var room = this;
    var membership = await chatPlugin.membershipCreate(credentials, {
      roomId: room.id,
      personEmail: player.email
    });
    logger.debug(membership);
    if (membership.id) {
      var query = `
        MATCH (p:Player {email: "${player.email}"})
        MATCH (r:Room {id: "${room.id}"})
        MERGE (p)-[:MEMBER_OF]->(r)
        RETURN p
      `
      var result = await db.db.query(query).getResults('r');
      return(result)
    } else {
      return(membership);
    }
  } catch (error) {
    console.error(`ERROR (Room.addPlayer): ${error}`);
    return(error);
  }
}

Room.create = async function create(options) {
  try {
    var room = new Room(options);
    const query = `
      MERGE (g:Room {id: "${room.id}"})
      ON MATCH SET ${room.options_list('g')}
      ON CREATE SET ${room.options_list('g')}
      RETURN g`;
    const result = await db.db.query(query).getResults('g');
    for (const prop in Object.getOwnPropertyNames(room)) {
      assert(room[prop] == result[0][prop]);
    };
    return result[0];
  } catch (err) {
    logger.error(err);
    return(err);
  }
};

Room.remove = async function remove(room) {
  try {
    var room = new Room(room);
    const query = `MATCH (r:Room {id: "${room.id}"}) DETACH DELETE r`;
    const result = await db.db.query(query).getResults('r');
    return;
  } catch (err) {
    console.error(`ERROR (Room.remove): ${err}`);
    return(err);
  }
};

Room.get = async function get(room) {
  try {
    var room = new Room(room);
    const query = `MATCH (n:${util.inspect(room)}) RETURN n`;
    const result = await db.db.query(query).getResults('n');
    return result;
  } catch (err) {
    logger.error(err);
    return(err);
  }
};

Room.addToGame = async function addToGame(roomId, gameId) {
  logger.debug(`Adding room ${roomId} to game ${gameId}`);
  try {
    var query = `
       MATCH (game:Game { gameId: "${gameId}" })
       MATCH (room:Room { id: "${roomId}" })
       MERGE (room)-[:PART_OF]->(game)
       RETURN room`
    var out = await db.db.query(query).getResults('room');
    logger.debug(out);
    return out;
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

Room.webhooks = async function webhooks(options) {
  try {
    logger.debug(`Searching for webhooks on room ${JSON.stringify(options)}`);
    var room = new Room(options);
    var query = `
      MATCH (r:${util.inspect(room)})--(w:Webhook)
      RETURN r,w`;
    var out = await db.db.query(query).getResults('w');
    logger.debug(`Found webhooks ${JSON.stringify(out)}`);
    return out;
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

module.exports = Room;