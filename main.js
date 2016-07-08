'use strict';

global.logger = require('./lib/utils/logger');
logger.level = process.env.LOG_LEVEL || 'info';

import assert from 'assert';
var helpers = require('./lib/helpers/helpers');
import combinatorics from 'js-combinatorics';
const JWT_KEY = process.env.JWT_KEY || 'NeverShareYourSecret';

var ciscospark = require('./lib/plugins/ciscospark');
var server     = require('./lib/controllers/server');

var s = server.server(process.env.PORT);

const roomsForTwo = combinatorics.combination(['AUS','ENG','GER','RUS','TUR','ITA','FRA'],2);
const roomsForThree = combinatorics.combination(['AUS','ENG','GER','RUS','TUR','ITA','FRA'],3);
const serviceUrl = process.env.SERVICE_URL || `https://backstabbr-bot.herokuapp.com`;

var games    = require(`./lib/controllers/games`);
var rooms    = require(`./lib/controllers/rooms`);
var players  = require(`./lib/controllers/players`);
var webhooks = require(`./lib/controllers/webhooks`);

s.register(require('hapi-auth-jwt2'), function (err) {

  if(err){
    logger.error(err);
  }

  s.auth.strategy('jwt', 'jwt',
  { key: JWT_KEY,                              // Never Share your secret key
    validateFunc: helpers.validate,            // validate function defined in helpers
    verifyOptions: { algorithms: [ 'HS256' ] } // pick a strong algorithm
  });

  s.auth.default('jwt');

  s.route([
  {
    method: 'GET', path: '/restricted', config: { auth: 'jwt' },
    handler: function(request, reply) {
      reply({text: 'You used a Token! Bully for you!'})
      .header("Authorization", request.headers.authorization);
    }
  }
  ]);
});

s.register(require('vision'), function (err) {

  if(err) {
    logger.error(err)
  }

  s.views({
    engines: {
        html: require('handlebars')
    },
    relativeTo: __dirname,
    path: 'templates'
  });

});

s.register(require('inert'), (err) => {

  if (err) {
    throw err;
  }
  s.route({
    method: 'GET',
    path: '/authc.js',
    config: {
      auth: false,
    },
    handler: function (request, reply) {
      reply.file('templates/authc.js');
    }
  })
});

s.route({
  method: 'GET',
  path: '/',
  config: {
    auth: false,
  },
  handler: function (request, reply) {
    reply.view('index');
  }
});

s.start((err) => {
  if (err) {
    throw err;
  }
  logger.info('Server running at:', s.info.uri);
});

s.route({
  method: ['GET', 'POST'],
  path: '/auth',
  config: { auth: false },
  handler: async function (request, reply) {
    var auth = await ciscospark.getAuth(request.query);
    const me = await ciscospark.me(auth);
    const combined = {
      spark: {
        id: me,
        authorization: auth
      }
    };
    var jwt = await helpers.createJwt(combined)
    reply(jwt)
    .type('application/json');
  }
})

s.route({
  method: 'GET',
  path: '/rooms',
  config: {
    tags: ['api'],
    description: 'All rooms for given user',
    handler: rooms.list
  }
});

s.route({
  method: 'POST',
  path: '/rooms',
  config: {
    tags: ['api'],
    description: 'Create a room with title = @param title',
    handler: rooms.create
  }
});

const me = '';//ciscospark.people.get(`me`);

async function createRoom(title){
  try {
    const room = await ciscospark.rooms.create({title: title});
    assert(room.id);
    assert(room.title);
    assert(room.created);
    logger.debug(`Trying to create webhook for ${room.title}`);
    await createWebhook(room.id, title);
  }
  catch(reason) {
    logger.error("Failure: " + reason)
  }
};

// async function createWebhook(roomId, powers, targetRoomId) {
//   console.log(`Creating webhook for ${powers} in room ${roomId}`);
//   console.log(`service url is ${serviceUrl}`);
//   try {
//     const webhook = await ciscospark.webhooks.create({
//       resource: `messages`,
//       event: `created`,
//       filter: `roomId=${roomId}`,
//       targetUrl: `${serviceUrl}/webhook/${targetRoomId}`,
//       name: `${powers}`
//     });
//   }
//   catch(reason) {
//     console.log(`Failed to create webhook: ${reason}`);
//   }
// };

async function webhook(data) {
  // console.log(`i am ${me._v.id}`);
  // console.log(`you are am ${data.data.personId}`);
  if (data.data.personId != me._v.id) {
    try {
      let whosheis = await ciscospark.people.get(data.data.personId);
      let whatshesaid = await ciscospark.messages.get(data.data.id);
      let message = await ciscospark.messages.create({
        text: `${whosheis.displayName} said ${whatshesaid.text}`,
        roomId: data.data.roomId
      });
      assert(message.id);
      assert(message.personId);
      assert(message.personEmail);
      assert(message.roomId);
      assert(message.created);
    }
    catch(reason) {
      logger.error(`Failed to respond to webhook: ${reason}`);
    }
  }
};

s.route({
  method: 'POST',
  path: '/games/{gameId}/rooms',
  config: {
    tags: ['api'],
    description: 'Create new rooms for game {gameId}, includes each one-on-one, all, and one->bot',
    handler: rooms.createAllGameRooms
  }
});

s.route({
  method: 'POST',
  path: '/games/{gameId}/rooms/{roomTitle}',
  config: {
    tags: ['api'],
    description: 'Create new room {roomTitle} for game {gameId}, options: "players" - array of player emails',
    handler: games.createRooms
  }
});

s.route({
  method: 'GET',
  path: '/games/{gameId}/rooms',
  config: {
    tags: ['api'],
    description: 'Get rooms for game {gameId}',
    handler: games.getRooms
  }
});

s.route({
  method: 'GET',
  path: '/games/{gameId}/players/{role?}',
  config: {
    tags: ['api'],
    description: 'Get players for game {gameId} or get the player with role {role}',
    handler: games.getPlayers
  }
});

s.route({
  method: 'DELETE',
  path: '/games/{gameId}/rooms',
  config: {
    tags: ['api'],
    description: 'Remove all rooms associated with game {gameId}',
    handler: rooms.removeGameRooms
  }
});

s.route({
  method: 'DELETE',
  path: '/rooms/{id}',
  handler: rooms.remove
});

s.route({
  method: 'GET',
  path: '/rooms/{id}/webhooks',
  handler: rooms.getRoomWebhooks
});

s.route({
  method: 'POST',
  path: '/webhook',
  handler: function(request, reply) {
    logger.debug(`DEBUG: (/webhook) payload: ${JSON.stringify(request.payload)}`);
    webhook(request.payload);
    reply("OK");
  }
});

s.route({
  method: 'GET',
  path: '/webhooks',
  handler: webhooks.find
});

s.route({
  method: 'POST',
  path: '/webhooks',
  handler: webhooks.create
});

s.route({
  method: 'POST',
  path: '/webhook/{targetRoomId}',
  handler: async function(request, reply) {
    logger.debug(`DEBUG: (/webhook/{targetRoomId}) payload: ${JSON.stringify(request.payload)}`);
    var msg = await ciscospark.messageFairy(
      request.auth.credentials.spark.authorization,
      request.payload.data.id,
      request.params.targetRoomId,
      request.payload.name.slice(0, 3) + ": "
    );
    reply(msg).type('application/json');
  }
});

s.route({
  method: 'GET',
  path: '/me',
  handler: players.me
});


// def feet(feet)
  // feet.each { |f|
    //puts "for #{f[:name]} create webhooks #{feet-[f]}"
  // }
// end

// def butts(powers)
//   powers.sort.map { |power|
//     id=rand(100);
//     puts "creating room for #{power}, called #{power}-#{(powers-[power]).join('-')} with id #{id}";
//     {name: "#{power}-#{(powers-[power]).join('-')}", id: id}
//   }
// end

s.route({
  method: 'POST',
  path: '/rooms/{gameId}/{matchup}',
  handler: async function (request, reply) {
    logger.debug(`for ${request.params.matchup}`)
    const roomNames = await calcRoomNames(request.params.matchup, request.params.gameId);
    let promises = roomNames.map((room) => ciscospark.rooms.create(room));

    let rooms = [];
    for (let promise of promises) {
      rooms.push(await promise);
    }
    logger.debug(rooms);

    const webhooks = await calcRoomWebhooks(rooms);
    logger.debug(webhooks);

    let morePromises = webhooks.map((hook) => createWebhook(hook.sourceRoom, hook.title, hook.targetRoom));

    let hooks = [];
    for (let promise of morePromises) {
      hooks.push(await promise);
    }
    logger.debug(hooks);

    reply(hooks).type('application/json');
  }
});

s.route({
  method: 'DELETE',
  path: '/rooms/{gameId}/{matchup}',
  handler: async function (request, reply) {
    const roomNames = await calcRoomNames(request.params.matchup, request.params.gameId);
    let promises = roomNames.map((room) => deleteRoomByName(room.title));

    let rooms = [];
    for (let promise of promises) {
      rooms.push(await promise);
    }
    logger.debug(rooms);

    reply(rooms).type('application/json');
  }
});

// function calcRoomWebhooks(powerRooms) {
//   var result = powerRooms.map( function(sourceRoom, i, allRooms) {
//     console.log(`dealing with ${sourceRoom.title}\n`);
//     var webhookRooms = allRooms.slice();
//     webhookRooms.splice(i, 1);
//     return webhookRooms.map(function(targetRoom) {
//       console.log(`  webhook for room ${targetRoom.title}\n`);
//       return {
//         sourceRoom: sourceRoom.id,
//         title: sourceRoom.title.split(' ')[0].split('-')[0],
//         targetRoom: targetRoom.id
//       };
//     })
//   });
//   return [].concat.apply([], result)
// }

// function calcRoomNames(powers, gameId) {
//   var powerArr = powers.split('-');
//   console.log(powerArr);
//   return powerArr.sort().map(
//     function(power, i, arr) {
//       var newArr = arr.slice();
//       newArr.splice(i, 1);
//       var roomName = power + "-" + newArr.join('-') + " " + gameId;
//       return { title: roomName };
//     })
// }


async function deleteRoomByName(name) {
  const rooms = await ciscospark.rooms.list();
  var response = {};
  for (const room of rooms) {
    try {
      assert(room.title.match(name))
      await ciscospark.rooms.remove(room.id);
    }
    catch(reason) {
      logger.error(reason);
    }
  }
}

s.route({
  method: 'POST',
  path: '/games',
  config: {
    tags: ['api'],
    description: `Create game { gameId: [gameId], players: {RUS: [player], TUR: [player], ENG: [player], AUS: [player], GER: [player], FRA: [player], ITA: [player]}}`,
    handler: games.create
  }
})

s.route({
  method: 'PUT',
  path: '/games/{gameId}',
  config: {
    tags: ['api'],
    description: 'Update players for game {gameId}. @params: { players: {RUS: [player], TUR: [player], ENG: [player], AUS: [player], GER: [player], FRA: [player], ITA: [player]}}',
    handler: games.update
   }
})

s.route({
  method: 'DELETE',
  path: '/games/{gameId}',
  config: {
    tags: ['api'],
    description: 'Delete game {gameId}',
    handler: games.del
   }
})

s.route({
  method: 'GET',
  path: '/games/{gameId?}',
  config: {
    tags: ['api'],
    description: 'Return information about a game. If gameId is null, return all games.',
    handler: games.get
  }
})

s.route({
  method: 'POST',
  path: '/games/{gameId}/room/{roomId}',
  handler: async function (request, reply) {
    let output = await room.add(request.params.roomId, request.params.name, request.params.gameId, session);
    reply(output);
  }
})

s.route({
  method: 'GET',
  path: '/games/{gameId}/room/{roomId}',
  handler: async function (request, reply) {
    let output = await room.get(request.params.roomId, session);
    reply(output);
  }
})

s.route({
  method: 'POST',
  path: '/players/{roomId}',
  handler: async function (request, reply) {
    let output = await room.add(request.params.roomId, request.params.name, request.params.gameId, session);
    reply(output);
  }
})

s.route({
  method: 'GET',
  path: '/players',
  handler: async function (request, reply) {
    logger.debug(request.query);
    let output = await players.list(session);
    reply(output);
  }
})

s.route({
  method: 'POST',
  path: '/players',
  handler: players.create
})

s.route({
  method: 'POST',
  path: '/game/{gameId}/player',
  handler: async function (request, reply) {
    logger.debug(request.query);
    let output = await player.addToGame(request.query.name, request.params.gameId, request.query.role, session);
    reply(output);
  }
})
