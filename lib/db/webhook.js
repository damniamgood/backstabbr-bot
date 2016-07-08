import assert from 'assert';
const util = require('util');
var helpers = require('../helpers/helpers');
var db = require('./db');

class Webhook {
  constructor(options) {
    const defaults = {
      id: undefined,
      name: undefined
    };
    const populated = Object.assign(defaults, options);
    for (const key in populated) {
      if (populated.hasOwnProperty(key)) {
        this[key] = populated[key];
      }
    }
  }
}

Webhook.prototype.options_list = function(n) {
  var arr = [];
  var keys = Object.keys(this);
  for (var prop in keys) {
    arr.push(`${n}.${keys[prop]} = "${this[keys[prop]]}"`);
  };
  return arr.join(', ');
}

Webhook.create = async function create(options) {
  try {
    var webhook = new Webhook(options);
    const query = `
      MERGE (g:Webhook {id: "${webhook.id}"})
      ON MATCH SET ${webhook.options_list('g')}
      ON CREATE SET ${webhook.options_list('g')}
      RETURN g`;
      logger.debug(query)
    const result = await db.db.query(query).getResults('g');
    for (const prop in Object.getOwnPropertyNames(webhook)) {
      assert(webhook[prop] == result[0][prop]);
    };
    return result[0];
  } catch (err) {
    logger.error(err);
    return(err);
  }
};

Webhook.remove = async function remove(webhook) {
  try {
    var webhook = new Webhook(webhook);
    const query = `MATCH (w:${util.inspect(webhook)}) DETACH DELETE w`;
    const result = await db.db.query(query).getResults('w');
    return;
  } catch (err) {
    logger.error(err);
    return(err);
  }
};

Webhook.find = async function find(options) {
  switch (options.id) {
    case undefined:
      var query = `MATCH (n:Webhook) RETURN n`
      break;
    default:
      var query = `MATCH (n:Webhook { id: "${options.id}" }) RETURN n`
  };
  try {
    return await db.db.query(query).getResults('n');
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

Webhook.addToRoom = async function addToRoom(webhookId, roomId, how = 'HOOKS_TO') {
  try {
    var query = `
       MATCH (webhook:Webhook { id: "${webhookId}" })
       MATCH (room:Room { id: "${roomId}" })
       MERGE (webhook)-[:${how}]->(room)
       RETURN webhook`
    logger.debug(query);
    var out = await db.db.query(query).getResults('webhook');
    logger.debug(out);
    return out;
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

module.exports = Webhook;