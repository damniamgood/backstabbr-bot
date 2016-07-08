import assert from 'assert';
const util = require('util');
var chatPlugin = require('../plugins/ciscospark');
var helpers = require('../helpers/helpers');
var db = require('./db');
var Player = require('../db/player');
var Room = require('../db/room');
var Webhook = require('../db/webhook');


class Game {
  constructor(options) {
    const defaults = {
      gameId: undefined,
      status: 'Created'
    };
    const populated = Object.assign(defaults, options);
    for (const key in populated) {
      if (populated.hasOwnProperty(key)) {
        this[key] = populated[key];
      }
    };
  }
}

Game.prototype.id = function() {
  return this.gameId;
}

Game.prototype.options_list = function(n) {
  var arr = [];
  var keys = Object.keys(this);
  for (var prop in keys) {
    arr.push(`${n}.${keys[prop]} = "${this[keys[prop]]}"`);
  };
  return arr.join(', ');
}

Game.create = async function create(options) {
  try {
    var game = new Game(options);
    const query = `
      MERGE (g:Game {gameId: "${game.gameId}"})
      ON MATCH SET ${game.options_list('g')}
      ON CREATE SET ${game.options_list('g')}
      RETURN g`;
      logger.debug(query)
    const result = await db.db.query(query).getResults('g');
    for (const prop in Object.getOwnPropertyNames(game)) {
      assert(game[prop] == result[0][prop]);
    };
    return new Game(result[0]);
  } catch (err) {
    logger.error(err);
    return(err);
  }
};

Game.del = async function del(options) {
  try {
    var game = new Game(options);
    const query = `MATCH (g:Game {gameId: "${game.gameId}"}) DELETE g`;
    const result = await db.db.query(query);
    return;
  } catch (err) {
    logger.error(err);
    return(err);
  }
};

Game.find = async function get(options) {
  try {
    switch (options.gameId) {
      case undefined:
        logger.debug(`Finding all games in db`);
        var query = `MATCH (g:Game) RETURN g`;
        return await db.db.query(query).getResults('g');
        break;
      default:
        logger.debug(`Finding games that match ${JSON.stringify(options)}`);
        var query = `MATCH (g:Game { gameId: "${options.gameId}" }) RETURN g LIMIT 1`
        var res = await db.db.query(query).getResults('g');
        return new Game(res[0]);
    };
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

Game.prototype.rooms = async function gameRooms(title) {
  try {
    logger.debug(`Trying to find rooms for game ${util.inspect(this)}, room ${title}`)
    if (title) {
      var query = `MATCH (g:Game { gameId: "${this.gameId}" })<-[:PART_OF]-(r:Room {title: "${title}"}) RETURN r`;
    } else {
      var query = `MATCH (g:Game { gameId: "${this.gameId}" })<-[:PART_OF]-(r:Room) RETURN r`;
    }
    var results = await db.db.query(query).getResults('r');
    var out = results.map( function(room) {
      return new Room(room);
    })
    return(out);
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

Game.prototype.players = async function gamePlayers(role) {
  try {
    logger.debug(`Trying to find players for game ${util.inspect(this)} with role ${role}`)
    if (role) {
      var query = `MATCH (g:Game { gameId: "${this.gameId}" })<-[r:${role}]-(p:Player) RETURN p,type(r)`;
    } else {
      var query = `MATCH (g:Game { gameId: "${this.gameId}" })<-[r]-(p:Player) RETURN p,type(r)`;
    }
    var players = await db.db.query(query).getResults('p','type(r)');
    var out = {};
    players.map( function(player) {
      out[player['type(r)']] = new Player(player.p) ;
    })
    return(out);
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

Game.prototype.addRooms = async function addGameRooms(credentials, roomTitle, token, roles) {
  try {
    logger.debug(`Adding room ${roomTitle} to game ${this.gameId}`);
    const game = this;
    var r = await game.rooms(roomTitle);

    // Create room if it doesn't exist
    if (r.length == 0) {
      var newRoom = await chatPlugin.roomCreate(credentials, roomTitle);
      var dbRoom = await Room.create(newRoom);
      await Room.addToGame(dbRoom.id, game.gameId);
      var room = dbRoom;
    } else {
      var room = r[0];
    }

    // Search for players and add to room
    await roles.map(async function(role) {
      var player = await game.players(role);
      await room.addPlayer(credentials, player[role]);
    });
    return("OK");
  } catch (error) {
    logger.debug(`ERROR (Game.addRooms): ${error}`)
  }
}

Game.prototype.addProxyRooms = async function addProxyGameRooms(credentials, r, token) {
  try {
    logger.info(`Adding proxy rooms ${r} for game ${this.gameId}`);
    const gameId = this.gameId;
    const game = this;
    var players = await r.map(async function(room) {
      var player = await game.players(room);
      return player;
    })
    var rooms = helpers.calcRoomNames(r, this.gameId);
    let promises = rooms.map(async function(room) {
      // verify room doesn't exist already
      var check = await Room.get({title: room.title});
      if (check.length == 0) {
        logger.debug(`Adding room ${room.title} to game ${gameId}`);
        var newRoom = await chatPlugin.roomCreate(credentials, room.title);
        var dbRoom = await Room.create(newRoom);
        await Room.addToGame(dbRoom.id, gameId);
        await game.addRooms(credentials, room.title, token, [room.main]);
        return dbRoom;
      } else {
        logger.warn(`WARN (Game.addProxyRooms): Room ${room.title} already exists for game ${gameId}`);
        return check;
      }
    });
    let roomsOut = [];
    for (let promise of promises) {
      roomsOut.push(await promise);
    }
    logger.debug(`Rooms needing webhooks: ${JSON.stringify(roomsOut)}`);
    const webhooks = await helpers.calcRoomWebhooks(roomsOut);
    logger.debug(`Webhooks to create: ${JSON.stringify(webhooks)}`);

    let morePromises = webhooks.map(async function(hook) {
      try {
        logger.info(`Creating hook ${JSON.stringify(hook)}`);
        var h = await chatPlugin.webhookCreate(
                  credentials,
                  hook.sourceRoom,
                  hook.title,
                  `${hook.targetRoom}?token=${token}`
                );
        var dbWebhook = await Webhook.create(h);
        await Webhook.addToRoom(dbWebhook.id, hook.sourceRoom);
        await Webhook.addToRoom(dbWebhook.id, hook.targetRoom, 'TARGETS');
        return dbWebhook;
      } catch (err) {
        logger.error(err);
        return(err);
      }
    });
  } catch (err) {
    logger.error(`ERROR (Game.addProxyRooms): ${err}`);
    return (err);
  }
}

module.exports = Game;