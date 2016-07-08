import assert from 'assert';
var consts = require('../config/constants');
const Game = require(`../db/game`);
var Player = require('../db/player');

export function find(gameId) {
  return Game.find(gameId);
};

export async function create(request, reply) {
  try {
    logger.debug(`DEBUG (games.create): Payload is: ${JSON.stringify(request.payload)}`);
    let game = await Game.create({gameId: request.payload.gameId});
    if (request.payload.players) {
      const players = request.payload.players;

      // Verify that all players are in the request
      // consts.powers.forEach(function(p) {
      //   //assert.notEqual(players[p], undefined, `${p} player is not set`);
      // });

      for (var power in players) {
        var p = await Player.create(request.auth.credentials.spark.authorization, {email: players[power]});
        await p.addGame(game, power);
      };
      consts.roomsForTwo.forEach( async function(r) {
        await game.addProxyRooms(request.auth.credentials.spark.authorization, r, request.auth.token)
      });
      // All powers room
      await game.addProxyRooms(request.auth.credentials.spark.authorization, consts.powers, request.auth.token)
    }
    reply({ game: game, players: request.payload.players });
  } catch (err) {
    console.error(`ERROR (games.create): ${err}`);
    reply({error: err.message});
  }
}

export async function createRooms(request, reply) {
  try {
    let game = await Game.find({gameId: request.params.gameId});
    let output = await game.addRooms(
      request.auth.credentials.spark.authorization,
      request.params.roomTitle,
      request.auth.token,
      request.payload.players
      );
    reply(output);
  } catch (err) {
    console.error(`ERROR (games.createRooms): ${err}`)
  }
}

export async function update(request, reply) {
  try {
    console.log(request.params)
    let output = await Game.update(request.params);
    reply(output);
  } catch (err) {
    console.log(err);
    reply(err);
  }
}

export async function del(request, reply) {
  try {
    logger.debug(request.params)
    let output = await Game.del(request.params);
    reply(output);
  } catch (err) {
    logger.error(err);
    reply(err);
  }
}

export async function get(request, reply) {
  try {
    let output = await Game.find(request.params);
    reply(output);
  } catch (err) {
    reply(err);
  }
}

export async function getRooms(request, reply) {
  try {
    let game = await Game.find({ gameId: request.params.gameId });
    let output = await game.rooms();
    reply(output);
  } catch (err) {
    reply(err);
  }
}

export async function getPlayers(request, reply) {
  try {
    let game = await Game.find({ gameId: request.params.gameId });
    let output = await game.players(request.params.role);
    reply(output);
  } catch (err) {
    reply(err);
  }
}