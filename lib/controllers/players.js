var chatPlugin = require('../plugins/ciscospark');
const Player = require('../db/player');
const util = require('util');

export async function me(request, reply) {
  const me = await chatPlugin.me(request.auth.credentials.spark.authorization);
  reply(me);
}

export async function create(request, reply) {
  logger.debug(`creating player based on ${util.inspect(request.payload)}`)
  const p = await Player.create(request.auth.credentials.spark.authorization, request.payload);
  reply(p);
}

export async function list(request, reply) {
  // TODO
}