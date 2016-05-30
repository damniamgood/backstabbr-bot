export async function flatten(arr) {
  try {
    return arr.reduce(function(a,b) {
      return a.concat(b);
    })
  } catch (err) {
    if (err instanceof TypeError) {
      return arr;
    } else {
      console.log(err);
    }
  }
};

export async function dbToObjects(res) {
  var out = await res.records.map( function (record) {
    return record._fields.map( function (node) {
      return node.properties;
    })
  });
  return flatten(out);
};

export function returnOrErr (err, response) {
  if (err) throw err;
  console.log(response);
  return response;
}

/**
 * Overwrites obj1's values with obj2's and adds obj2's if non existent in obj1
 * @param obj1
 * @param obj2
 * @returns obj3 a new object based on obj1 and obj2
 */
export function merge_options(obj1,obj2){
    var obj3 = {};
    for (var attrname in obj1) { obj3[attrname] = obj1[attrname]; }
    for (var attrname in obj2) { obj3[attrname] = obj2[attrname]; }
    return obj3;
}
/*
* @param powers (string or array of powers)
* @param gameId
* @return Array of room titles
*
* Example:
* > calcRoomNames('RUS-TUR','game0')
* [ { title: 'RUS-TUR game0' }, { title: 'TUR-RUS game0' } ]
*
* > calcRoomNames(['RUS','TUR'],'game0')
* [ { title: 'RUS-TUR game0' }, { title: 'TUR-RUS game0' } ]
*/
export function calcRoomNames(powers, gameId) {
  if (powers instanceof Array) {
    var powerArr = powers;
  } else {
    var powerArr = powers.split('-');
  }
  return powerArr.sort().map(
    function(power, i, arr) {
      var newArr = arr.slice();
      newArr.splice(i, 1);
      var roomName = power + "-" + newArr.join('-') + " " + gameId;
      return { title: roomName };
    })
}

/*
* Calculates webhook combinations for a group of rooms
* @param array of Room objects
* @returns array of Webhook objects
*/
export function calcRoomWebhooks(powerRooms) {
  var result = powerRooms.map( function(sourceRoom, i, allRooms) {
    console.log(`dealing with ${sourceRoom.title}\n`);
    var webhookRooms = allRooms.slice();
    webhookRooms.splice(i, 1);
    return webhookRooms.map(function(targetRoom) {
      console.log(`  webhook for room ${targetRoom.title}\n`);
      return {
        sourceRoom: sourceRoom.id,
        title: sourceRoom.title.split(' ')[0].split('-')[0] + "->" + targetRoom.title.split(' ')[0].split('-')[0],
        targetRoom: targetRoom.id
      };
    })
  });
  return [].concat.apply([], result)
}
