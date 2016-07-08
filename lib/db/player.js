import assert from 'assert';
const util = require('util');
var helpers = require('../helpers/helpers');
var db = require('./db');
var chatPlugin = require('../plugins/ciscospark');

async function checkChatUser(credentials, email) {
  try {
    return await chatPlugin.getUser(credentials, email)
  } catch (err) {
    logger.error(err);
    return null
  }
}

class Player {
  constructor(options) {
    const defaults = {
      email: undefined,
    };
    const populated = Object.assign(defaults, options);
    for (const key in populated) {
      if (populated.hasOwnProperty(key)) {
        this[key] = populated[key];
      }
    }
  }
}

Player.create = async function create(credentials, options) {
  try {
    const chatUser = await checkChatUser(credentials, options.email);
    logger.debug("Found user: " + JSON.stringify(chatUser));
    const p = helpers.merge_options(options, chatUser);
    const player = new Player(p);
    const query = `MERGE (p:${util.inspect(player)}) RETURN p LIMIT 1`;
    const result = await db.db.query(query).getResults('p');
    for (const prop in Object.getOwnPropertyNames(player)) {
      assert(player[prop] == result[0][prop]);
    };
    logger.debug(result[0]);
    return new Player(result[0]);
  } catch (err) {
    logger.error(err);
    return(err);
  }
}

Player.prototype.addGame = async function(game, role) {
  try {
    const query = `
      MATCH (g:${util.inspect(game)})
      MATCH (p:Player {email: "${this.email}"})
      MERGE (p)-[:${role}]->(g)
      RETURN g, p
    `;
    logger.debug(query);
    var result = await db.db.query(query).getResults('p')
    logger.debug(JSON.stringify(result));
  } catch(err) {
    console.error(`ERROR (Player.addGame): ${err}`);
    return(err);
  }
}

export async function addToGame(name, gameId, role) {
  let out = await session.run(
    `MATCH (r:Player { name: "${name}" })
    MATCH (g:Game { id: "${gameId}" })
    CREATE (r)-[:PARTICIPATES { role: "${role}" }]->(g)
    RETURN r`
  )
  return out.records;
}

Player.find = async function find(email) {
  var query = `MATCH (p:Player { email: "${email}" }) RETURN p LIMIT 1`;
  var result = await db.db.query(query).getResults('p');
  return result[0];
}

export async function list() {
  let out = await session.run(
    `MATCH (r:Player) RETURN r`
  )
  return out.records;
}

module.exports = Player;