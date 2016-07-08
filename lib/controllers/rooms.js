import assert from 'assert';
const util = require('util');
var chatPlugin = require('../plugins/ciscospark');
var consts = require('../config/constants');
var helpers = require('../helpers/helpers');
var Game = require('../db/game');
var Room = require('../db/room');
var Webhook = require('../db/webhook');

export async function list(request, reply) {
  // Get the room list from spark
  try {
    const rooms = await chatPlugin.rooms(request.auth.credentials.spark.authorization);
    reply(JSON.stringify(rooms))
      .type('application/json');
  } catch (error) {
    console.error(`ERROR (rooms.list): ${error}`);
    reply(error)
  }
};

export async function remove(request, reply) {
  // Remove the room from spark
  try {
    await chatPlugin.roomRemove(request.auth.credentials.spark.authorization, request.params.id);
    var dbRoom = await Room.remove({id: request.params.id});
    reply(dbRoom);
  } catch (err) {
    console.error(`ERROR (rooms.remove): ${err}`);
    reply(err);
  }
};

export async function create(request, reply) {
  // Add a new room to spark
  try {
    const room = await Room.get(request.payload);
    if (room.length == 0) {
      const newRoom = await chatPlugin.roomCreate(request.auth.credentials.spark.authorization, request.payload.title);
      const dbRoom = await Room.create(newRoom);
      logger.debug(dbRoom);
      // Create webhook for this room
      const newWebhook = await chatPlugin.webhookCreate(
        request.auth.credentials.spark.authorization,
        newRoom.id,
        newRoom.title,
        newRoom.id
        );
      var dbWebhook = await Webhook.create(newWebhook);
      await Webhook.addToRoom(dbWebhook.id, dbRoom.id);
      reply(newRoom);
    } else {
      reply(room);
    }
  } catch (err) {
    logger.error(err);
    reply(err);
  }
};

export async function get(request, reply) {
  // Get the room list from spark
  const rooms = await chatPlugin.rooms(request.auth.credentials.spark.authorization);
  var response = {};
  for (const room of rooms) {
    try {
      logger.debug(`Checking ${room.title}`);
      assert(room.title.match('\ ' + request.params.gameId + '$'));
      response[room.id] = room.title;
    }
    catch(reason) {
      logger.debug(reason);
    }
  }
  reply(JSON.stringify(response))
  .type('application/json');
};

export async function createAllGameRooms(request, reply) {
  try {
    var game = await Game.find({gameId: request.params.gameId});
    assert(game.gameId != undefined);
    consts.roomsForTwo.forEach( async function(r) {
      await game.addRooms(request.auth.credentials.spark.authorization, r, request.auth.token)
    });
    var newRoom = await chatPlugin.roomCreate(request.auth.credentials.spark.authorization, "Full Board" + " " + request.params.gameId);
    var dbRoom = await Room.create(newRoom);
    var dbConn = await Room.addToGame(dbRoom.id, request.params.gameId);
    reply("Rooms created").redirect(`/rooms/${request.params.gameId}`);
  } catch (err) {
    logger.error(err);
    reply(err);
  }
};

export async function removeGameRooms(request, reply) {
  try {
    // Get the room list from DB
    var game = await Game.find(request.params);
    logger.debug(`Finding rooms for game ${util.inspect(game)}`);
    const rooms = await game.rooms();
    logger.debug(`Found rooms for game ${util.inspect(game)}: ${JSON.stringify(rooms)}`);
    var response = {};
    for (const r of rooms) {
      assert(r.title.match('\ ' + request.params.gameId + '$'));
      // Try to delete from Spark
      chatPlugin.roomRemove(request.auth.credentials.spark.authorization, r.id);
      // Find Webhooks in DB
      var dbWebhooks = await Room.webhooks(r);
      dbWebhooks.map(async function(wh) { await Webhook.remove(wh) })
      // Remove from DB
      await Room.remove(r);
    }
    reply(JSON.stringify(response))
    .type('application/json');
  } catch(reason) {
    logger.debug(reason);
  }
};

export async function getRoomWebhooks(request, reply) {
  try {
    var webhooks = await Room.webhooks(request.params);
    reply(webhooks);
  } catch (err) {
    logger.error(err);
    reply(err);
  }
}