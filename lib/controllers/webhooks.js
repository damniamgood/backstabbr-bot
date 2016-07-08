import assert from 'assert';
var chatPlugin = require('../plugins/ciscospark');
var Webhook = require('../db/webhook');

export async function find(request, reply) {
  try {
    let response = await Webhook.find(request.params);
    reply(response);
  } catch (err) {
    logger.error(err);
    reply(err);
  }
}

export async function create(request, reply) {
  try {
    let response = await Webhook.create(request.payload);
    reply(response);
  } catch (err) {
    logger.error(err);
    reply(err);
  }
}

export async function del(request, reply) {
  try {
    let response = await Webhook.del(request.params.id);
    reply(response);
  } catch (err) {
    logger.error(err);
    reply(err);
  }
}
