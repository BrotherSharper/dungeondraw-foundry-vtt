import * as constants from "./constants.js";
import { Settings } from "./settings.js";
import * as geo from "./geo-utils.js";

export const makeWalls = async (state) => {
  if (!game.user.isGM) {
    // need GM privs to delete/create walls
    return;
  }

  // find our current DD walls
  const idsToDelete = wallIdsToDelete();

  // calculate a new set of walls
  let walls = [];
  if (state.geometry) {
    // simplify our geometry to downsample the amount of walls created
    const simplified = geo.simplify(state.geometry, 10.0);
    walls = makeWallsFromMulti(state.config, simplified);
  }
  const interiorWalls = makeInteriorWalls(state.config, state.interiorWalls);
  const doors = makeDoors(state.config, state.doors);
  const secretDoors = makeSecretDoors(state.config, state.secretDoors);
  const allWalls = walls.concat(interiorWalls, doors, secretDoors);

  // create our new walls before deleting old ones,
  // to prevent any unwanted vision reveals.
  //
  // scene.update() triggers a redraw, which causes an infinite loop of redraw/refresh.
  // so we avoid using it :P
  if (allWalls.length) {
    await canvas.scene.createEmbeddedDocuments("Wall", allWalls);
  }

  // finally, delete the previous set of walls
  try {
    await canvas.scene.deleteEmbeddedDocuments("Wall", idsToDelete);
  } catch (error) {
    console.error(error);
  }
};

const wallIdsToDelete = () => {
  const walls = canvas.scene.getEmbeddedCollection("Wall");
  const ids = [];
  for (const wall of walls) {
    const flag = wall.getFlag(constants.MODULE_NAME, "dungeonVersion");
    if (flag) {
      ids.push(wall.id);
    }
  }
  return ids;
};

const makeWallsFromMulti = (config, multi) => {
  let walls = [];
  for (let i = 0; i < multi.getNumGeometries(); i++) {
    const poly = multi.getGeometryN(i);
    walls = walls.concat(makeWallsFromPoly(config, poly));
  }
  return walls;
};

const makeWallsFromPoly = (config, poly) => {
  const allWalls = [];
  const exterior = poly.getExteriorRing();
  const coords = exterior.getCoordinates();
  for (let i = 0; i < coords.length - 1; i++) {
    const data = wallData(
      config,
      coords[i].x,
      coords[i].y,
      coords[i + 1].x,
      coords[i + 1].y
    );
    allWalls.push(data);
  }
  const numHoles = poly.getNumInteriorRing();
  for (let i = 0; i < numHoles; i++) {
    const hole = poly.getInteriorRingN(i);
    const coords = hole.getCoordinates();
    for (let i = 0; i < coords.length - 1; i++) {
      const data = wallData(
        config,
        coords[i].x,
        coords[i].y,
        coords[i + 1].x,
        coords[i + 1].y
      );
      allWalls.push(data);
    }
  }
  return allWalls;
};

/** [[x1,y1,x2,y2],...] */
const makeInteriorWalls = (config, walls) => {
  const allWalls = [];
  for (const wall of walls) {
    const data = wallData(config, wall[0], wall[1], wall[2], wall[3]);
    allWalls.push(data);
  }
  return allWalls;
};

/** [[x1,y1,x2,y2],...] */
const makeDoors = (config, doors) => {
  const allDoors = [];
  for (const door of doors) {
    const data = doorData(config, door[0], door[1], door[2], door[3]);
    allDoors.push(data);
  }
  return allDoors;
};

/** [[x1,y1,x2,y2],...] */
const makeSecretDoors = (config, doors) => {
  const allDoors = [];
  for (const door of doors) {
    const data = secretDoorData(config, door[0], door[1], door[2], door[3]);
    allDoors.push(data);
  }
  return allDoors;
};

const wallData = (config, x1, y1, x2, y2) => {
  const data = {
    // From Foundry API docs:
    // "The wall coordinates, a length-4 array of finite numbers [x0,y0,x1,y1]"
    c: [x1, y1, x2, y2],
    flags: {},
  };
  data.flags[constants.MODULE_NAME] = {};
  data.flags[constants.MODULE_NAME][constants.FLAG_DUNGEON_VERSION] =
    constants.DUNGEON_VERSION;
  // Maybe set Canvas3D flags
  if (Settings.threeDCanvasEnabled()) {
    data.flags["levels-3d-preview"] = {
      joinWall: true,
      wallDepth: config.wallThickness,
      wallSidesTexture: config.wallTexture,
      wallSidesTint: config.wallTexture
        ? config.wallTextureTint
        : config.wallColor,
      wallTexture: config.threeDWallTexture ?? config.wallTexture,
      wallTint: config.threeDWallTexture
        ? config.threeDWallTextureTint
        : config.wallTexture
        ? config.wallTextureTint
        : config.wallColor,
    };
  }
  return data;
};

const doorData = (config, x1, y1, x2, y2) => {
  const data = wallData(config, x1, y1, x2, y2);
  data.door = 1; // door
  // Maybe set Canvas3D flags
  if (Settings.threeDCanvasEnabled()) {
    data.flags["levels-3d-preview"]["joinWall"] = false;
    data.flags["levels-3d-preview"]["wallTexture"] = config.threeDDoorTexture;
    data.flags["levels-3d-preview"]["wallTint"] = config.threeDDoorTextureTint;
  }
  return data;
};

const secretDoorData = (config, x1, y1, x2, y2) => {
  const data = wallData(config, x1, y1, x2, y2);
  data.door = 2; // secret
  return data;
};
