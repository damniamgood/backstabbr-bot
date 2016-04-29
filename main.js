'use strict';

import assert from 'assert';
import combinatorics from 'js-combinatorics';
import ciscospark from 'ciscospark/es6';
const Hapi = require('hapi');

assert(process.env.CISCOSPARK_ACCESS_TOKEN);
// assert(process.env.CISCOSPARK_REFRESH_TOKEN);
assert(process.env.CISCOSPARK_CLIENT_ID);
assert(process.env.CISCOSPARK_CLIENT_SECRET);

const server = new Hapi.Server();
server.connection({ port: process.env.PORT });

const roomsForTwo = combinatorics.combination(['AUS','ENG','GER','RUS','TUR','ITA','FRA'],2);
const roomsForThree = combinatorics.combination(['AUS','ENG','GER','RUS','TUR','ITA','FRA'],3);
const serviceUrl = process.env.SERVICE_URL || `https://backstabbr-bot.herokuapp.com`;

server.start((err) => {

    if (err) {
        throw err;
    }
    console.log('Server running at:', server.info.uri);
});

server.route({
    method: 'GET',
    path: '/rooms',
    handler: async function (request, reply) {
        // Get the room list from spark
        const rooms = await ciscospark.rooms.list();
        reply(JSON.stringify(rooms))
          .type('application/json');
    }
});

const me = ciscospark.people.get(`me`);

async function createRoom(title){
  try {
    const room = await ciscospark.rooms.create({title: title});
    assert(room.id);
    assert(room.title);
    assert(room.created);
    console.log(`Trying to create webhook for ${room.title}`);
    await createWebhook(room.id, title);
  }
  catch(reason) {
    console.log("Failure: " + reason)
  }
};

async function createWebhook(roomId, powers, targetRoomId) {
  console.log(`Creating webhook for ${powers} in room ${roomId}`);
  console.log(`service url is ${serviceUrl}`);
  try {
    const webhook = await ciscospark.webhooks.create({
      resource: `messages`,
      event: `created`,
      filter: `roomId=${roomId}`,
      targetUrl: `${serviceUrl}/webhook/${targetRoomId}`,
      name: `${powers} messages`
    });
  }
  catch(reason) {
    console.log(`Failed to create webhook: ${reason}`);
  }
};

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
      console.log(`Failed to respond to webhook: ${reason}`);
    }
  }
};

async function messageFairy(messageId, targetRoomId) {
  // Listen to messages from a player in one room
  // and parrot to the corresponding room(s)
  // e.g. England says something in the ENG-GER
  // room, and this service posts a message to the
  // GER-ENG room "England: ${message}"
  try {
    let whatshesaid = await ciscospark.messages.get(messageId);
    if (whatshesaid.personId != me._v.id) {
      let whosheis = await ciscospark.people.get(whatshesaid.personId);
      let msg = await ciscospark.messages.create({
        text: whatshesaid.text,
        roomId: targetRoomId
      });
      return;
    }
  }
  catch(reason) {
    return reason;
  }
};

server.route({
  method: 'POST',
  path: '/rooms/{gameId}',
  handler: async function (request, reply) {
      roomsForTwo.forEach( function(r) {
        console.log(`creating room for ${r}`);
        createRoom(r + " " + request.params.gameId);
      });
      roomsForThree.forEach( function(r) {
        createRoom(r + " " + request.params.gameId);
      });
      reply("Rooms created");
  }
});

server.route({
  method: 'GET',
  path: '/rooms/{gameId}',
  handler: async function (request, reply) {
      // Get the room list from spark
      const rooms = await ciscospark.rooms.list();
      var response = {};
      for (const room of rooms) {
        try {
          assert(room.title.match('[A-Z]{3},[A-Z]{3}\ ' + request.params.gameId))
          response[room.id] = room.title;
        }
        catch(reason) {
          console.log(reason);
        }
      }
      reply(JSON.stringify(response))
        .type('application/json');
  }
});

server.route({
  method: 'DELETE',
  path: '/rooms/{gameId}',
  handler: async function (request, reply) {
    // Get the room list from spark
    const rooms = await ciscospark.rooms.list();
    var response = {};
    for (const room of rooms) {
      try {
        assert(room.title.match('[A-Z]{3}(,[A-Z]{3}){1,2}\ ' + request.params.gameId))
        await ciscospark.rooms.remove(room.id);
      }
      catch(reason) {
        console.log(reason);
      }
    }
    reply(JSON.stringify(response))
      .type('application/json');
  }
});

server.route({
  method: 'DELETE',
  path: '/room/{id}',
  handler: async function(request, reply) {
    console.log(request.params.id);
    await ciscospark.rooms.remove(request.params.id);

    try {
      room = await ciscospark.rooms.get(request.params.id);
      assert(false, `the previous line should have failed`);
      console.log(room);
    }
    catch(reason) {
      assert.equal(reason.statusCode, 404);
      console.log(reason);
      reply("Failed somehow");
    }
  }
});

server.route({
  method: 'POST',
  path: '/webhook',
  handler: function(request, reply) {
    console.log(request.payload);
    webhook(request.payload);
    reply("OK");
  }
});

server.route({
  method: 'GET',
  path: '/webhooks',
  handler: async function(request, reply) {
    const webhooks = Array.from(await ciscospark.webhooks.list());
    reply(JSON.stringify(webhooks))
      .type('application/json');
  }
});

server.route({
  method: 'POST',
  path: '/webhook/{targetRoomId}',
  handler: async function(request, reply) {
    console.log(request.payload)
    var msg = await messageFairy(request.payload.data.id, request.params.targetRoomId);
    reply(msg).type('application/json');
  }
});

server.route({
  method: 'GET',
  path: '/me',
  handler: function(request, reply) {
    console.log(me._v.id);
    reply(me)
      .type('application/json');
  }
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

server.route({
  method: 'POST',
  path: '/rooms/{gameId}/{matchup}',
  handler: async function (request, reply) {
    console.log(`for ${request.params.matchup}`)
    const roomNames = await calcRoomNames(request.params.matchup, request.params.gameId);
    let promises = roomNames.map((room) => ciscospark.rooms.create(room));

    let rooms = [];
    for (let promise of promises) {
      rooms.push(await promise);
    }
    console.log(rooms);

    const webhooks = await calcRoomWebhooks(rooms);
    console.log(webhooks);

    let morePromises = webhooks.map((hook) => createWebhook(hook.sourceRoom, hook.title, hook.targetRoom));

    let hooks = [];
    for (let promise of morePromises) {
      hooks.push(await promise);
    }
    console.log(hooks);

    reply(hooks).type('application/json');
  }
});

server.route({
  method: 'DELETE',
  path: '/rooms/{gameId}/{matchup}',
  handler: async function (request, reply) {
    const roomNames = await calcRoomNames(request.params.matchup, request.params.gameId);
    let promises = roomNames.map((room) => deleteRoomByName(room.title));

    let rooms = [];
    for (let promise of promises) {
      rooms.push(await promise);
    }
    console.log(rooms);

    reply(rooms).type('application/json');
  }
});

  function calcRoomWebhooks(powerRooms) {
    var result = powerRooms.map( function(sourceRoom, i, allRooms) {
      console.log(`dealing with ${sourceRoom.title}\n`);
      var webhookRooms = allRooms.slice();
      webhookRooms.splice(i, 1);
      return webhookRooms.map(function(targetRoom) {
        console.log(`  webhook for room ${targetRoom.title}\n`);
        return {
          sourceRoom: sourceRoom.id,
          title: sourceRoom.title + " to " + targetRoom.title,
          targetRoom: targetRoom.id
         };
      })
    });
    return [].concat.apply([], result)
  }

function calcRoomNames(powers, gameId) {
  var powerArr = powers.split('-');
  console.log(powerArr);
  return powerArr.sort().map(
    function(power, i, arr) {
      var newArr = arr.slice();
      newArr.splice(i, 1);
      var roomName = power + "-" + newArr.join('-') + " " + gameId;
      return { title: roomName };
    })
}


async function deleteRoomByName(name) {
  const rooms = await ciscospark.rooms.list();
  var response = {};
  for (const room of rooms) {
    try {
      assert(room.title.match(name))
      await ciscospark.rooms.remove(room.id);
    }
    catch(reason) {
      console.log(reason);
    }
  }
}




