import UUID from 'uuid-1345'
import { skipMcPrefix } from '../utils'
import { Vec3 } from 'vec3'

import * as plugins from './index'
import { CustomWorld } from './world'
import UserError from '../user_error'

export const server = function (serv: Server, options: Options) {
  const version = options.version

  const Entity = require('prismarine-entity')(version)
  const mcData = serv.mcData
  const mobsById = mcData.mobs
  const objectsById = mcData.objects

  serv.initEntity = (type, entityType, world, position) => {
    if (Object.keys(serv.entities).length > options['max-entities']) { throw new Error('Too many mobs !') }
    serv.entityMaxId++
    const entity = new Entity(serv.entityMaxId)

    for (const plugin of plugins.builtinPlugins) plugin.entity?.(entity, serv, options)

    entity.initEntity(type, entityType, world, position)

    serv.emit('newEntity', entity)

    return entity
  }

  serv.spawnObject = (type, world, position, { pitch = 0, yaw = 0, velocity = new Vec3(0, 0, 0), data = 1, itemId, itemDamage = 0, itemCount = 1, pickupTime = undefined, deathTime = undefined }) => {
    const object = serv.initEntity('object', type, world, position)
    object.uuid = UUID.v4()
    // TODO: don't use objectsById, it doesn't exist
    object.name = objectsById[type] === undefined ? 'unknown' : objectsById[type].name
    object.data = data
    object.velocity = velocity
    object.pitch = pitch
    object.yaw = yaw
    object.gravity = new Vec3(0, -20, 0)
    object.terminalvelocity = new Vec3(27, 27, 27)
    object.friction = new Vec3(15, 0, 15)
    object.size = new Vec3(0.25, 0.25, 0.25) // Hardcoded, will be dependent on type!
    object.deathTime = deathTime
    object.pickupTime = pickupTime
    object.itemId = itemId
    object.itemDamage = itemDamage
    object.itemCount = itemCount
    object.metadata = [
      { key: 0, type: 0, value: 0 },
      { key: 1, type: 1, value: 300 },
      { key: 2, type: 5 },
      { key: 3, type: 7, value: false },
      { key: 4, type: 7, value: false }
    ]
    let key = 5
    if (mcData.version['>=']('1.10')) {
      object.metadata.push({ key, type: 7, value: false })
      ++key
      if (mcData.version['>=']('1.14')) {
        object.metadata.push({ key, type: 18, value: 0 })
        ++key
      }
    }
    object.metadata.push(
      {
        key,
        type: 6,
        value: {
          present: true,
          itemId,
          itemCount
        }
      }
    )

    object.updateAndSpawn()
    return object
  }

  serv.spawnMob = (type, world, position, { pitch = 0, yaw = 0, headPitch = 0, velocity = new Vec3(0, 0, 0), metadata = [] } = {}) => {
    const mob = serv.initEntity('mob', type, world, position)
    mob.uuid = UUID.v4()
    mob.name = mobsById[type].name
    mob.velocity = velocity
    mob.pitch = pitch
    mob.headPitch = headPitch
    mob.yaw = yaw
    mob.gravity = new Vec3(0, -20, 0)
    mob.terminalvelocity = new Vec3(27, 27, 27)
    mob.friction = new Vec3(15, 0, 15)
    mob.size = new Vec3(0.75, 1.75, 0.75)
    mob.health = 20
    mob.metadata = metadata

    mob.updateAndSpawn()
    return mob
  }

  serv.destroyEntity = entity => {
    entity._writeOthersNearby('entity_destroy', {
      entityIds: [entity.id]
    })
    delete serv.entities[entity.id]
  }

  const entitiesByName = serv.mcData.entitiesByName

  serv.commands.add({
    base: 'summon',
    info: 'Summon an entity',
    usage: '/summon <entity_name>',
    onlyPlayer: true,
    tab: ['entity'],
    op: true,
    action (name, ctx) {
      if (Object.keys(serv.entities).length > options['max-entities']) { throw new UserError('Too many mobs !') }
      const entity = entitiesByName[skipMcPrefix(name)]
      if (!entity) {
        return 'No entity named ' + name
      }
      if (entity.type === 'mob') {
        serv.spawnMob(entity.id, ctx.player.world, ctx.player.position, {
          velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
        })
      } else if (entity.type === 'object') {
        serv.spawnObject(entity.id, ctx.player.world, ctx.player.position, {
          velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
        })
      }
    }
  })

  serv.commands.add({
    base: 'summonMany',
    info: 'Summon many entities',
    usage: '/summonMany <number> <entity_name>',
    tab: ['number', 'entity'],
    onlyPlayer: true,
    op: true,
    parse (str) {
      const args = str.split(' ')
      if (args.length !== 2) { return false }
      return { number: +args[0], name: args[1] }
    },
    action ({ number, name }, ctx) {
      if (Object.keys(serv.entities).length > options['max-entities'] - number) { throw new UserError('Too many mobs !') }
      const entity = entitiesByName[skipMcPrefix(name)]
      if (!entity) {
        return 'No entity named ' + name
      }
      const s = Math.floor(Math.sqrt(number))
      for (let i = 0; i < number; i++) {
        if (entity.type === 'mob') {
          serv.spawnMob(entity.id, ctx.player.world, ctx.player.position.offset(Math.floor(i / s * 10), 0, i % s * 10), {
            velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
          })
        } else if (entity.type === 'object') {
          serv.spawnObject(entity.id, ctx.player.world, ctx.player.position.offset(Math.floor(i / s * 10), 0, i % s * 10), {
            velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
          })
        }
      }
    }
  })

  serv.commands.add({
    base: 'pile',
    info: 'make a pile of entities',
    usage: '/pile <entities types>',
    onlyPlayer: true,
    op: true,
    parse (str) {
      const args = str.split(' ')
      if (args.length === 0) { return false }
      return args
        .map(name => entitiesByName[name])
        .filter(entity => !!entity)
    },
    action (entityTypes, ctx) {
      if (Object.keys(serv.entities).length > options['max-entities'] - entityTypes.length) { throw new UserError('Too many mobs !') }
      entityTypes.map(entity => {
        if (entity.type === 'mob') {
          return serv.spawnMob(entity.id, ctx.player.world, ctx.player.position, {
            velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
          })
        } else if (entity.type === 'object') {
          return serv.spawnObject(entity.id, ctx.player.world, ctx.player.position, {
            velocity: new Vec3((Math.random() - 0.5) * 10, Math.random() * 10 + 10, (Math.random() - 0.5) * 10)
          })
        } else {
          return Promise.resolve()
        }
      })
        .reduce((prec, entity) => {
          if (prec !== null) { prec.attach(entity) }
          return entity
        }, null)
    }
  })

  serv.commands.add({
    base: 'attach',
    info: 'attach an entity on an other entity',
    usage: '/attach <carrier> <attached>',
    op: true,
    parse (str, ctx) {
      const args = str.split(' ')
      if (args.length !== 2) { return false }

      const carrier = ctx.player ? ctx.player.selectorString(args[0]) : serv.selectorString(args[0])
      if (carrier.length === 0) throw new UserError('one carrier')
      const attached = ctx.player ? ctx.player.selectorString(args[1]) : serv.selectorString(args[1])
      if (attached.length === 0) throw new UserError('one attached')

      return { carrier: carrier[0], attached: attached[0] }
    },
    action ({ carrier, attached }) {
      carrier.attach(attached)
    }
  })
}

export const player = function (player: Player, serv: Server, options: Options) {
  const version = options.version
  const Item = require('prismarine-item')(version)

  player.spawnEntity = entity => {
    player._client.write(entity.spawnPacketName, entity.getSpawnPacket())
    if (serv.supportFeature('entityMetadataSentSeparately')) {
      entity.sendMetadata(entity.metadata)
    }
    if (typeof entity.itemId !== 'undefined') {
      if (serv.supportFeature('theFlattening')) {
        entity.sendMetadata([{
          key: 6,
          type: 6,
          value: {
            present: true,
            itemId: entity.itemId,
            itemCount: entity.itemCount
          }
        }])
      } else {
        entity.sendMetadata([{
          key: 10,
          type: 5,
          value: {
            blockId: entity.itemId,
            itemDamage: entity.itemDamage,
            itemCount: entity.itemCount
          }
        }])
      }
    }
    if (serv.supportFeature('allEntityEquipmentInOne')) {
      const equipments = [] as any[]
      entity.equipment.forEach((equipment, slot) => {
        if (equipment !== undefined) {
          equipments.push({
            slot,
            item: Item.toNotch(equipment)
          })
        }
      })
      if (equipments.length > 0) {
        player._client.write('entity_equipment', {
          entityId: entity.id,
          equipments
        })
      }
    } else {
      entity.equipment.forEach((equipment, slot) => {
        if (equipment !== undefined) {
          player._client.write('entity_equipment', {
            entityId: entity.id,
            slot,
            item: Item.toNotch(equipment)
          })
        }
      }
      )
    }
  }
}

export const entity = function (entity: Entity, serv: Server) {
  entity.initEntity = (type, entityType, world, position) => {
    entity.type = type
    entity.spawnPacketName = ''
    entity.entityType = entityType
    entity.world = world
    entity.position = position
    entity.lastPositionPlayersUpdated = entity.position.clone()
    entity.nearbyEntities = []
    entity.viewDistance = 150
    entity.score = {}

    entity.bornTime = Date.now()
    serv.entities[entity.id] = entity

    if (entity.type === 'player') entity.spawnPacketName = 'named_entity_spawn'
    else if (entity.type === 'object') entity.spawnPacketName = 'spawn_entity'
    else if (entity.type === 'mob') entity.spawnPacketName = 'spawn_entity_living'
  }

  entity.getSpawnPacket = () => {
    let scaledVelocity = entity.velocity.scaled(8000 / 20) // from fixed-position/second to unit => 1/8000 blocks per tick
    if (serv.supportFeature('fixedPointPosition')) {
      scaledVelocity = scaledVelocity.scaled(1 / 32)
    }
    scaledVelocity = scaledVelocity.floored()

    let entityPosition
    if (serv.supportFeature('fixedPointPosition')) {
      entityPosition = entity.position.scaled(32).floored()
    } else if (serv.supportFeature('doublePosition')) {
      entityPosition = entity.position
    }

    if (entity.type === 'player') {
      return {
        entityId: entity.id,
        playerUUID: entity.uuid,
        x: entityPosition.x,
        y: entityPosition.y,
        z: entityPosition.z,
        yaw: entity.yaw,
        pitch: entity.pitch,
        currentItem: 0,
        metadata: entity.metadata
      }
    } else if (entity.type === 'object') {
      return {
        entityId: entity.id,
        objectUUID: entity.uuid,
        type: entity.entityType,
        x: entityPosition.x,
        y: entityPosition.y,
        z: entityPosition.z,
        pitch: entity.pitch,
        yaw: entity.yaw,
        objectData: entity.data,
        velocityX: scaledVelocity.x,
        velocityY: scaledVelocity.y,
        velocityZ: scaledVelocity.z
      }
    } else if (entity.type === 'mob') {
      return {
        entityId: entity.id,
        entityUUID: entity.uuid,
        type: entity.entityType,
        x: entityPosition.x,
        y: entityPosition.y,
        z: entityPosition.z,
        yaw: entity.yaw,
        pitch: entity.pitch,
        headPitch: entity.headPitch,
        velocityX: scaledVelocity.x,
        velocityY: scaledVelocity.y,
        velocityZ: scaledVelocity.z,
        metadata: entity.metadata
      }
    }
  }

  entity.updateAndSpawn = () => {
    const updatedEntities = entity.getNearby()
    const entitiesToAdd = updatedEntities.filter(e => entity.nearbyEntities.indexOf(e) === -1)
    const entitiesToRemove = entity.nearbyEntities.filter(e => updatedEntities.indexOf(e) === -1)
    if (entity.type === 'player') {
      entity.despawnEntities(entitiesToRemove)
      entitiesToAdd.forEach(entity.spawnEntity)
    }
    entity.lastPositionPlayersUpdated = entity.position.clone()

    const playersToAdd = entitiesToAdd.filter(e => e.type === 'player')
    const playersToRemove = entitiesToRemove.filter(e => e.type === 'player')

    playersToRemove.forEach(p => p.despawnEntities([entity]))
    playersToRemove.forEach(p => { p.nearbyEntities = p.getNearby() })
    playersToAdd.forEach(p => p.spawnEntity(entity))
    playersToAdd.forEach(p => { p.nearbyEntities = p.getNearby() })

    entity.nearbyEntities = updatedEntities
  }

  entity.on('move', () => {
    if (entity.position.distanceTo(entity.lastPositionPlayersUpdated) > 2) { entity.updateAndSpawn() }
  })

  entity.destroy = () => {
    serv.destroyEntity(entity)
  }

  entity.attach = (attachedEntity, leash = false) => {
    if (serv.supportFeature('attachStackEntity') || (serv.supportFeature('setPassengerStackEntity') && leash)) {
      const p = {
        entityId: attachedEntity.id,
        vehicleId: entity.id,
        leash
      }
      if (entity.type === 'player') { entity._client.write('attach_entity', p) }
      entity._writeOthersNearby('attach_entity', p)
    }
    if (serv.supportFeature('setPassengerStackEntity')) {
      const p = {
        entityId: entity.id,
        passengers: [attachedEntity.id]
      }
      if (entity.type === 'player') { entity._client.write('set_passengers', p) }
      entity._writeOthersNearby('set_passengers', p)
    }
  }
}
declare global {
  interface Server {
    /** @internal */
    "initEntity": <T extends string>(type: T, entityType: any, world: CustomWorld, position: Vec3) => T extends 'player' ? Player : Entity
    /** @internal */
    "spawnObject": (type: any, world: any, position: any, { pitch, yaw, velocity, data, itemId, itemDamage, itemCount, pickupTime, deathTime }: { pitch?: number | undefined; yaw?: number | undefined; velocity?: any; data?: number | undefined; itemId?: any; itemDamage?: number | undefined; itemCount?: number | undefined; pickupTime?: number; deathTime?: number }) => any
    /** @internal */
    "spawnMob": (type: any, world: any, position: any, { pitch, yaw, headPitch, velocity, metadata }?: { pitch?: number | undefined; yaw?: number | undefined; headPitch?: number | undefined; velocity?: any; metadata?: any[] | undefined }) => any
    /** @internal */
    "destroyEntity": (entity: any) => void
  }
  interface Player {
    /** @internal */
    "spawnEntity": (entity: any) => void
  }
  interface Entity {
    /** Only applies to gravity, really. You can still apply a velocity larger than terminal velocity. */
    terminalvelocity: Vec3
    // todo should use nbt instead
    /** If a block drop, what item id */
    itemId?: number
    /** If a block drop, what item damage */
    itemDamage?: number
    /** @internal */
    itemCount?: number
    /** World object entity is in */
    world: CustomWorld
    /** @internal */
    spawnPacketName: string
    /** Numerical type of the entity. */
    entityType: number
    /** @internal */
    lastPositionPlayersUpdated: Vec3
    /** List of entities that the entity believes is nearby. */
    nearbyEntities: Entity[]
    /** How far away entities are loaded/unloaded (used for players ATM) */
    viewDistance: number
    /** @internal */
    score: Record<string, any>
    /** When an entity was born. Used with pickupTime and deathTime (time in epoch) */
    bornTime: number
    /** Metadata for the entity (not like block metadata/damage). Contains stuff like NBT. */
    metadata: any
    /** @internal */
    data: any
    /** Pitch of entity's head */
    headPitch: number
    /** @internal */
    despawnEntities: (arg0: any[]) => void
    /** @internal */
    spawnEntity: any
    /** @internal */
    "initEntity": (type: any, entityType: any, world: any, position: any) => void
    /** @internal */
    "getSpawnPacket": () => { entityId: any; playerUUID: any; x: any; y: any; z: any; yaw: any; pitch: any; currentItem: number; metadata: any; objectUUID?: any; type?: any; objectData?: any; velocityX?: any; velocityY?: any; velocityZ?: any; entityUUID?: any; headPitch?: undefined } | { entityId: any; objectUUID: any; type: any; x: any; y: any; z: any; pitch: any; yaw: any; objectData: any; velocityX: any; velocityY: any; velocityZ: any; playerUUID?: any; currentItem?: any; metadata?: any; entityUUID?: any; headPitch?: undefined } | { entityId: any; entityUUID: any; type: any; x: any; y: any; z: any; yaw: any; pitch: any; headPitch: any; velocityX: any; velocityY: any; velocityZ: any; metadata: any; playerUUID?: any; currentItem?: any; objectUUID?: any; objectData?: undefined } | undefined
    /** @internal */
    "updateAndSpawn": () => void
    /** @internal */
    "destroy": () => void
    /** @internal */
    "attach": (attachedEntity: any, leash?: boolean) => void
  }
}
